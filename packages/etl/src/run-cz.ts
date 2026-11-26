/**
 * `etl:cz`: weekly import of Czechia's healthcare facilities into the shared directory,
 * `country = 'CZ'`, from the National Register of Healthcare Providers (NRPZS: the places of
 * care, ÚZIS ČR, monthly, CC BY 4.0).
 *
 * download the export (checksummed, retried) -> guards (quarantine, line and facility floors,
 * row and size changes) -> places (once: RÚIAN, ČÚZK) -> one merge transaction (sites,
 * facilities, activities, fields of care, absences, suppressions, derived fields, read models,
 * ANALYZE points as in #90) -> circuit breakers on Czechia's own pages -> COMMIT -> drain the
 * outbox.
 *
 * One list: when it cannot be fetched or read the run fails (exit code 1) and the pages stay as
 * they are; `sourceErrors` says why, as in Austria and the UK.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CZ_ID_SCHEME } from "@apercura/core";
import { CZ_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import { CZ_SOURCE_FILE, type CzOptions } from "./config";
import {
	checkBreakers,
	checkCzPlaces,
	checkCzSource,
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
	buildCzBatch,
	markCzMissing,
	mergeCzActivities,
	mergeCzPractitioners,
	mergeCzQualifications,
	mergeCzSites,
	stageCz,
} from "./merge-cz";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { parseNrpzs } from "./sources/cz/nrpzs";
import { fetchCzPlaceSources, importCzPlaces, readCzPlaceSources } from "./sources/cz/places";
import { CZ_SITE_SOURCE, CZ_SOURCE_ID, type ParseResult } from "./sources/cz/types";
import { SuppressedLines } from "./suppressions";

/** A size floor and ceiling of the export: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 10_000, max: 300 * 1024 * 1024 };

export type CzRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousCzRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runCz(options: CzOptions, log: Logger = console.log): Promise<CzRunOutcome> {
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
	options: CzOptions,
	log: Logger,
	peakRss: () => number,
): Promise<CzRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('cz', 'running', ${JSON.stringify({ sources: [CZ_SOURCE_ID] })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(`Run ${runId}: Czechia, NRPZS${options.dryRun ? " (dry run)" : ""}`);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let file: SourceFile | null = null;
	const createdWorkDir = !options.workDir && !options.sourceDir;
	const workDir =
		options.workDir ??
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-cz-")));

	const finish = async (status: RunStatus, error?: string): Promise<CzRunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
		if (Object.keys(sourceErrors).length > 0) stats.sourceErrors = sourceErrors;
		const fileInfo = file
			? {
					[file.key]: {
						url: file.url,
						resolvedUrl: file.resolvedUrl,
						bytes: file.bytes,
						sha256: file.sha256,
						lastModified: file.lastModified,
					},
				}
			: {};
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
		// 1. The export.
		try {
			file = await timer.run("fetch source", async () => {
				const fetched = options.sourceDir
					? await inspectLocalFile(CZ_SOURCE_ID, join(options.sourceDir, CZ_SOURCE_FILE), true)
					: await downloadFile({
							key: CZ_SOURCE_ID,
							url: options.url,
							path: join(workDir ?? tmpdir(), CZ_SOURCE_FILE),
							text: true,
						});
				if (fetched.bytes < FILE_BYTES.min || fetched.bytes > FILE_BYTES.max) {
					throw new Error(`${fetched.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
				}
				return fetched;
			});
			log(`${CZ_SOURCE_ID}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
		} catch (error) {
			sourceErrors[CZ_SOURCE_ID] =
				`fetch: ${error instanceof Error ? error.message : String(error)}`;
			file = null;
			return await finish(
				"failed",
				`the NRPZS export could not be fetched (${sourceErrors[CZ_SOURCE_ID]})`,
			);
		}
		const current = file;

		const previous = await previousCzRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			previous.files[current.key]?.sha256 === current.sha256
		) {
			log(`Export unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkCzApproval(sql, options.approveRunId, current);

		// 2. Places (once, or with `etl:places --country cz`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'CZ'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Czech places", async () =>
				importCzPlaces(
					sql,
					options.sourceDir
						? await readCzPlaceSources(options.sourceDir)
						: await fetchCzPlaceSources(options.placesUrls, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 3. Parse and check the list.
		let result: ParseResult;
		try {
			result = await timer.run("parse list", async () => parseNrpzs(await readFile(current.path)));
		} catch (error) {
			sourceErrors[CZ_SOURCE_ID] =
				`parse: ${error instanceof Error ? error.message : String(error)}`;
			return await finish(
				"failed",
				`the NRPZS export could not be read (${sourceErrors[CZ_SOURCE_ID]})`,
			);
		}
		// Counted as the list holds them: a suppression never looks like a shrinking list.
		const rowCount = result.rows.length;
		// GDPR objections: the rows of a suppressed facility are dropped here, before anything is
		// staged, and so are quarantined samples that name one (#116).
		const suppressed = await SuppressedLines.load(sql, { country: "CZ", idScheme: CZ_ID_SCHEME });
		result = {
			...result,
			rows: result.rows.filter(
				(row) => !suppressed.skip(CZ_SOURCE_ID, [row.nationalId], 0, 1, row.professionCode),
			),
			quarantined: result.quarantined.filter(
				(line) => !suppressed.skip(CZ_SOURCE_ID, line.sample.split("|"), -1, -1),
			),
		};
		const sourceStats: SourceStats = {
			lines: result.lines,
			rows: rowCount,
			people: rowCount,
			quarantined: result.quarantined.length,
			bytes: current.bytes,
			skipped: result.skipped,
			counters: result.counters,
		};
		stats.sources = { [CZ_SOURCE_ID]: sourceStats };
		stats.quarantine = {
			samples: result.quarantined
				.slice(0, 20)
				.map((line) => ({ source: CZ_SOURCE_ID, lineNo: line.lineNo, reason: line.reason })),
		};
		stats.suppressedLines = { [CZ_SOURCE_ID]: suppressed.summary().CZ ?? null };
		const before = await previousSourceStats(sql);
		const checks = checkCzSource(CZ_SOURCE_ID, sourceStats, before);
		guards.push(...checks);
		log(
			`${CZ_SOURCE_ID}: ${result.lines} lines, ${rowCount} facilities, ${sourceStats.quarantined} quarantined, ${result.counters.naturalPersons} of a natural person, ${result.counters.sharedPhones} shared numbers left out`,
		);
		const fileVerdict = verdict(checks, approved);
		if (!fileVerdict.ok) {
			const broken = fileVerdict.blocking.filter((check) => !check.approvable);
			if (broken.length > 0) {
				sourceErrors[CZ_SOURCE_ID] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
			}
			log(
				`Guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "list guards failed");
		}

		const batch = buildCzBatch(result);
		stats.batch = {
			facilities: batch.people.length,
			sites: batch.sites.length,
			fieldsOfCare: batch.qualifications.length,
			sharedSites: batch.sharedSites,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "CZ",
			professions: [...CZ_DEFAULT_PROFESSIONS],
			department: null,
		};
		const siteSources = [CZ_SITE_SOURCE];
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageCz(tx, batch));
			merge.staged = staged;
			const placeChecks = checkCzPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeCzSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge facilities", () => mergeCzPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeCzActivities(tx));
			merge.qualifications = await timer.run("merge fields of care", () =>
				mergeCzQualifications(tx),
			);
			merge.absences = await markCzMissing(tx);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "CZ");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "CZ"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "CZ"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CZ' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'CZ' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source = ${CZ_SITE_SOURCE} AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source = ${CZ_SITE_SOURCE} AND removed_at IS NULL AND geo_source = 'source')::integer AS located,
					(SELECT count(*) FROM directory.sites WHERE source = ${CZ_SITE_SOURCE} AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE source = ${CZ_SITE_SOURCE} AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CZ')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'CZ' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'CZ' AND status = 'active' GROUP BY 1
				) x
			`;
			const [indexableByProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'CZ' AND indexable GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'CZ' AND indexable GROUP BY 1
				) x
			`;
			const [byPlaceKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'none') AS kind, count(*)::integer AS n
					FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
					WHERE s.source = ${CZ_SITE_SOURCE} AND s.removed_at IS NULL GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				indexableByProfession: indexableByProfession?.counts ?? {},
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

/** The last successful Czech run (the export compared against). */
async function previousCzRun(sql: Sql): Promise<PreviousCzRun | null> {
	const [row] = await sql<PreviousCzRun[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'cz' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** The list's stats in the last successful run. */
async function previousSourceStats(sql: Sql): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${CZ_SOURCE_ID} AS stats FROM directory.etl_runs
		WHERE source = 'cz' AND status = 'succeeded' AND stats -> 'sources' ? ${CZ_SOURCE_ID}
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Czech run that saw exactly the same export. */
async function checkCzApproval(sql: Sql, runId: number | null, file: SourceFile) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'cz'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Czech run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	if (blocked.files?.[file.key]?.sha256 !== file.sha256) {
		throw new Error(`--approve: the export changed since run ${runId}; review again`);
	}
	return true;
}
