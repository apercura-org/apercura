/**
 * `etl:cy`: monthly import of Cyprus's facilities into the shared directory, `country = 'CY'`,
 * from the Ministry of Health's open lists on data.gov.cy (CC BY 4.0): the Pharmaceutical
 * Services' private pharmacies, the state hospitals and the state health centres.
 *
 * download each list (checksummed, retried) -> an unchanged set of files ends the run (exit 0,
 * a cheap no-op) -> guards per list (quarantine, line and row floors, changes since the last
 * success) -> places (once: CYSTAT's census municipalities and communities, Cyprus Post's
 * postcodes and centres) -> placing -> one merge transaction (sites, facilities, activities,
 * absences, suppressions, derived fields, read models, ANALYZE points as in #90) -> circuit
 * breakers on Cyprus's own pages -> COMMIT -> drain the outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps its rows: the run
 * imports the others, says so in `stats.sourceErrors`, and the command exits with code 3, as in
 * the other markets. The pharmacist each pharmacy is listed under, and their home telephone
 * number, are never read (`sources/cy/pharmacies.ts`).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CY_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { CyOptions } from "./config";
import {
	checkBreakers,
	checkCyPlaces,
	checkCySource,
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
	buildCyBatch,
	markCyMissing,
	mergeCyActivities,
	mergeCyPractitioners,
	mergeCySites,
	stageCy,
} from "./merge-cy";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { parsePharmacies } from "./sources/cy/pharmacies";
import {
	fetchCyPlaceSources,
	importCyPlaces,
	loadCyPlaceIndex,
	readCyPlaceSources,
} from "./sources/cy/places";
import { parseHealthCentres, parseHospitals } from "./sources/cy/state";
import { CY_FILES, CY_SOURCES, type CySourceId, type ParseResult } from "./sources/cy/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of a file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 200, max: 20 * 1024 * 1024 };

export type CyRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousCyRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

const PARSERS: Readonly<Record<CySourceId, (data: Buffer) => ParseResult>> = {
	farmakeia: parsePharmacies,
	nosokomeia: parseHospitals,
	kentra: parseHealthCentres,
};

export async function runCy(options: CyOptions, log: Logger = console.log): Promise<CyRunOutcome> {
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
	options: CyOptions,
	log: Logger,
	peakRss: () => number,
): Promise<CyRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('cy', 'running', ${JSON.stringify({ sources: options.sources })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Cyprus, the Ministry of Health's lists (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-cy-")));

	const finish = async (status: RunStatus, error?: string): Promise<CyRunOutcome> => {
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
			for (const key of options.sources) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(key, join(options.sourceDir, CY_FILES[key]), false)
						: await downloadFile({
								key,
								url: options.urls[key],
								path: join(workDir ?? tmpdir(), CY_FILES[key]),
								text: false,
							});
					if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
						throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
					}
					fetched.push(file);
					log(
						`${key}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)} (${file.resolvedUrl})`,
					);
				} catch (error) {
					const message = `fetch: ${error instanceof Error ? error.message : String(error)}`;
					sourceErrors[key] = message;
					log(`${key}: left out of this run (${message})`);
				}
			}
			return fetched;
		});
		if (files.length === 0) return await finish("failed", "no Cypriot list could be fetched");

		const previous = await previousCyRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			Object.keys(sourceErrors).length === 0 &&
			files.length === Object.keys(previous.files).length &&
			files.every((file) => previous.files?.[file.key]?.sha256 === file.sha256)
		) {
			log(`Files unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkCyApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country cy`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'CY'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Cypriot places", async () =>
				importCyPlaces(
					sql,
					options.sourceDir
						? await readCyPlaceSources(options.sourceDir)
						: await fetchCyPlaceSources(options.placesUrls, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 3. Parse and check each list.
		const results: ParseResult[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse sources", async () => {
			for (const source of options.sources) {
				if (sourceErrors[source]) continue;
				const file = files.find((candidate) => candidate.key === source);
				if (!file) continue;
				let result: ParseResult;
				try {
					result = PARSERS[source](await readFile(file.path));
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed facility are dropped here, before anything
				// is staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "CY",
					idScheme: CY_SOURCES[source].scheme,
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
				suppressedLines[source] = suppressed.summary().CY ?? null;
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
				const checks = checkCySource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} listed, ${current.quarantined} quarantined, skipped ${JSON.stringify(result.skipped)}, ${JSON.stringify(result.counters)}`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no Cypriot list passed its checks");
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
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "source guards failed");
		}

		// 4. Placing.
		const placeIndex = await loadCyPlaceIndex(sql);
		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => CY_SOURCES[source].siteSource);
		const batch = buildCyBatch(results, placeIndex);
		stats.batch = {
			facilities: batch.people.length,
			sites: batch.sites.length,
			placement: batch.placement,
		};
		log(
			`placed: ${batch.placement.byPostcode} by postcode, ${batch.placement.byName} by name, ${batch.placement.byPoint} by point, ${batch.placement.unplaced} left out; ${batch.placement.point} at the list's point, ${batch.placement.centre} at their place's centre`,
		);

		// 5. Merge, in one transaction.
		const ctx = {
			runId,
			country: "CY",
			professions: [...CY_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			merge.staged = await timer.run("stage", () => stageCy(tx, batch));
			const placeChecks = checkCyPlaces(batch.placement);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeCySites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge facilities", () => mergeCyPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeCyActivities(tx, loaded));
			merge.absences = await markCyMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "CY");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "CY"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "CY"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CY' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CY' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'CY' AND source LIKE 'cy-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'CY' AND source LIKE 'cy-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'CY' AND source LIKE 'cy-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'CY' AND source LIKE 'cy-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'CY' AND source LIKE 'cy-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CY')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CY' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'CY' AND status = 'active' GROUP BY 1
				) x
			`;
			merge.totals = { ...totals, byProfession: byProfession?.counts ?? {} };
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

		// 6. After COMMIT: drain the cache invalidation outbox.
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
 * The last successful Cypriot run (the files compared against), or null when it left a list
 * out: such a run never makes the next one skip.
 */
async function previousCyRun(sql: Sql): Promise<PreviousCyRun | null> {
	const [row] = await sql<(PreviousCyRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial FROM directory.etl_runs
		WHERE source = 'cy' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A list's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: CySourceId): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'cy' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Cypriot run that saw exactly the same files. */
async function checkCyApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'cy'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Cypriot run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
