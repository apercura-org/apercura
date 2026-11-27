/**
 * `etl:mt`: weekly import of Malta's community pharmacies into the shared directory,
 * `country = 'MT'`, from the Medicines Authority's register of licensed pharmacies in Malta and
 * Gozo (data.gov.mt, CC BY 4.0).
 *
 * the register (`pharmacies.json`, the API's one answer) and its catalogue record
 * (`catalogue.json`: the publisher and the licence must still be the Medicines Authority and
 * CC BY 4.0) -> guards (quarantine, floors, the catalogue's date, changes since the last
 * success) -> places (once: the Planning Authority's 68 localities in the NSO's districts) ->
 * placing by the register's points in the localities' boundaries -> one merge transaction
 * (sites, pharmacies, activities, absences, suppressions, derived fields, read models, ANALYZE
 * points as in #90) -> circuit breakers on Malta's own pages -> COMMIT -> drain the outbox.
 *
 * One source: when the register or its record cannot be fetched or read, or its terms changed,
 * the run fails (exit code 1) and the pages stay as they are, `sourceErrors` saying why. A
 * blocked run keeps its files and is approved on those same files (`--approve=<id> --source-dir
 * <dir>`, the directory the run names).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MT_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { MtOptions } from "./config";
import {
	checkBreakers,
	checkMtPlaces,
	checkMtSource,
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
	buildMtBatch,
	markMtMissing,
	mergeMtActivities,
	mergeMtPractitioners,
	mergeMtSites,
	pointKey,
	stageMt,
} from "./merge-mt";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { mtTermsProblem, parseMtCatalogue, parseMtPharmacies } from "./sources/mt/pharmacies";
import {
	fetchMtPlaceSources,
	importMtPlaces,
	loadMtPlaceIndex,
	locateMtPoints,
	readMtPlaceSources,
} from "./sources/mt/places";
import { MT_FILES, MT_SOURCES, type MtSourceId, type ParseResult } from "./sources/mt/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of the register: outside them it is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 20 * 1024 * 1024 };

export type MtRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

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

const SOURCE: MtSourceId = "pharmacies";

export async function runMt(options: MtOptions, log: Logger = console.log): Promise<MtRunOutcome> {
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

/** The register and its catalogue record: from `--source-dir`, or downloaded to `workDir`. */
async function sourceFiles(options: MtOptions, workDir: string): Promise<SourceFile[]> {
	if (options.sourceDir) {
		const dir = options.sourceDir;
		return [
			await inspectLocalFile(SOURCE, join(dir, MT_FILES.pharmacies), true),
			await inspectLocalFile("catalogue", join(dir, MT_FILES.catalogue), true),
		];
	}
	// The record first (a small answer): the register is only fetched under the expected terms.
	const catalogue = await downloadFile({
		key: "catalogue",
		url: options.catalogueUrl,
		path: join(workDir, MT_FILES.catalogue),
		text: true,
	});
	// data.gov.mt can take more than half a minute to answer a first request: four attempts.
	const register = await downloadFile({
		key: SOURCE,
		url: options.pharmaciesUrl,
		path: join(workDir, MT_FILES.pharmacies),
		text: true,
		attempts: 4,
	});
	return [register, catalogue];
}

