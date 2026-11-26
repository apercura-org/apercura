/**
 * `etl:de`: monthly import of Germany's facilities into the shared directory, `country = 'DE'`,
 * from the statistical offices' yearly directory of hospitals and of prevention and
 * rehabilitation clinics (Destatis; reproduction allowed with the source) and the pharmacy lists
 * of Thuringia (CC BY 4.0) and Brandenburg (dl-de/by-2-0).
 *
 * download each file (the directory's newest edition among the addresses tried, checksummed,
 * retried) -> an unchanged set of files ends the run (exit 0, a cheap no-op) -> guards per
 * source (quarantine, line and facility floors, edition, changes since the last success) ->
 * places (once: GV-ISys's Länder, Kreise and Gemeinden) -> one merge transaction (sites,
 * facilities, activities, qualifications, absences, suppressions, derived fields, read models,
 * ANALYZE points as in #90) -> circuit breakers on Germany's own pages -> COMMIT -> drain the
 * outbox.
 *
 * A source that cannot be downloaded or read is left out of the run and keeps its rows: the run
 * imports the others, says so in `stats.sourceErrors`, and the command exits with code 3, as in
 * the other markets. When none can be read the run fails and the pages stay as they are.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DE_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { DeOptions } from "./config";
import {
	checkBreakers,
	checkDePlaces,
	checkDeSource,
	checkOrphans,
	type GuardCheck,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql } from "./lib/db";
import { downloadFile, inspectLocalFile, type SourceFile, USER_AGENT } from "./lib/files";
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
	buildDeBatch,
	markDeMissing,
	mergeDeActivities,
	mergeDePractitioners,
	mergeDeQualifications,
	mergeDeSites,
	stageDe,
} from "./merge-de";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { latestDirectoryLink, parseDestatis } from "./sources/de/destatis";
import { parseBrandenburg, parseThuringia } from "./sources/de/pharmacies";
import { fetchDePlaceSources, importDePlaces, readDePlaceSources } from "./sources/de/places";
import {
	DE_FILES,
	DE_SOURCES,
	type DeFileId,
	type DeSourceId,
	type ParseResult,
} from "./sources/de/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of a file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 100 * 1024 * 1024 };

export type DeRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

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

type PreviousDeRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

/** The files a set of sources reads (the directory's workbook once for both of its sheets). */
export const filesOf = (sources: readonly DeSourceId[]): DeFileId[] => [
	...new Set(sources.map((source) => DE_SOURCES[source].file)),
];

