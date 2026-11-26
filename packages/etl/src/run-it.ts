/**
 * `etl:it`: weekly import of Italy's pharmacies, parapharmacies, hospitals and accredited
 * private clinics into the shared directory, `country = 'IT'`, from the open data of the
 * Ministry of Health (Italian Open Data Licence 2.0, citing the source): the daily lists of
 * pharmacies and parapharmacies and the latest yearly hospital bed counts.
 *
 * resolve each list's current file on the portal -> download (checksummed, retried) -> guards
 * per list (quarantine, line and place floors, place and size changes) -> places (once: ISTAT's
 * boundaries) -> one merge transaction (sites, places, activities, qualifications, absences,
 * suppressions, derived fields, read models, ANALYZE points as in #90) -> circuit breakers on
 * Italy's own pages -> COMMIT -> drain the outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps its rows: the run
 * imports the others, says so in `stats.sourceErrors`, and the command exits with code 3, as in
 * Austria, the UK and Spain. When none can be read the run fails and the pages stay as they are.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IT_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { ItOptions } from "./config";
import {
	checkBreakers,
	checkItPlaces,
	checkItSource,
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
	buildItBatch,
	markItMissing,
	mergeItActivities,
	mergeItPractitioners,
	mergeItQualifications,
	mergeItSites,
	stageIt,
} from "./merge-it";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { parseItSource } from "./sources/it/ministry";
import { fetchItPlaceSources, importItPlaces, readItPlaceSources } from "./sources/it/places";
import { resolveItSourceUrl } from "./sources/it/portal";
import { IT_SOURCES, type ItSourceId, type ParseResult } from "./sources/it/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of a list: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 200 * 1024 * 1024 };

export type ItRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
	/** The hospital bed counts' year (`Anno`). */
	year?: number | null;
};

type PreviousItRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
	registerCoordinates: boolean;
};

export async function runIt(options: ItOptions, log: Logger = console.log): Promise<ItRunOutcome> {
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
	options: ItOptions,
	log: Logger,
	peakRss: () => number,
): Promise<ItRunOutcome> {
	const scope = {
		sources: options.sources,
		asOf: options.asOf,
		registerCoordinates: options.registerCoordinates,
	};
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('it', 'running', ${JSON.stringify(scope)}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Italy, Ministero della Salute (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-it-")));

	const finish = async (status: RunStatus, error?: string): Promise<ItRunOutcome> => {
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
				try {
					const file = options.sourceDir
						? await inspectLocalFile(
								source,
								join(options.sourceDir, IT_SOURCES[source].file),
								false,
							)
						: await downloadFile({
								key: source,
								url: options.urls[source] ?? (await resolveItSourceUrl(source, options.portalUrl)),
								path: join(workDir ?? tmpdir(), IT_SOURCES[source].file),
								text: false,
							});
					if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
						throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
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

		const previous = await previousItRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			previous.registerCoordinates === options.registerCoordinates &&
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
		const approved = await checkItApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country it`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'IT'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Italian places", async () =>
				importItPlaces(
					sql,
					options.sourceDir
						? await readItPlaceSources(options.sourceDir)
						: await fetchItPlaceSources(options.placesUrl, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 3. Parse and check each list.
		const results: ParseResult[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse lists", async () => {
			for (const file of files) {
				const source = file.key as ItSourceId;
				let result: ParseResult & { year?: number | null };
				try {
					result = parseItSource(source, await readFile(file.path), {
						asOf: options.asOf,
						registerCoordinates: options.registerCoordinates,
					});
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed place are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "IT",
					idScheme: IT_SOURCES[source].idScheme,
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
				suppressedLines[source] = suppressed.summary().IT ?? null;
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people: rowCount,
					quarantined: result.quarantined.length,
					bytes: file.bytes,
					skipped: result.skipped,
					counters: result.counters,
					...(result.year !== undefined ? { year: result.year } : {}),
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkItSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} places, ${current.quarantined} quarantined, ${result.counters.namesShortened} names shortened`,
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

		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => IT_SOURCES[source].siteSource);
		const batch = buildItBatch(results);
		stats.batch = {
			places: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "IT",
			professions: [...IT_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageIt(tx, batch));
			merge.staged = staged;
			const placeChecks = checkItPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeItSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge places", () => mergeItPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeItActivities(tx, loaded));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeItQualifications(tx),
			);
			merge.absences = await markItMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "IT");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "IT"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "IT"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'IT' AND status = 'active')::integer AS places,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'IT' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'it-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'it-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'it-%' AND removed_at IS NULL AND geo_source = 'source')::integer AS "registerPoint",
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'it-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'IT')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'IT' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'IT' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byPlaceKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'none') AS kind, count(*)::integer AS n
					FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
					WHERE s.source LIKE 'it-%' AND s.removed_at IS NULL GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				sitesByPlaceKind: byPlaceKind?.counts ?? {},
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
 * The last successful Italian run (the lists compared against), or null when it left a list
 * out: such a run never makes the next one skip.
 */
async function previousItRun(sql: Sql): Promise<PreviousItRun | null> {
	const [row] = await sql<
		(Omit<PreviousItRun, "registerCoordinates"> & {
			partial: boolean;
			registerCoordinates: boolean | null;
		})[]
	>`
		SELECT id, files, stats ? 'sourceErrors' AS partial,
			(scope ->> 'registerCoordinates')::boolean AS "registerCoordinates"
		FROM directory.etl_runs
		WHERE source = 'it' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial
		? { id: row.id, files: row.files, registerCoordinates: row.registerCoordinates ?? false }
		: null;
}

/** A list's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'it' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Italian run that saw exactly the same lists. */
async function checkItApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'it'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not an Italian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
