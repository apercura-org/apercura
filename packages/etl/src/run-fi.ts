/**
 * `etl:fi`: weekly import of Finland's public health service locations into the shared
 * directory, `country = 'FI'`, from the Finnish Service Catalogue (Suomi.fi-palvelutietovaranto,
 * PTV, the Digital and Population Data Services Agency's open API, CC0 1.0).
 *
 * snapshot of the catalogue's health service locations (`ptv.json`: the health services, their
 * service locations and organisations, fetched page by page, retried; checksummed) -> guards
 * (quarantine, location floors, snapshot date, changes since the last success) -> places (once:
 * Statistics Finland's regions, wellbeing services counties and municipalities) -> placing ->
 * one merge transaction (sites, locations, activities, qualifications, absences, suppressions,
 * derived fields, read models, ANALYZE points as in #90) -> circuit breakers on Finland's own
 * pages -> COMMIT -> drain the outbox.
 *
 * One source: when the catalogue cannot be fetched or read the run fails (exit code 1) and the
 * pages stay as they are, `sourceErrors` saying why, as in Poland. The catalogue is live, so a
 * blocked run keeps its snapshot and is approved on that same file (`--approve=<id>
 * --source-dir <dir>`, the directory the run names).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FI_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { FiOptions } from "./config";
import {
	checkBreakers,
	checkFiPlaces,
	checkFiSource,
	checkOrphans,
	type GuardCheck,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql } from "./lib/db";
import { inspectLocalFile, type SourceFile } from "./lib/files";
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
	buildFiBatch,
	markFiMissing,
	mergeFiActivities,
	mergeFiPractitioners,
	mergeFiQualifications,
	mergeFiSites,
	stageFi,
} from "./merge-fi";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import {
	fetchFiPlaceSources,
	importFiPlaces,
	loadFiPlaceIndex,
	readFiPlaceSources,
} from "./sources/fi/places";
import { fetchPtvSnapshot, parsePtv } from "./sources/fi/ptv";
import { FI_FILES, FI_SOURCES, type FiSourceId, type ParseResult } from "./sources/fi/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of the snapshot: outside them it is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 400 * 1024 * 1024 };

export type FiRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	edition: number | null;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

const SOURCE: FiSourceId = "ptv";

export async function runFi(options: FiOptions, log: Logger = console.log): Promise<FiRunOutcome> {
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
	options: FiOptions,
	log: Logger,
	peakRss: () => number,
): Promise<FiRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('fi', 'running', ${JSON.stringify({ sources: [SOURCE], asOf: options.today })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Finland, the Finnish Service Catalogue's health service locations as of ${options.today}${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-fi-")));

	const finish = async (status: RunStatus, error?: string): Promise<FiRunOutcome> => {
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
		if (createdWorkDir && workDir) {
			// A blocked run keeps its snapshot: the catalogue is live, so only the same file can be
			// approved (`--approve=<id> --source-dir <dir>`).
			if (status === "blocked") {
				log(`Snapshot kept in ${workDir}: rerun with --approve=${runId} --source-dir ${workDir}`);
			} else {
				await rm(workDir, { recursive: true, force: true });
			}
		}
		return { runId, status, stats, guards, sourceErrors };
	};

	try {
		// 1. The snapshot: the catalogue's health service locations, or the file of `--source-dir`.
		try {
			const file = await timer.run("fetch the catalogue", async () => {
				if (options.sourceDir) {
					return inspectLocalFile(SOURCE, join(options.sourceDir, FI_FILES.ptv), false);
				}
				const path = join(workDir ?? tmpdir(), FI_FILES.ptv);
				const snapshot = await fetchPtvSnapshot(options.ptvUrl, path, {
					concurrency: options.concurrency,
					today: options.today,
					log,
				});
				log(
					`ptv: ${snapshot.services} health services, ${snapshot.channels} service locations, ${snapshot.organizations} organisations (${snapshot.requests} requests)`,
				);
				stats.fetch = snapshot;
				const inspected = await inspectLocalFile(SOURCE, path, false);
				return { ...inspected, url: options.ptvUrl, resolvedUrl: options.ptvUrl };
			});
			if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
				throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
			}
			files = [file];
			log(`ptv: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
		} catch (error) {
			sourceErrors[SOURCE] = `fetch: ${error instanceof Error ? error.message : String(error)}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}
		const [file] = files;
		if (!file) return await finish("failed", "the catalogue could not be fetched");
		const previous = await previousFiRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			previous.files[file.key]?.sha256 === file.sha256
		) {
			log(`Snapshot unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkFiApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country fi`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'FI'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Finnish places", async () =>
				importFiPlaces(
					sql,
					options.sourceDir
						? await readFiPlaceSources(options.sourceDir)
						: await fetchFiPlaceSources(options.placesUrls, workDir ?? tmpdir()),
					runId,
					log,
				),
			);
		}

		// 3. Parse and check the snapshot.
		let result: ParseResult;
		try {
			result = await timer.run("parse the catalogue", async () =>
				parsePtv(await readFile(file.path)),
			);
		} catch (error) {
			sourceErrors[SOURCE] = `parse: ${error instanceof Error ? error.message : String(error)}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}
		// Counted as the source holds them: a suppression never looks like a shrinking list.
		const rowCount = result.rows.length;
		// GDPR objections: the rows of a suppressed location are dropped here, before anything is
		// staged, and so are quarantined samples that name one (#116).
		const suppressed = await SuppressedLines.load(sql, {
			country: "FI",
			idScheme: FI_SOURCES[SOURCE].scheme,
		});
		result = {
			...result,
			rows: result.rows.filter(
				(row) => !suppressed.skip(SOURCE, [row.nationalId], 0, 1, row.professionCode),
			),
			quarantined: result.quarantined.filter(
				(line) => !suppressed.skip(SOURCE, [line.sample], 0, 1),
			),
		};
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {
			[SOURCE]: suppressed.summary().FI ?? null,
		};
		const current: SourceStats = {
			lines: result.lines,
			rows: rowCount,
			people: rowCount,
			quarantined: result.quarantined.length,
			bytes: file.bytes,
			edition: result.edition,
			skipped: result.skipped,
			counters: result.counters,
		};
		stats.sources = { [SOURCE]: current };
		stats.quarantine = {
			samples: result.quarantined
				.slice(0, 20)
				.map((line) => ({ source: SOURCE, lineNo: line.lineNo, reason: line.reason })),
		};
		stats.suppressedLines = suppressedLines;
		const before = await previousSourceStats(sql);
		const checks = checkFiSource(SOURCE, current, before);
		guards.push(...checks);
		log(
			`ptv: ${result.lines} service locations, ${rowCount} listed (snapshot of ${result.edition ?? "?"}), ${current.quarantined} quarantined, skipped ${JSON.stringify(result.skipped)}`,
		);
		const fileVerdict = verdict(checks, approved);
		if (!fileVerdict.ok) {
			const detail = fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`);
			log(`Guards failed: ${detail.join("; ")}`);
			if (!fileVerdict.approvable) sourceErrors[SOURCE] = `guards: ${detail.join("; ")}`;
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "source guards failed");
		}

		// 4. Placing.
		const placeIndex = await loadFiPlaceIndex(sql);
		const batch = buildFiBatch([result], placeIndex);
		stats.batch = {
			locations: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
			placement: batch.placement,
		};
		log(
			`placed: ${batch.placement.point} at the catalogue's point, ${batch.placement.municipality} at their municipality's centre, ${batch.placement.unplaced} left out`,
		);

		// 5. Merge, in one transaction.
		const siteSources = [FI_SOURCES[SOURCE].siteSource];
		const ctx = {
			runId,
			country: "FI",
			professions: [...FI_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			merge.staged = await timer.run("stage", () => stageFi(tx, batch));
			const placeChecks = checkFiPlaces(batch.placement);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeFiSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge locations", () => mergeFiPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeFiActivities(tx, [SOURCE]));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeFiQualifications(tx),
			);
			merge.absences = await markFiMissing(tx, [SOURCE]);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "FI");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "FI"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "FI"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'FI' AND status = 'active')::integer AS locations,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'FI' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'FI' AND source LIKE 'fi-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'FI' AND source LIKE 'fi-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'FI' AND source LIKE 'fi-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'FI' AND source LIKE 'fi-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'FI' AND source LIKE 'fi-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'FI')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'FI' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'FI' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'FI' AND indexable GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				indexableByListing: byListing?.counts ?? {},
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

/** The last successful Finnish run, whose snapshot an unchanged one is compared with. */
async function previousFiRun(
	sql: Sql,
): Promise<{ id: number; files: Record<string, { sha256: string }> | null } | null> {
	const [row] = await sql<{ id: number; files: Record<string, { sha256: string }> | null }[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'fi' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** The source's stats in the last successful run. */
async function previousSourceStats(sql: Sql): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${SOURCE} AS stats FROM directory.etl_runs
		WHERE source = 'fi' AND status = 'succeeded' AND stats -> 'sources' ? ${SOURCE}
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Finnish run that saw exactly the same snapshot. */
async function checkFiApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'fi'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Finnish run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