export async function runDe(options: DeOptions, log: Logger = console.log): Promise<DeRunOutcome> {
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

/** The portal page's link to the directory's newest edition, or null when it cannot be read. */
async function discoverDirectoryUrl(indexUrl: string, log: Logger): Promise<string | null> {
	try {
		const response = await fetch(indexUrl, {
			headers: { "user-agent": USER_AGENT },
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) throw new Error(`GET ${indexUrl} answered ${response.status}`);
		return latestDirectoryLink(await response.text(), indexUrl);
	} catch (error) {
		log(
			`destatis: the portal's page could not be read (${error instanceof Error ? error.message : String(error)})`,
		);
		return null;
	}
}

/** Downloads the first of `urls` that answers with a plausible file. */
async function downloadFirst(
	key: DeFileId,
	urls: readonly string[],
	path: string,
	log: Logger,
): Promise<SourceFile> {
	const errors: string[] = [];
	for (const [index, url] of urls.entries()) {
		try {
			const file = await downloadFile({
				key,
				url,
				path,
				text: false,
				// An address of an edition not published yet answers 404 at once: no retries.
				attempts: index < urls.length - 1 ? 1 : 3,
			});
			if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
				throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
			}
			return file;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(message);
			if (index < urls.length - 1) log(`${key}: ${url} not used (${message})`);
		}
	}
	throw new Error(errors.at(-1) ?? "no address to download from");
}

async function runLocked(
	sql: Sql,
	options: DeOptions,
	log: Logger,
	peakRss: () => number,
): Promise<DeRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('de', 'running', ${JSON.stringify({ sources: options.sources })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Germany, Destatis and Länder pharmacies (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-de-")));

	const finish = async (status: RunStatus, error?: string): Promise<DeRunOutcome> => {
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

	const failSources = (file: DeFileId, message: string) => {
		for (const source of options.sources) {
			if (DE_SOURCES[source].file === file) sourceErrors[source] = message;
		}
	};

	try {
		// 1. The files: each on its own, so one failing download never stops the others.
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const key of filesOf(options.sources)) {
				try {
					let file: SourceFile;
					if (options.sourceDir) {
						file = await inspectLocalFile(key, join(options.sourceDir, DE_FILES[key]), false);
					} else {
						let urls = options.urls[key];
						if (key === "destatis" && options.khvIndexUrl && !options.offline) {
							const latest = await discoverDirectoryUrl(options.khvIndexUrl, log);
							if (latest && !urls.includes(latest)) {
								urls = [...urls.slice(0, -1), latest, ...urls.slice(-1)];
							}
						}
						file = await downloadFirst(key, urls, join(workDir ?? tmpdir(), DE_FILES[key]), log);
					}
					if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
						throw new Error(`${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
					}
					fetched.push(file);
					log(
						`${key}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)} (${file.resolvedUrl})`,
					);
				} catch (error) {
					const message = `fetch: ${error instanceof Error ? error.message : String(error)}`;
					failSources(key, message);
					log(`${key}: left out of this run (${message})`);
				}
			}
			return fetched;
		});
		if (files.length === 0) return await finish("failed", "no German source could be fetched");

		const previous = await previousDeRun(sql);
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
		const approved = await checkDeApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country de`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'DE'
		`;
		if (places === 0) {
			stats.places = await timer.run("import German places", async () =>
				importDePlaces(
					sql,
					options.sourceDir
						? await readDePlaceSources(options.sourceDir)
						: await fetchDePlaceSources(options.placesUrl, workDir ?? tmpdir()),
					runId,
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
				const file = files.find((candidate) => candidate.key === DE_SOURCES[source].file);
				if (!file) continue;
				let result: ParseResult;
				try {
					const data = await readFile(file.path);
					result =
						source === "khv" || source === "rhv"
							? await parseDestatis(source, data)
							: source === "apo-th"
								? parseThuringia(data)
								: parseBrandenburg(data);
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the source holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed facility are dropped here, before anything
				// is staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "DE",
					idScheme: DE_SOURCES[source].scheme,
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
				suppressedLines[source] = suppressed.summary().DE ?? null;
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
				const checks = checkDeSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} lines, ${rowCount} facilities${result.edition ? ` (edition ${result.edition})` : ""}, ${current.quarantined} quarantined, ${result.counters.sharedPhones} shared numbers left out`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no German source passed its checks");
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

		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => DE_SOURCES[source].siteSource);
		const batch = buildDeBatch(results);
		stats.batch = {
			facilities: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "DE",
			professions: [...DE_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageDe(tx, batch));
			merge.staged = staged;
			const placeChecks = checkDePlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeDeSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge facilities", () => mergeDePractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeDeActivities(tx, loaded));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeDeQualifications(tx),
			);
			merge.absences = await markDeMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "DE");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "DE"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "DE"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'DE' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'DE' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'DE' AND source LIKE 'de-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'DE' AND source LIKE 'de-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'DE' AND source LIKE 'de-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'DE' AND source LIKE 'de-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'DE' AND source LIKE 'de-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'DE')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'DE' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'DE' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'DE' AND indexable GROUP BY 1
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
 * The last successful German run (the files compared against), or null when it left a source
 * out: such a run never makes the next one skip.
 */
async function previousDeRun(sql: Sql): Promise<PreviousDeRun | null> {
	const [row] = await sql<(PreviousDeRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial FROM directory.etl_runs
		WHERE source = 'de' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A source's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'de' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked German run that saw exactly the same files. */
async function checkDeApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'de'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a German run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
