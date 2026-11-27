/**
 * `etl:pl`: weekly import of Poland's healthcare establishments into the shared directory,
 * `country = 'PL'`, from RPWDL (the healthcare entities of the register of entities performing
 * medical activity, Centrum e-Zdrowia, daily, CC BY 4.0 with the times of production and
 * obtaining stated).
 *
 * download the export (checksummed, retried) -> extract its four CSV files -> guards
 * (quarantine, line and establishment floors, row and size changes) -> places (once: TERYT's
 * TERC, GUS, and PRG's gminas, GUGiK) -> one merge transaction (sites, establishments,
 * activities, facts, absences, suppressions, derived fields, read models, ANALYZE points as in
 * #90) -> circuit breakers on Poland's own pages -> COMMIT -> drain the outbox.
 *
 * One register: when it cannot be fetched or read the run fails (exit code 1) and the pages
 * stay as they are; `sourceErrors` says why, as in Czechia. The report's generation time
 * (`Info.txt`) is recorded as the file's date: the time of production a page's attribution
 * states, next to the time of obtaining (the run's day).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PL_ID_SCHEME } from "@apercura/core";
import { PL_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import { PL_SOURCE_FILE, type PlOptions } from "./config";
import {
	checkBreakers,
	checkOrphans,
	checkPlPlaces,
	checkPlSource,
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
	buildPlBatch,
	markPlMissing,
	mergePlActivities,
	mergePlPractitioners,
	mergePlQualifications,
	mergePlSites,
	stagePl,
} from "./merge-pl";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { fetchPlPlaceSources, importPlPlaces, readPlPlaceSources } from "./sources/pl/places";
import { extractRpwdl, parseRpwdl } from "./sources/pl/rpwdl";
import { type ParseResult, PL_SITE_SOURCE, PL_SOURCE_ID } from "./sources/pl/types";
import { SuppressedLines } from "./suppressions";

/** A size floor and ceiling of the export (a ZIP of about 35 MB): outside them the file is broken. */
const FILE_BYTES = { min: 1_000, max: 400 * 1024 * 1024 };

