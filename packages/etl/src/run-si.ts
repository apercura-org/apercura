/**
 * `etl:si`: weekly import of the health insurer's lists of the doctors who can be chosen as a
 * personal doctor (ZZZS, CC BY 4.0) into the shared directory, `country = 'SI'`.
 *
 * read the insurer's page once (it links the day's workbooks) -> download the three lists that
 * name doctors, one after the other (checksummed, retried) -> per-list guards (header, quarantine,
 * row floor, row and size changes) -> places and the locator (once: `etl:places --country si`) ->
 * locate every practice on the register's streets and settlements -> one merge transaction
 * (sites, doctors, activities with whether the doctor takes new patients, absences, suppressions,
 * derived fields, read models) -> circuit breakers on Slovenia's own pages -> COMMIT -> drain the
 * outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps its rows (its doctors
 * are neither updated nor counted missing); the run says so in `stats.sourceErrors` and the
 * command exits with code 3. The date of each list's data (the sheet's own) is recorded as its
 * file's `lastModified`: the pages print it with whether a doctor takes new patients.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SI_ID_SCHEME } from "@apercura/core";
import { SI_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import { SI_SOURCE_FILES, type SiOptions } from "./config";
import {
	checkBreakers,
	checkOrphans,
	checkSiPlaces,
	checkSiSource,
	type GuardCheck,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql } from "./lib/db";
import { downloadFile, inspectLocalFile, type SourceFile, sleep, USER_AGENT } from "./lib/files";
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
	buildSiBatch,
	markSiMissing,
	mergeSiActivities,
	mergeSiPractitioners,
	mergeSiSites,
	stageSi,
} from "./merge-si";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { SiLocatorIndex } from "./sources/si/locate";
import {
	fetchSiPlaceSources,
	importSiPlaces,
	loadSiLocator,
	readSiPlaceSources,
} from "./sources/si/places";
import {
	SI_LIST_SOURCE,
	SI_SITE_SOURCE,
	type SiParseResult,
	type SiSourceId,
} from "./sources/si/types";
import { listLinks, parseZzzsList } from "./sources/si/zzzs";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling per workbook: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 20 * 1024 * 1024 };

/** The pause between two downloads from the insurer's site: one request at a time, never a burst. */
const POLITE_PAUSE_MS = 2_000;

export type SiRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

export async function runSi(options: SiOptions, log: Logger = console.log): Promise<SiRunOutcome> {
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

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	dataDate: string | null;
};

type PreviousSiRun = {
	id: number;
	files: Record<string, { sha256?: string; bytes?: number }> | null;
};

