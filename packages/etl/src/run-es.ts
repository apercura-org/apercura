/**
 * `etl:es`: weekly import of Spain's health centres into the shared directory, `country = 'ES'`,
 * from the monthly extracts of the General Register of health centres, services and
 * establishments (REGCESS, Ministerio de Sanidad; reuse under Ley 37/2007, citing the source and
 * its date): hospitals (C1), centres without inpatient care (C2) and establishments (E).
 *
 * download each extract (checksummed, retried) -> guards per extract (quarantine, line and
 * centre floors, row and size changes) -> places (once: the IGN's units and population
 * centres) -> one merge transaction (sites, centres, activities, care units, absences,
 * suppressions, derived fields, read models, ANALYZE points as in #90) -> circuit breakers on
 * Spain's own pages -> COMMIT -> drain the outbox.
 *
 * An extract that cannot be downloaded or read is left out of the run and keeps its rows: the
 * run imports the others, says so in `stats.sourceErrors`, and the command exits with code 3,
 * as in Austria and the UK. When none can be read the run fails and the pages stay as they are.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ES_ID_SCHEME } from "@apercura/core";
import { ES_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { EsOptions } from "./config";
import {
	checkBreakers,
	checkEsPlaces,
	checkEsSource,
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
	buildEsBatch,
	markEsMissing,
	mergeEsActivities,
	mergeEsPractitioners,
	mergeEsQualifications,
	mergeEsSites,
	stageEs,
} from "./merge-es";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { fetchEsPlaceSources, importEsPlaces, readEsPlaceSources } from "./sources/es/places";
import { parseRegcess } from "./sources/es/regcess";
import { ES_SOURCES, type EsSourceId, type ParseResult } from "./sources/es/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of an extract: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 5_000, max: 200 * 1024 * 1024 };

export type EsRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousEsRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runEs(options: EsOptions, log: Logger = console.log): Promise<EsRunOutcome> {
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
	options: EsOptions,
	log: Logger,
	peakRss: () => number,
): Promise<EsRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('es', 'running', ${JSON.stringify({ sources: options.sources })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Spain, REGCESS (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-es-")));

	const finish = async (status: RunStatus, error?: string): Promise<EsRunOutcome> => {
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
		// 1. The extracts: each on its own, so one failing download never stops the others.
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const source of options.sources) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(
								source,
								join(options.sourceDir, ES_SOURCES[source].file),
								false,
							)
						: await downloadFile({
								key: source,
								url: options.urls[source],
								path: join(workDir ?? tmpdir(), ES_SOURCES[source].file),
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
		if (files.length === 0) return await finish("failed", "no REGCESS extract could be fetched");

		const previous = await previousEsRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			Object.keys(sourceErrors).length === 0 &&
			files.length === Object.keys(previous.files).length &&
			files.every((file) => previous.files?.[file.key]?.sha256 === file.sha256)
		) {
			log(`Extracts unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkEsApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country es`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'ES'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Spanish places", async () =>
				importEsPlaces(
					sql,
					options.sourceDir
						? await readEsPlaceSources(options.sourceDir)
						: await fetchEsPlaceSources(options.placesBase),
					runId,
				),
			);
		}

		// 3. Parse and check each extract.
		const results: ParseResult[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse extracts", async () => {
			for (const file of files) {
				const source = file.key as EsSourceId;
				let result: ParseResult;
				try {
					result = await parseRegcess(source, await readFile(file.path));
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the extract holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed centre are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "ES",
					idScheme: ES_ID_SCHEME,
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
				suppressedLines[source] = suppressed.summary().ES ?? null;
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
				const checks = checkEsSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} centres, ${current.quarantined} quarantined, ${result.counters.sharedPhones} shared numbers left out`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no REGCESS extract passed its checks");
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
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "extract guards failed");
		}

		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => ES_SOURCES[source].siteSource);
		const batch = buildEsBatch(results);
		stats.batch = {
			centres: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "ES",
			professions: [...ES_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageEs(tx, batch));
			merge.staged = staged;
			const placeChecks = checkEsPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeEsSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge centres", () => mergeEsPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeEsActivities(tx, loaded));
			merge.qualifications = await timer.run("merge care units", () => mergeEsQualifications(tx));
			merge.absences = await markEsMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "ES");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "ES"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "ES"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'ES' AND status = 'active')::integer AS centres,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'ES' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'es-regcess-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'es-regcess-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'es-regcess-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'es-regcess-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'ES')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'ES' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'ES' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'ES' AND indexable GROUP BY 1
				) x
			`;
			const [byPlaceKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'none') AS kind, count(*)::integer AS n
					FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
					WHERE s.source LIKE 'es-regcess-%' AND s.removed_at IS NULL GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				indexableByListing: byListing?.counts ?? {},
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
 * The last successful Spanish run (the extracts compared against), or null when it left an
 * extract out: such a run never makes the next one skip.
 */
async function previousEsRun(sql: Sql): Promise<PreviousEsRun | null> {
	const [row] = await sql<(PreviousEsRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial FROM directory.etl_runs
		WHERE source = 'es' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** An extract's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'es' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Spanish run that saw exactly the same extracts. */
async function checkEsApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'es'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Spanish run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the extracts changed since run ${runId}; review again`);
	return true;
}
