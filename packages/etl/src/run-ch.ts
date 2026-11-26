/**
 * `etl:ch`: monthly import of Switzerland's facilities into the shared directory,
 * `country = 'CH'`: the hospital and clinic sites of the FOPH's "Kennzahlen der Schweizer
 * Spitäler" (2023 edition) and the cantons' open lists of hospitals, nursing homes and pharmacies
 * (`sources/ch/sources.ts`), each under opendata.swiss's "Open use" terms with its source.
 *
 * download each list (retried) -> parse and guard each list (quarantine, floors, changes) ->
 * places (once: the BFS commune register and swisstopo's postcode directory) -> locate every
 * facility and merge the facilities two lists give (`combineChLists`) -> one merge transaction
 * (sites, facilities, activities, qualifications, absences, suppressions, derived fields, read
 * models, ANALYZE points as in #90) -> circuit breakers on Switzerland's own pages -> COMMIT ->
 * drain the outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps its rows: the run
 * imports the others, says so in `stats.sourceErrors`, and the command exits with code 3, as in
 * Austria, the UK, Spain and Italy. Without the FOPH's figures, the cantons' hospitals are not
 * read either (they would double the FOPH's sites). When no list can be read, or the postcode
 * directory cannot, the run fails and the pages stay as they are.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CH_HOSPITAL_FIGURES_YEAR } from "@apercura/core/country";
import { CH_DEFAULT_PROFESSIONS, CH_HOSPITAL_KINDS } from "@apercura/core/taxonomy";
import type { ChOptions } from "./config";
import {
	type AtSourceStats,
	checkBreakers,
	checkChPlaces,
	checkChSource,
	checkOrphans,
	type GuardCheck,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql } from "./lib/db";
import { downloadFile, inspectLocalFile, type SourceFile } from "./lib/files";
import {
	analyzeTables,
	applySuppressions,
	DERIVED_TABLES,
	enqueueSiteTags,
	MERGED_TABLES,
	orphanedPages,
	READ_MODEL_TABLES,
	recomputeDerived,
	refreshReadModels,
	syncTaxonomy,
	unpublishedExamples,
} from "./merge";
import {
	buildChBatch,
	markChMissing,
	mergeChActivities,
	mergeChPractitioners,
	mergeChQualifications,
	mergeChSites,
	stageCh,
} from "./merge-ch";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { parseBag } from "./sources/ch/bag";
import { parseCantonalSource } from "./sources/ch/cantons";
import { combineChLists } from "./sources/ch/combine";
import {
	ChLocator,
	fetchChPlaceSources,
	importChPlaces,
	parsePostcodeDirectory,
	readChPlaceSources,
} from "./sources/ch/places";
import { CH_POSTCODES, CH_SOURCES, type ChSourceId } from "./sources/ch/sources";
import type { ParseResult } from "./sources/ch/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size ceiling of a list: above it the file is not the list. */
const MAX_BYTES = 100 * 1024 * 1024;