export type PlRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousPlRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runPl(options: PlOptions, log: Logger = console.log): Promise<PlRunOutcome> {
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
	options: PlOptions,
	log: Logger,
	peakRss: () => number,
): Promise<PlRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('pl', 'running', ${JSON.stringify({ sources: [PL_SOURCE_ID], asOf: options.asOf })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(`Run ${runId}: Poland, RPWDL as of ${options.asOf}${options.dryRun ? " (dry run)" : ""}`);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let file: SourceFile | null = null;
	/** When the report was generated from the register (`Info.txt`): the time of production. */
	let producedAt: string | null = null;
	const createdWorkDir = !options.workDir && !options.sourceDir;
	const workDir =
		options.workDir ??
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-pl-")));

	const finish = async (status: RunStatus, error?: string): Promise<PlRunOutcome> => {
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
						// The time of production the attribution states, else the HTTP date.
						lastModified: producedAt ?? file.lastModified,
						producedAt,
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
					? await inspectLocalFile(PL_SOURCE_ID, join(options.sourceDir, PL_SOURCE_FILE), false)
					: await downloadFile({
							key: PL_SOURCE_ID,
							url: options.url,
							path: join(workDir ?? tmpdir(), PL_SOURCE_FILE),
							text: false,
						});
				if (fetched.bytes < FILE_BYTES.min || fetched.bytes > FILE_BYTES.max) {
					throw new Error(`${fetched.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`);
				}
				return fetched;
			});
			log(`${PL_SOURCE_ID}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
		} catch (error) {
			sourceErrors[PL_SOURCE_ID] =
				`fetch: ${error instanceof Error ? error.message : String(error)}`;
			file = null;
			return await finish(
				"failed",
				`the RPWDL export could not be fetched (${sourceErrors[PL_SOURCE_ID]})`,
			);
		}
		const current = file;

		const previous = await previousPlRun(sql);
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
		const approved = await checkPlApproval(sql, options.approveRunId, current);

		// 2. Places (once, or with `etl:places --country pl`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'PL'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Polish places", async () =>
				importPlPlaces(
					sql,
					options.sourceDir
						? await readPlPlaceSources(options.sourceDir)
						: await fetchPlPlaceSources(options.placesUrls, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 3. Parse and check the list.
		let result: ParseResult;
		try {
			result = await timer.run("parse register", async () => {
				// The CSV files are extracted next to the download, or to a directory of their own
				// (removed once read) when the export is read from `--source-dir`.
				const dir = workDir
					? join(workDir, "rpwdl")
					: await mkdtemp(join(tmpdir(), "apercura-etl-pl-rpwdl-"));
				try {
					return await parseRpwdl(await extractRpwdl(current.path, dir), options.asOf);
				} finally {
					if (!workDir) await rm(dir, { recursive: true, force: true });
				}
			});
			producedAt = result.producedAt;
			stats.producedAt = producedAt;
			stats.asOf = options.asOf;
		} catch (error) {
			sourceErrors[PL_SOURCE_ID] =
				`parse: ${error instanceof Error ? error.message : String(error)}`;
			return await finish(
				"failed",
				`the RPWDL export could not be read (${sourceErrors[PL_SOURCE_ID]})`,
			);
		}
		// Counted as the list holds them: a suppression never looks like a shrinking list.
		const rowCount = result.rows.length;
		// GDPR objections: the rows of a suppressed facility are dropped here, before anything is
		// staged, and so are quarantined samples that name one (#116).
		const suppressed = await SuppressedLines.load(sql, { country: "PL", idScheme: PL_ID_SCHEME });
		result = {
			...result,
			rows: result.rows.filter(
				(row) => !suppressed.skip(PL_SOURCE_ID, [row.nationalId], 0, 1, row.professionCode),
			),
			quarantined: result.quarantined.filter(
				(line) => !suppressed.skip(PL_SOURCE_ID, line.sample.split("|"), -1, -1),
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
		stats.sources = { [PL_SOURCE_ID]: sourceStats };
		stats.quarantine = {
			samples: result.quarantined
				.slice(0, 20)
				.map((line) => ({ source: PL_SOURCE_ID, lineNo: line.lineNo, reason: line.reason })),
		};
		stats.suppressedLines = { [PL_SOURCE_ID]: suppressed.summary().PL ?? null };
		const before = await previousSourceStats(sql);
		const checks = checkPlSource(PL_SOURCE_ID, sourceStats, before);
		guards.push(...checks);
		log(
			`${PL_SOURCE_ID}: ${result.lines} establishment lines, ${rowCount} establishments, ${sourceStats.quarantined} quarantined, ${result.counters.naturalPersons} of a natural person (${result.counters.namesStripped} names without the person's), ${result.counters.sharedPhones} shared numbers left out`,
		);
		const fileVerdict = verdict(checks, approved);
		if (!fileVerdict.ok) {
			const broken = fileVerdict.blocking.filter((check) => !check.approvable);
			if (broken.length > 0) {
				sourceErrors[PL_SOURCE_ID] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
			}
			log(
				`Guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "list guards failed");
		}

		const batch = buildPlBatch(result);
		stats.batch = {
			establishments: batch.people.length,
			sites: batch.sites.length,
			facts: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "PL",
			professions: [...PL_DEFAULT_PROFESSIONS],
			department: null,
		};
		const siteSources = [PL_SITE_SOURCE];
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stagePl(tx, batch));
			merge.staged = staged;
			const placeChecks = checkPlPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergePlSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge establishments", () => mergePlPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergePlActivities(tx));
			merge.qualifications = await timer.run("merge facts", () => mergePlQualifications(tx));
			merge.absences = await markPlMissing(tx);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "PL");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "PL"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "PL"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'PL' AND status = 'active')::integer AS establishments,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'PL' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source = ${PL_SITE_SOURCE} AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source = ${PL_SITE_SOURCE} AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE source = ${PL_SITE_SOURCE} AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'PL')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'PL' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'PL' AND status = 'active' GROUP BY 1
				) x
			`;
			const [indexableByProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'PL' AND indexable GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'PL' AND indexable GROUP BY 1
				) x
			`;
			const [byPlaceKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'none') AS kind, count(*)::integer AS n
					FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
					WHERE s.source = ${PL_SITE_SOURCE} AND s.removed_at IS NULL GROUP BY 1
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

/** The last successful Polish run (the export compared against). */
async function previousPlRun(sql: Sql): Promise<PreviousPlRun | null> {
	const [row] = await sql<PreviousPlRun[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'pl' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** The list's stats in the last successful run. */
async function previousSourceStats(sql: Sql): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${PL_SOURCE_ID} AS stats FROM directory.etl_runs
		WHERE source = 'pl' AND status = 'succeeded' AND stats -> 'sources' ? ${PL_SOURCE_ID}
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Polish run that saw exactly the same export. */
async function checkPlApproval(sql: Sql, runId: number | null, file: SourceFile) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'pl'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Polish run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	if (blocked.files?.[file.key]?.sha256 !== file.sha256) {
		throw new Error(`--approve: the export changed since run ${runId}; review again`);
	}
	return true;
}
