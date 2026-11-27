/**
 * `etl:ee`: weekly import of Estonia's healthcare providers and pharmacies into the shared
 * directory, `country = 'EE'`, from the Health Board's register of providers and their activity
 * licences (Terviseamet, MEDRE open data, CC BY-NC-SA 3.0) and the State Agency of Medicines'
 * register of pharmacies (Ravimiamet, CC0 1.0), located with the Land and Spatial Development
 * Board's addresses (ADS, CC0 1.0).
 *
 * download each file (checksummed, retried) -> an unchanged set of files ends the run (exit 0,
 * a cheap no-op) -> guards per source (quarantine, line and provider floors, extract date,
 * changes since the last success) -> places (once: EHAK's counties, municipalities and
 * settlements) -> the addresses the sources name, read from the ADS file -> placing -> one
 * merge transaction (sites, providers, activities, qualifications, absences, suppressions,
 * derived fields, read models, ANALYZE points as in #90) -> circuit breakers on Estonia's own
 * pages -> COMMIT -> drain the outbox.
 *
 * A source that cannot be downloaded or read is left out of the run and keeps its rows: the run
 * imports the other, says so in `stats.sourceErrors`, and the command exits with code 3, as in
 * the other markets. The ADS file locates both: when it cannot be read the run fails and the
 * pages stay as they are.
 *
 * The Health Board's data is under CC BY-NC-SA 3.0: an operator who would use it commercially
 * must not import it (docs/self-hosting.md).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EE_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { EeOptions } from "./config";
import {
	checkBreakers,
	checkEePlaces,
	checkEeSource,
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
	adsLookups,
	buildEeBatch,
	markEeMissing,
	mergeEeActivities,
	mergeEePractitioners,
	mergeEeQualifications,
	mergeEeSites,
	stageEe,
} from "./merge-ee";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { readAdsIndex } from "./sources/ee/ads";
import { parseMedre } from "./sources/ee/medre";
import { fetchPharmacies, parsePharmacies } from "./sources/ee/pharmacies";
import {
	fetchEePlaceSources,
	importEePlaces,
	loadEePlaceIndex,
	readEePlaceSources,
} from "./sources/ee/places";
import {
	EE_FILES,
	EE_SOURCES,
	type EeFileId,
	type EeSourceId,
	type ParseResult,
} from "./sources/ee/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of a file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 200 * 1024 * 1024 };

/**
 * The ADS file holds about 1.4 million addresses: fewer than this in a real download means a
 * truncated one (the synthetic fixtures, read with `--source-dir`, are exempt).
 */
const MIN_ADS_LINES = 500_000;

export type EeRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

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

type PreviousEeRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runEe(options: EeOptions, log: Logger = console.log): Promise<EeRunOutcome> {
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

/** Downloads one file: the pharmacies' export through its search page, the others directly. */
async function fetchFile(key: EeFileId, url: string, path: string): Promise<SourceFile> {
	if (key !== "apteegid") return downloadFile({ key, url, path, text: false });
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const resolvedUrl = await fetchPharmacies(url, path);
			const file = await inspectLocalFile(key, path, false);
			return { ...file, url, resolvedUrl };
		} catch (error) {
			lastError = error;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
		}
	}
	throw new Error(
		`Download of apteegid failed after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
}

async function runLocked(
	sql: Sql,
	options: EeOptions,
	log: Logger,
	peakRss: () => number,
): Promise<EeRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('ee', 'running', ${JSON.stringify({ sources: options.sources, asOf: options.today })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Estonia, Health Board providers and pharmacies (${options.sources.join(", ")}) as of ${options.today}${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-ee-")));

	const finish = async (status: RunStatus, error?: string): Promise<EeRunOutcome> => {
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
		// 1. The files: each on its own, so one failing download never stops the other.
		const keys: EeFileId[] = [...options.sources, "ads"];
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const key of keys) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(key, join(options.sourceDir, EE_FILES[key]), false)
						: await fetchFile(key, options.urls[key], join(workDir ?? tmpdir(), EE_FILES[key]));
					if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
						throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
					}
					fetched.push(file);
					log(
						`${key}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)} (${file.resolvedUrl})`,
					);
				} catch (error) {
					const message = `fetch: ${error instanceof Error ? error.message : String(error)}`;
					if (key === "ads") throw new Error(`the ADS address file: ${message}`);
					sourceErrors[key] = message;
					log(`${key}: left out of this run (${message})`);
				}
			}
			return fetched;
		});
		if (!files.some((file) => file.key !== "ads")) {
			return await finish("failed", "no Estonian source could be fetched");
		}

		const previous = await previousEeRun(sql);
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
		const approved = await checkEeApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country ee`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'EE'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Estonian places", async () =>
				importEePlaces(
					sql,
					options.sourceDir
						? await readEePlaceSources(options.sourceDir)
						: await fetchEePlaceSources(options.placesUrl, workDir ?? tmpdir()),
					runId,
					log,
				),
			);
		}

		// 3. Parse and check each source.
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
					const data = await readFile(file.path);
					result = source === "medre" ? parseMedre(data, options.today) : parsePharmacies(data);
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the source holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed provider are dropped here, before anything
				// is staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "EE",
					idScheme: EE_SOURCES[source].scheme,
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
				suppressedLines[source] = suppressed.summary().EE ?? null;
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
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkEeSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} listed${result.edition ? ` (extract of ${result.edition})` : ""}, ${current.quarantined} quarantined, skipped ${JSON.stringify(result.skipped)}`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no Estonian source passed its checks");
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

		// 4. The addresses the sources name, then the places.
		const adsFile = files.find((file) => file.key === "ads");
		if (!adsFile) throw new Error("the ADS address file was not fetched");
		const lookups = adsLookups(results);
		const ads = await timer.run("read addresses", async () =>
			readAdsIndex(
				await readFile(adsFile.path),
				lookups.addresses,
				lookups.ids,
				options.sourceDir ? 1 : MIN_ADS_LINES,
			),
		);
		stats.ads = { lines: ads.lines, byAddress: ads.byAddress.size, byId: ads.byId.size };
		const placeIndex = await loadEePlaceIndex(sql);
		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => EE_SOURCES[source].siteSource);
		const batch = buildEeBatch(results, placeIndex, ads);
		stats.batch = {
			providers: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
			placement: batch.placement,
		};
		log(
			`placed: ${batch.placement.address} at their address, ${batch.placement.settlement} at their settlement, ${batch.placement.unplaced} left out; ${batch.placement.withoutPlace} without a place`,
		);

		// 5. Merge, in one transaction.
		const ctx = {
			runId,
			country: "EE",
			professions: [...EE_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage", () => stageEe(tx, batch));
			merge.staged = staged;
			const placeChecks = checkEePlaces(batch.placement);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeEeSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge providers", () => mergeEePractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeEeActivities(tx, loaded));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeEeQualifications(tx),
			);
			merge.absences = await markEeMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "EE");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "EE"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "EE"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'EE' AND status = 'active')::integer AS providers,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'EE' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'EE' AND source LIKE 'ee-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'EE' AND source LIKE 'ee-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'EE' AND source LIKE 'ee-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'EE' AND source LIKE 'ee-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'EE' AND source LIKE 'ee-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'EE')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'EE' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'EE' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'EE' AND indexable GROUP BY 1
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

/**
 * The last successful Estonian run (the files compared against), or null when it left a source
 * out: such a run never makes the next one skip.
 */
async function previousEeRun(sql: Sql): Promise<PreviousEeRun | null> {
	const [row] = await sql<(PreviousEeRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial FROM directory.etl_runs
		WHERE source = 'ee' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A source's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: EeSourceId): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'ee' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Estonian run that saw exactly the same files. */
async function checkEeApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'ee'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not an Estonian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