export type ChRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = AtSourceStats & {
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousChRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runCh(options: ChOptions, log: Logger = console.log): Promise<ChRunOutcome> {
	const sql = connect(options.databaseUrl);
	const memory = startMemorySampler();
	try {
		const release = await acquireImportLock(sql);
		if (!release) throw new Error("Another import is running (advisory lock is held)");
		try {
			return await runLocked(sql, options, log, memory.peak);
		} finally {
			await release();
		}
	} finally {
		memory.stop();
		await sql.end();
	}
}

async function runLocked(
	sql: Sql,
	options: ChOptions,
	log: Logger,
	peakRss: () => number,
): Promise<ChRunOutcome> {
	const scope = { sources: options.sources, year: CH_HOSPITAL_FIGURES_YEAR };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('ch', 'running', ${JSON.stringify(scope)}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Switzerland, FOPH and cantons (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
	);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let files: SourceFile[] = [];
	const createdWorkDir = !options.workDir && !options.sourceDir;
	const workDir =
		options.workDir ??
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-ch-")));

	const finish = async (status: RunStatus, error?: string): Promise<ChRunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
		if (Object.keys(sourceErrors).length > 0) stats.sourceErrors = sourceErrors;
		const fileInfo = Object.fromEntries(
			files.map((file) => [
				file.key,
				{
					url: file.url,
					resolvedUrl: file.resolvedUrl,
					bytes: file.bytes,
					sha256: file.sha256,
					lastModified: file.lastModified,
				},
			]),
		);
		await sql`
			UPDATE directory.etl_runs SET
				status = ${status},
				files = ${JSON.stringify(fileInfo)}::text::jsonb,
				stats = ${JSON.stringify(stats)}::text::jsonb,
				guards = ${JSON.stringify(guards)}::text::jsonb,
				error = ${error ?? null},
				peak_rss_bytes = ${peakRss()},
				finished_at = now()
			WHERE id = ${runId}
		`;
		if (createdWorkDir && workDir) await rm(workDir, { recursive: true, force: true });
		return { runId, status, stats, guards, sourceErrors };
	};

	try {
		// 1. The lists: each on its own, so one failing download never stops the others.
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const source of options.sources) {
				const config = CH_SOURCES[source];
				try {
					const file = options.sourceDir
						? await inspectLocalFile(source, join(options.sourceDir, config.file), false)
						: await downloadFile({
								key: source,
								url: options.urls[source] ?? config.url,
								path: join(workDir ?? tmpdir(), config.file),
								text: false,
							});
					if (file.bytes < config.minBytes || file.bytes > MAX_BYTES) {
						throw new Error(`${file.bytes} bytes, outside ${config.minBytes}–${MAX_BYTES}`);
					}
					fetched.push(file);
					log(`${source}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
				} catch (error) {
					sourceErrors[source] = `fetch: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
				}
			}
			return fetched;
		});
		if (files.length === 0) return await finish("failed", "no list could be fetched");

		// The postcode directory locates every facility: without it nothing can be placed.
		const postcodes = await timer.run("fetch postcode directory", async () =>
			options.sourceDir
				? await inspectLocalFile("postcodes", join(options.sourceDir, CH_POSTCODES.file), false)
				: await downloadFile({
						key: "postcodes",
						url: options.postcodesUrl ?? CH_POSTCODES.url,
						path: join(workDir ?? tmpdir(), CH_POSTCODES.file),
						text: false,
					}),
		);
		if (postcodes.bytes < CH_POSTCODES.minBytes) {
			return await finish("failed", `postcode directory: ${postcodes.bytes} bytes`);
		}
		files.push(postcodes);

		const previous = await previousChRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			Object.keys(sourceErrors).length === 0 &&
			files.length === Object.keys(previous.files).length &&
			files.every((file) => previous.files?.[file.key]?.sha256 === file.sha256)
		) {
			log(`Lists unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkChApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country ch`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'CH'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Swiss places", async () =>
				importChPlaces(
					sql,
					options.sourceDir
						? await readChPlaceSources(options.sourceDir)
						: await fetchChPlaceSources(workDir ?? tmpdir(), options.today, {
								communes: options.communesUrl ?? undefined,
								postcodes: options.postcodesUrl ?? undefined,
							}),
					runId,
				),
			);
		}
		const locator = new ChLocator(parsePostcodeDirectory(await readFile(postcodes.path)));

		// 3. Parse and check each list.
		const results: ParseResult<ChSourceId>[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse lists", async () => {
			for (const file of files) {
				if (file.key === "postcodes") continue;
				const source = file.key as ChSourceId;
				let result: ParseResult<ChSourceId>;
				try {
					const data = await readFile(file.path);
					result =
						source === "bag"
							? ((await parseBag(data, CH_HOSPITAL_FIGURES_YEAR)) as ParseResult<ChSourceId>)
							: parseCantonalSource(source, data);
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// Objections: the rows of a suppressed facility are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "CH",
					idScheme: CH_SOURCES[source].idScheme,
				});
				result = {
					...result,
					rows: result.rows.filter(
						(row) => !suppressed.skip(source, [row.nationalId], 0, 1, row.professionCode),
					),
					quarantined: result.quarantined.filter(
						(line) => !suppressed.skip(source, line.sample.split("|"), -1, -1),
					),
				};
				suppressedLines[source] = suppressed.summary().CH ?? null;
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people: rowCount,
					quarantined: result.quarantined.length,
					bytes: file.bytes,
					skipped: result.skipped,
					counters: result.counters,
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkChSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} facilities, ${current.quarantined} quarantined, ${result.counters.namesShortened} names shortened`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no list passed its checks");
		const fileVerdict = verdict(
			guards.filter((check) =>
				results.some((result) => check.name.startsWith(`${result.source}.`)),
			),
			approved,
		);
		if (!fileVerdict.ok) {
			log(
				`Guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "list guards failed");
		}

		// The FOPH's figures first: the cantons' hospitals are merged into its sites.
		results.sort((a, b) => (a.source === "bag" ? -1 : b.source === "bag" ? 1 : 0));
		const combined = combineChLists(results, locator);
		stats.combine = combined.stats;
		if (combined.stats.hospitalsWithoutBag > 0) {
			log(
				`Without the FOPH's figures, ${combined.stats.hospitalsWithoutBag} hospitals of the cantons' lists are not read`,
			);
		}
		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => CH_SOURCES[source].registry);
		const batch = buildChBatch(combined.facilities);
		stats.batch = {
			facilities: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "CH",
			professions: [...CH_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageCh(tx, batch));
			merge.staged = staged;
			const placeChecks = checkChPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeChSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge facilities", () => mergeChPractitioners(tx));
			merge.activities = await timer.run("merge activities", () =>
				mergeChActivities(tx, loaded, CH_HOSPITAL_KINDS),
			);
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeChQualifications(tx),
			);
			merge.absences = await markChMissing(tx, loaded, CH_HOSPITAL_KINDS);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "CH");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "CH"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "CH"));
			merge.orphans = orphans.count;
			const breakers = [
				...placeChecks,
				// Suppressed pages were deleted before the refresh: they never count as unpublished.
				...checkBreakers(models.pages),
				...checkOrphans(orphans),
			];
			const breakerVerdict = verdict(breakers, approved);
			const [totals] = await tx<Record<string, number>[]>`
				SELECT
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CH' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CH' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ch-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ch-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "listPoint",
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ch-%' AND removed_at IS NULL AND geo_precision = 'city')::integer AS "localityPoint",
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ch-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CH')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CH' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'CH' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byCanton] = await tx<{ counts: Record<string, Record<string, number>> | null }[]>`
				SELECT jsonb_object_agg(canton, kinds) AS counts FROM (
					SELECT canton, jsonb_object_agg(profession_code, n) AS kinds FROM (
						SELECT pl.region_code AS canton, p.profession_code, count(DISTINCT p.id)::integer AS n
						FROM directory.practitioners p
						JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
						JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
						JOIN directory.places pl ON pl.id = s.place_id
						WHERE p.country = 'CH' AND p.status = 'active'
						GROUP BY 1, 2
					) x GROUP BY 1
				) y
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				byCanton: byCanton?.counts ?? {},
			};
			if (!breakerVerdict.ok) {
				merge.blockedExamples = examples;
				await tx.rollback();
				return { committed: false, merge, breakers, verdict: breakerVerdict };
			}
			if (options.dryRun) {
				await tx.rollback();
				return { committed: false, merge, breakers, verdict: breakerVerdict };
			}
			return { committed: true, merge, breakers, verdict: breakerVerdict };
		});
		Object.assign(stats, merged.merge);
		guards.push(...merged.breakers);

		if (!merged.committed) {
			if (!merged.verdict.ok) {
				log(
					`Circuit breaker tripped, rolled back: ${merged.verdict.blocking.map((check) => check.detail).join("; ")}`,
				);
				log(`Review run ${runId}, then rerun with --approve=${runId}`);
				return await finish("blocked", "circuit breaker");
			}
			log("Dry run: rolled back");
			return await finish("dry_run");
		}

		// 5. After COMMIT: drain the cache invalidation outbox.
		stats.outbox = await timer.run("revalidation", () =>
			drainOutbox(sql, { appUrl: options.appUrl, secret: options.revalidateSecret, log }),
		);
		return await finish("succeeded");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`Run ${runId} failed: ${message}`);
		await finish("failed", message).catch(() => {});
		throw error;
	}
}

/**
 * The last successful Swiss run (the lists compared against), or null when it left a list out:
 * such a run never makes the next one skip.
 */
async function previousChRun(sql: Sql): Promise<PreviousChRun | null> {
	const [row] = await sql<(PreviousChRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial
		FROM directory.etl_runs
		WHERE source = 'ch' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A list's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'ch' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Swiss run that saw exactly the same lists. */
async function checkChApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'ch'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Swiss run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
