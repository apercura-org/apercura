/**
 * `etl:at`: weekly import of the Austrian open-data lists (Vienna, Styria,
 * Salzburg doctors and dentists) into the shared directory, `country = 'AT'`.
 *
 * download each list (checksummed, retried) -> per-list guards (schema,
 * quarantine, row floor, row and size changes) -> places (once) -> one merge
 * transaction (sites, practitioners, activities, specialties, absences,
 * suppressions, derived fields, read models, ANALYZE points as in #90) ->
 * circuit breakers on Austria's own pages -> COMMIT -> drain the outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps
 * its rows (its people are neither updated nor counted missing); the run says
 * so in `stats.sourceErrors` and the command exits with code 3.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AT_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import { AT_SOURCE_FILES, type AtOptions } from "./config";
import {
	checkAtPlaces,
	checkAtSource,
	checkBreakers,
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
	buildAtBatch,
	markAtMissing,
	mergeAtActivities,
	mergeAtPractitioners,
	mergeAtQualifications,
	mergeAtSites,
	stageAt,
} from "./merge-at";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { fetchGemeinden, importAtPlaces, readGemeinden } from "./sources/at/places";
import { parseSalzburg } from "./sources/at/salzburg";
import { parseSteiermark } from "./sources/at/steiermark";
import type { AtSourceId, ParseResult } from "./sources/at/types";
import { parseWien } from "./sources/at/wien";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** Identifier scheme and site source of each list. */
export const AT_SOURCE_SCHEMES: Record<AtSourceId, { scheme: string; siteSource: string }> = {
	wien: { scheme: "AT-WIEN", siteSource: "at-wien" },
	stmk: { scheme: "AT-STMK", siteSource: "at-stmk" },
	sbg: { scheme: "AT-SBG", siteSource: "at-sbg" },
	"sbg-zahn": { scheme: "AT-SBGZ", siteSource: "at-sbg-zahn" },
};

/** A size floor and ceiling per downloaded file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 1_000, max: 100 * 1024 * 1024 };

export type AtRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

/** Parses one list's file. Throws when the file is not what the list publishes. */
export async function parseAtFile(source: AtSourceId, path: string): Promise<ParseResult> {
	switch (source) {
		case "wien":
			return parseWien(await readFile(path, "utf8"));
		case "stmk":
			return parseSteiermark(await readFile(path));
		case "sbg":
			return parseSalzburg(await readFile(path, "utf8"), "doctors");
		case "sbg-zahn":
			return parseSalzburg(await readFile(path, "utf8"), "dentists");
	}
}

export async function runAt(options: AtOptions, log: Logger = console.log): Promise<AtRunOutcome> {
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
};

type PreviousAtRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
	stats: { sources?: Record<string, SourceStats> } | null;
};

async function runLocked(
	sql: Sql,
	options: AtOptions,
	log: Logger,
	peakRss: () => number,
): Promise<AtRunOutcome> {
	const scope = { sources: options.sources };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('at', 'running', ${JSON.stringify(scope)}::text::jsonb, ${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Austria, lists ${options.sources.join(",")}${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-at-")));

	const finish = async (status: RunStatus, error?: string): Promise<AtRunOutcome> => {
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
		// 1. Files: each list on its own, so one unreachable portal never stops the others.
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const source of options.sources) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(
								source,
								join(options.sourceDir, AT_SOURCE_FILES[source]),
								false,
							)
						: await downloadFile({
								key: source,
								url: options.urls[source],
								path: join(workDir ?? tmpdir(), AT_SOURCE_FILES[source]),
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
		if (files.length === 0) return await finish("failed", "no Austrian list could be fetched");

		const previous = await previousAtRun(sql);
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
		const approved = await checkAtApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country at`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'AT'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Austrian places", async () =>
				importAtPlaces(
					sql,
					options.sourceDir
						? await readGemeinden(options.sourceDir)
						: await fetchGemeinden(options.placesUrl),
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
				const source = file.key as AtSourceId;
				let result: ParseResult;
				try {
					result = await parseAtFile(source, file.path);
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const people = new Set(result.rows.map((row) => `${row.idScheme}:${row.nationalId}`)).size;
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed key are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "AT",
					idScheme: AT_SOURCE_SCHEMES[source].scheme,
				});
				result = {
					...result,
					rows: result.rows.filter(
						(row) => !suppressed.skip(source, [row.nationalId], 0, 1, row.professionCode),
					),
					quarantined: result.quarantined.filter(
						(line) => !suppressed.skip(source, line.sample.split(/[^0-9]+/), -1, -1),
					),
				};
				suppressedLines[source] = suppressed.summary().AT ?? null;
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people,
					quarantined: result.quarantined.length,
					bytes: file.bytes,
					skipped: result.skipped,
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkAtSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${current.rows} rows, ${people} people, ${current.quarantined} quarantined`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no Austrian list passed its checks");
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
		const schemes = loaded.map((source) => AT_SOURCE_SCHEMES[source].scheme);
		const siteSources = loaded.map((source) => AT_SOURCE_SCHEMES[source].siteSource);
		const batch = buildAtBatch(results);
		stats.taxonomy = {
			unknownSpecialties: batch.unknownSpecialties,
			keyCollisions: batch.keyCollisions,
		};
		if (Object.keys(batch.unknownSpecialties).length > 0) {
			log(`Taxonomy alert: unknown specialties ${JSON.stringify(batch.unknownSpecialties)}`);
		}

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "AT",
			professions: [...AT_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageAt(tx, batch));
			merge.staged = staged;
			const placeChecks = checkAtPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeAtSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge practitioners", () => mergeAtPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeAtActivities(tx, schemes));
			merge.qualifications = await timer.run("merge specialties", () => mergeAtQualifications(tx));
			merge.absences = await markAtMissing(tx, schemes);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "AT");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "AT"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "AT"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'AT' AND status = 'active')::integer AS practitioners,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'AT' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'at-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'at-%' AND removed_at IS NULL AND geo_source = 'source')::integer AS located,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'at-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'AT' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [bySource] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(id_scheme, n) AS counts FROM (
					SELECT id_scheme, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'AT' AND status = 'active' GROUP BY 1
				) x
			`;
			merge.totals = { ...totals, bySource: bySource?.counts ?? {} };
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

/** The last successful Austrian run (files and per-list stats compared against). */
async function previousAtRun(sql: Sql): Promise<PreviousAtRun | null> {
	const [row] = await sql<PreviousAtRun[]>`
		SELECT id, files, stats FROM directory.etl_runs
		WHERE source = 'at' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** A list's stats in the last successful run that loaded it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'at' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Austrian run that saw exactly the same files. */
async function checkAtApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'at'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not an Austrian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