/** The insurer's page, read once: the addresses of the day's workbooks. */
async function fetchListLinks(pageUrl: string): Promise<Record<SiSourceId, string>> {
	const response = await fetch(pageUrl, {
		headers: { accept: "text/html", "user-agent": USER_AGENT },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`GET ${pageUrl} answered ${response.status}`);
	return listLinks(await response.text(), response.url || pageUrl);
}

async function runLocked(
	sql: Sql,
	options: SiOptions,
	log: Logger,
	peakRss: () => number,
): Promise<SiRunOutcome> {
	const scope = { sources: options.sources };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('si', 'running', ${JSON.stringify(scope)}::text::jsonb, ${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Slovenia, lists ${options.sources.join(",")}${options.dryRun ? " (dry run)" : ""}`,
	);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let files: SourceFile[] = [];
	let placesDate: string | null = null;
	const createdWorkDir = !options.workDir;
	const workDir = options.workDir ?? (await mkdtemp(join(tmpdir(), "apercura-etl-si-")));

	const finish = async (status: RunStatus, error?: string): Promise<SiRunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
		if (Object.keys(sourceErrors).length > 0) stats.sourceErrors = sourceErrors;
		const fileInfo: Record<string, unknown> = Object.fromEntries(
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
		// The register's state the doctors were placed with: its credit line names that date.
		if (placesDate) fileInfo["si-rpe"] = { lastModified: placesDate };
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
		if (createdWorkDir) await rm(workDir, { recursive: true, force: true });
		return { runId, status, stats, guards, sourceErrors };
	};

	try {
		// 1. Files: the page once, then each list on its own, so one broken link never stops the others.
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			let links: Record<SiSourceId, string> | null = null;
			if (!options.sourceDir) {
				try {
					links = await fetchListLinks(options.pageUrl);
				} catch (error) {
					const message = `page: ${error instanceof Error ? error.message : String(error)}`;
					for (const source of options.sources) sourceErrors[source] = message;
					log(`The insurer's page could not be read (${message})`);
					return fetched;
				}
			}
			for (const [index, source] of options.sources.entries()) {
				const key = SI_LIST_SOURCE[source];
				try {
					if (links && index > 0) await sleep(POLITE_PAUSE_MS);
					const file = options.sourceDir
						? await inspectLocalFile(key, join(options.sourceDir, SI_SOURCE_FILES[source]), false)
						: await downloadFile({
								key,
								url: links?.[source] ?? "",
								path: join(workDir, SI_SOURCE_FILES[source]),
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
		if (files.length === 0) return await finish("failed", "no Slovenian list could be fetched");

		const previous = await previousSiRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			Object.keys(sourceErrors).length === 0 &&
			files.every((file) => previous.files?.[file.key]?.sha256 === file.sha256) &&
			Object.keys(previous.files).filter((key) => key.startsWith("si-zzzs-")).length ===
				files.length
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
		const approved = await checkSiApproval(sql, options.approveRunId, files);

		// 2. Places and the locator (once, or with `etl:places --country si`).
		let locator = await loadSiLocator(sql);
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'SI'
		`;
		if (places === 0 || !locator) {
			stats.places = await timer.run("import Slovenian places", async () =>
				importSiPlaces(
					sql,
					options.sourceDir
						? await readSiPlaceSources(options.sourceDir)
						: await fetchSiPlaceSources(workDir, options.today, options.placesUrl),
					runId,
				),
			);
			locator = await loadSiLocator(sql);
		}
		if (!locator) return await finish("failed", "no Slovenian places to locate the practices");
		placesDate = locator.date;
		const index = new SiLocatorIndex(locator);

		// 3. Parse and check each list.
		const results: SiParseResult[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse lists", async () => {
			for (const file of files) {
				const source = (Object.entries(SI_LIST_SOURCE).find(([, key]) => key === file.key)?.[0] ??
					"sa") as SiSourceId;
				let result: SiParseResult;
				try {
					result = await parseZzzsList(source, await readFile(file.path));
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// The date of the list's data, as the sheet gives it: what its pages say.
				if (result.dataDate) file.lastModified = result.dataDate;
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const people = new Set(result.rows.map((row) => row.nationalId)).size;
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed doctor are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "SI",
					idScheme: SI_ID_SCHEME,
				});
				result = {
					...result,
					rows: result.rows.filter(
						(row) => !suppressed.skip(source, [row.nationalId], 0, 1, row.activityCode),
					),
					quarantined: result.quarantined.filter(
						(line) => !suppressed.skip(source, line.sample.split(/[^0-9]+/), -1, -1),
					),
				};
				suppressedLines[source] = suppressed.summary().SI ?? null;
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people,
					quarantined: result.quarantined.length,
					bytes: file.bytes,
					skipped: result.skipped,
					dataDate: result.dataDate,
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkSiSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${current.rows} rows, ${people} doctors, ${current.quarantined} quarantined, data of ${result.dataDate ?? "unknown date"}`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no Slovenian list passed its checks");
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

		const loaded = results.map((result) => SI_LIST_SOURCE[result.source]);
		const batch = await timer.run("locate practices", async () => buildSiBatch(results, index));
		stats.located = { by: batch.placedBy, unplaced: batch.unplaced };

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "SI",
			professions: [...SI_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageSi(tx, batch));
			merge.staged = staged;
			const placeChecks = checkSiPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeSiSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge doctors", () => mergeSiPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeSiActivities(tx, loaded));
			merge.absences = await markSiMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, [SI_SITE_SOURCE]),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "SI");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "SI"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "SI"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'SI' AND status = 'active')::integer AS practitioners,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'SI' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source = ${SI_SITE_SOURCE} AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source = ${SI_SITE_SOURCE} AND removed_at IS NULL AND place_id IS NOT NULL)::integer AS placed,
					(SELECT count(*) FROM directory.activities a JOIN directory.practitioners p ON p.id = a.practitioner_id WHERE p.country = 'SI' AND a.removed_at IS NULL AND a.mode_code = 'accepting')::integer AS "acceptingActivities",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'SI' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'SI' AND status = 'active' GROUP BY 1
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

/** The last successful Slovenian run (the files compared against). */
async function previousSiRun(sql: Sql): Promise<PreviousSiRun | null> {
	const [row] = await sql<PreviousSiRun[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'si' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** A list's stats in the last successful run that loaded it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'si' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Slovenian run that saw exactly the same files. */
async function checkSiApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256?: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'si'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Slovenian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const lists = Object.keys(blocked.files ?? {}).filter((key) => key.startsWith("si-zzzs-"));
	const same =
		files.length === lists.length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