async function runLocked(
	sql: Sql,
	options: MtOptions,
	log: Logger,
	peakRss: () => number,
): Promise<MtRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('mt', 'running', ${JSON.stringify({ sources: [SOURCE], asOf: options.today })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Malta, the Medicines Authority's licensed pharmacies as of ${options.today}${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-mt-")));

	const finish = async (status: RunStatus, error?: string): Promise<MtRunOutcome> => {
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
			// A blocked run keeps its files: the register is live, so only the same files can be
			// approved (`--approve=<id> --source-dir <dir>`).
			if (status === "blocked") {
				log(`Files kept in ${workDir}: rerun with --approve=${runId} --source-dir ${workDir}`);
			} else {
				await rm(workDir, { recursive: true, force: true });
			}
		}
		return { runId, status, stats, guards, sourceErrors };
	};

	try {
		// 1. The register and its catalogue record, or the files of `--source-dir`.
		try {
			files = await timer.run("fetch the register", () =>
				sourceFiles(options, workDir ?? tmpdir()),
			);
		} catch (error) {
			sourceErrors[SOURCE] = `fetch: ${error instanceof Error ? error.message : String(error)}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}
		const [file, record] = files;
		if (!file || !record) return await finish("failed", "the register could not be fetched");
		if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
			sourceErrors[SOURCE] =
				`fetch: ${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}
		log(`pharmacies: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);

		// 2. The terms: the Medicines Authority's dataset, under CC BY 4.0.
		let edition: number | null;
		try {
			const catalogue = parseMtCatalogue(await readFile(record.path));
			const problem = mtTermsProblem(catalogue);
			stats.catalogue = {
				publisher: catalogue.publisher,
				licences: catalogue.licences,
				edition: catalogue.edition,
			};
			if (problem) {
				sourceErrors[SOURCE] = `terms: ${problem}`;
				return await finish("failed", sourceErrors[SOURCE]);
			}
			edition = catalogue.edition;
		} catch (error) {
			sourceErrors[SOURCE] = `terms: ${error instanceof Error ? error.message : String(error)}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}

		const previous = await previousMtRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			previous.files[file.key]?.sha256 === file.sha256
		) {
			log(`Register unchanged since run ${previous.id}: nothing to do`);
			stats.unchangedSince = previous.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkMtApproval(sql, options.approveRunId, files);

		// 3. Places (once, or with `etl:places --country mt`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'MT'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Maltese places", async () =>
				importMtPlaces(
					sql,
					options.sourceDir
						? await readMtPlaceSources(options.sourceDir)
						: await fetchMtPlaceSources(options.placesUrl, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 4. Parse and check the register.
		let result: ParseResult;
		try {
			result = await timer.run("parse the register", async () =>
				parseMtPharmacies(await readFile(file.path), edition),
			);
		} catch (error) {
			sourceErrors[SOURCE] = `parse: ${error instanceof Error ? error.message : String(error)}`;
			return await finish("failed", sourceErrors[SOURCE]);
		}
		// Counted as the source holds them: a suppression never looks like a shrinking list.
		const rowCount = result.rows.length;
		// GDPR objections: the rows of a suppressed pharmacy are dropped here, before anything is
		// staged, and so are quarantined samples that name one (#116).
		const suppressed = await SuppressedLines.load(sql, {
			country: "MT",
			idScheme: MT_SOURCES[SOURCE].scheme,
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
			[SOURCE]: suppressed.summary().MT ?? null,
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
		const checks = checkMtSource(SOURCE, current, before);
		guards.push(...checks);
		log(
			`pharmacies: ${result.lines} rows, ${rowCount} community pharmacies (register of ${result.edition ?? "?"}), ${current.quarantined} quarantined, skipped ${JSON.stringify(result.skipped)}`,
		);
		const fileVerdict = verdict(checks, approved);
		if (!fileVerdict.ok) {
			const detail = fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`);
			log(`Guards failed: ${detail.join("; ")}`);
			if (!fileVerdict.approvable) sourceErrors[SOURCE] = `guards: ${detail.join("; ")}`;
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "source guards failed");
		}

		// 5. Placing: the register's points in the localities' boundaries, else its localities.
		const placeIndex = await loadMtPlaceIndex(sql);
		const located = await timer.run("locate the points", () =>
			locateMtPoints(
				sql,
				result.rows.flatMap((row) =>
					row.longitude !== null && row.latitude !== null
						? [
								{
									key: pointKey(SOURCE, row.nationalId),
									longitude: row.longitude,
									latitude: row.latitude,
								},
							]
						: [],
				),
			),
		);
		const batch = buildMtBatch([result], placeIndex, located);
		stats.batch = {
			pharmacies: batch.people.length,
			sites: batch.sites.length,
			placement: batch.placement,
		};
		log(
			`placed: ${batch.placement.point} by their point, ${batch.placement.nearby} by a boundary within 200 m, ${batch.placement.name} by their locality, ${batch.placement.unplaced} left out (${batch.placement.disagreeing} placed in another locality than the one they name)`,
		);

		// 6. Merge, in one transaction.
		const siteSources = [MT_SOURCES[SOURCE].siteSource];
		const ctx = {
			runId,
			country: "MT",
			professions: [...MT_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			merge.staged = await timer.run("stage", () => stageMt(tx, batch));
			const placeChecks = checkMtPlaces(batch.placement);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeMtSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge pharmacies", () => mergeMtPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeMtActivities(tx, [SOURCE]));
			merge.absences = await markMtMissing(tx, [SOURCE]);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "MT");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "MT"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "MT"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'MT' AND status = 'active')::integer AS pharmacies,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'MT' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'MT' AND source LIKE 'mt-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'MT' AND source LIKE 'mt-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'MT' AND source LIKE 'mt-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'MT' AND source LIKE 'mt-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'MT' AND source LIKE 'mt-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'MT')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'MT' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'MT' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'MT' AND indexable GROUP BY 1
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

		// 7. After COMMIT: drain the cache invalidation outbox.
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

/** The last successful Maltese run, whose register an unchanged one is compared with. */
async function previousMtRun(
	sql: Sql,
): Promise<{ id: number; files: Record<string, { sha256: string }> | null } | null> {
	const [row] = await sql<{ id: number; files: Record<string, { sha256: string }> | null }[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'mt' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** The source's stats in the last successful run. */
async function previousSourceStats(sql: Sql): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${SOURCE} AS stats FROM directory.etl_runs
		WHERE source = 'mt' AND status = 'succeeded' AND stats -> 'sources' ? ${SOURCE}
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Maltese run that saw exactly the same files. */
async function checkMtApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'mt'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Maltese run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
