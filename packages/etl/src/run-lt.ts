/**
 * `etl:lt`: weekly import of Lithuania's licensed health-care institutions into the shared
 * directory, `country = 'LT'`, from the licence register of the State Accreditation Service for
 * Health Care Activities (VASPVT, data.gov.lt dataset 1623, daily, CC BY 4.0), placed with the
 * Address Register's text tables (VĮ Registrų centras, CC BY 4.0).
 *
 * licence check (the dataset page must still name the CC BY 4.0) -> six models of the register
 * and three of the Address Register, one polite request after another (at least 20 s apart,
 * `Retry-After` and backoff on 429) -> unchanged files end the run -> places (once: counties,
 * municipalities, settlements and their boundaries) -> parse, guards (quarantine, address and
 * page floors, page and size changes) -> one merge transaction (sites, pages, activities,
 * licensed services, absences, suppressions, derived fields, read models, ANALYZE as in #90) ->
 * circuit breakers on Lithuania's own pages -> COMMIT -> drain the outbox.
 *
 * One register: when it cannot be fetched or read the run fails (exit code 1) and the pages stay
 * as they are; `sourceErrors` says why, as in Czechia.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LT_ID_SCHEME } from "@apercura/core";
import { LT_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { LtOptions } from "./config";
import {
	checkBreakers,
	checkLtPlaces,
	checkLtSource,
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
	buildLtBatch,
	markLtMissing,
	mergeLtActivities,
	mergeLtPractitioners,
	mergeLtQualifications,
	mergeLtSites,
	stageLt,
} from "./merge-lt";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { LtAddressIndex } from "./sources/lt/address";
import { checkLicencePage, PoliteClient, storeCsvUrl } from "./sources/lt/download";
import {
	ADDRESS_DOWNLOADS,
	fetchLtPlaceSources,
	importLtPlaces,
	readLtAddressTables,
	readLtPlaceSources,
} from "./sources/lt/places";
import {
	addressFile,
	LT_SITE_SOURCE,
	LT_SOURCE_ID,
	LT_VASPVT_MODELS,
	type LtVaspvtModel,
	type ParseResult,
	vaspvtFile,
} from "./sources/lt/types";
import { parseVaspvt } from "./sources/lt/vaspvt";
import { SuppressedLines } from "./suppressions";

/** A size floor and ceiling of each file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 40, max: 500 * 1024 * 1024 };

export type LtRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousLtRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

const MODELS = Object.keys(LT_VASPVT_MODELS) as LtVaspvtModel[];

export async function runLt(options: LtOptions, log: Logger = console.log): Promise<LtRunOutcome> {
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
	options: LtOptions,
	log: Logger,
	peakRss: () => number,
): Promise<LtRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('lt', 'running', ${JSON.stringify({ sources: [LT_SOURCE_ID] })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(`Run ${runId}: Lithuania, VASPVT${options.dryRun ? " (dry run)" : ""}`);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let files: SourceFile[] = [];
	const createdWorkDir = !options.workDir && !options.sourceDir;
	const workDir =
		options.sourceDir ?? options.workDir ?? (await mkdtemp(join(tmpdir(), "apercura-etl-lt-")));
	const client = new PoliteClient({
		intervalMs: options.requestIntervalMs,
		attempts: options.requestAttempts,
		log,
	});

	const finish = async (status: RunStatus, error?: string): Promise<LtRunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
		if (!options.sourceDir) stats.requests = client.requests;
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
		if (createdWorkDir) await rm(workDir, { recursive: true, force: true });
		return { runId, status, stats, guards, sourceErrors };
	};

	try {
		// 1. The licence, then the files, one request after another.
		try {
			files = await timer.run("fetch sources", async () => {
				const fetched: SourceFile[] = [];
				const check = (file: SourceFile) => {
					if (file.bytes < FILE_BYTES.min || file.bytes > FILE_BYTES.max) {
						throw new Error(
							`${file.key}: ${file.bytes} bytes, outside ${FILE_BYTES.min}–${FILE_BYTES.max}`,
						);
					}
					if (file.utf8Valid === false) throw new Error(`${file.key}: not UTF-8`);
					fetched.push(file);
				};
				if (options.sourceDir) {
					for (const model of MODELS) {
						check(
							await inspectLocalFile(
								`vaspvt-${model}`,
								join(options.sourceDir, vaspvtFile(model)),
								true,
							),
						);
					}
					for (const [model] of ADDRESS_DOWNLOADS) {
						check(
							await inspectLocalFile(
								`ar-${model}`,
								join(options.sourceDir, addressFile(model)),
								true,
							),
						);
					}
					return fetched;
				}
				checkLicencePage(await client.text(options.datasetPage));
				stats.licence = { page: options.datasetPage, checked: true };
				for (const model of MODELS) {
					const file = await client.download(
						`vaspvt-${model}`,
						storeCsvUrl(options.vaspvtBase, model, LT_VASPVT_MODELS[model]),
						join(workDir, vaspvtFile(model)),
					);
					log(`${file.key}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
					check(file);
				}
				for (const [model, path, columns] of ADDRESS_DOWNLOADS) {
					const file = await client.download(
						`ar-${model}`,
						storeCsvUrl(options.addressBase, path, columns),
						join(workDir, addressFile(model)),
					);
					log(`${file.key}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
					check(file);
				}
				return fetched;
			});
		} catch (error) {
			sourceErrors[LT_SOURCE_ID] =
				`fetch: ${error instanceof Error ? error.message : String(error)}`;
			return await finish(
				"failed",
				`the licence register could not be fetched (${sourceErrors[LT_SOURCE_ID]})`,
			);
		}

		const previous = await previousLtRun(sql);
		if (
			previous?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
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
		const approved = await checkLtApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country lt`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'LT'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Lithuanian places", async () =>
				importLtPlaces(
					sql,
					options.sourceDir
						? await readLtPlaceSources(options.sourceDir)
						: await fetchLtPlaceSources(client, options.addressBase, workDir),
					runId,
				),
			);
		}

		// 3. Parse and check the register.
		let result: ParseResult;
		try {
			result = await timer.run("parse register", async () =>
				parseVaspvt(workDir, new LtAddressIndex(await readLtAddressTables(workDir))),
			);
		} catch (error) {
			sourceErrors[LT_SOURCE_ID] =
				`parse: ${error instanceof Error ? error.message : String(error)}`;
			return await finish(
				"failed",
				`the licence register could not be read (${sourceErrors[LT_SOURCE_ID]})`,
			);
		}
		// Counted as the register holds them: a suppression never looks like a shrinking list.
		const rowCount = result.rows.length;
		// GDPR objections: the rows of a suppressed page are dropped here, before anything is
		// staged, and so are quarantined samples that name one (#116).
		const suppressed = await SuppressedLines.load(sql, { country: "LT", idScheme: LT_ID_SCHEME });
		result = {
			...result,
			rows: result.rows.filter(
				(row) => !suppressed.skip(LT_SOURCE_ID, [row.nationalId], 0, 1, row.professionCode),
			),
			quarantined: result.quarantined.filter(
				(line) => !suppressed.skip(LT_SOURCE_ID, line.sample.split("|"), -1, -1),
			),
		};
		const bytes = files
			.filter((file) => file.key.startsWith("vaspvt-"))
			.reduce((sum, file) => sum + file.bytes, 0);
		const sourceStats: SourceStats = {
			lines: result.lines,
			rows: rowCount,
			people: rowCount,
			quarantined: result.quarantined.length,
			bytes,
			skipped: result.skipped,
			counters: result.counters,
		};
		stats.sources = { [LT_SOURCE_ID]: sourceStats };
		stats.quarantine = {
			samples: result.quarantined
				.slice(0, 20)
				.map((line) => ({ source: LT_SOURCE_ID, lineNo: line.lineNo, reason: line.reason })),
		};
		stats.suppressedLines = { [LT_SOURCE_ID]: suppressed.summary().LT ?? null };
		const before = await previousSourceStats(sql);
		const checks = checkLtSource(LT_SOURCE_ID, sourceStats, before);
		guards.push(...checks);
		log(
			`${LT_SOURCE_ID}: ${result.lines} activity addresses, ${rowCount} pages, ${sourceStats.quarantined} quarantined, ${result.counters.inMunicipality} placed in their municipality only, ${result.counters.premisesDropped} premises numbers left out`,
		);
		const fileVerdict = verdict(checks, approved);
		if (!fileVerdict.ok) {
			const broken = fileVerdict.blocking.filter((check) => !check.approvable);
			if (broken.length > 0) {
				sourceErrors[LT_SOURCE_ID] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
			}
			log(
				`Guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "register guards failed");
		}

		const batch = buildLtBatch(result);
		stats.batch = {
			pages: batch.people.length,
			sites: batch.sites.length,
			services: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "LT",
			professions: [...LT_DEFAULT_PROFESSIONS],
			department: null,
		};
		const siteSources = [LT_SITE_SOURCE];
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageLt(tx, batch));
			merge.staged = staged;
			const placeChecks = checkLtPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeLtSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge pages", () => mergeLtPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeLtActivities(tx));
			merge.qualifications = await timer.run("merge licensed services", () =>
				mergeLtQualifications(tx),
			);
			merge.absences = await markLtMissing(tx);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "LT");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "LT"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "LT"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'LT' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'LT' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source = ${LT_SITE_SOURCE} AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source = ${LT_SITE_SOURCE} AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'LT')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'LT' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'LT' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'LT' AND indexable GROUP BY 1
				) x
			`;
			const [byPlaceKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'none') AS kind, count(*)::integer AS n
					FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
					WHERE s.source = ${LT_SITE_SOURCE} AND s.removed_at IS NULL GROUP BY 1
				) x
			`;
			const [listingsByKind] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(kind, n) AS counts FROM (
					SELECT coalesce(p.kind, 'country') AS kind, count(*)::integer AS n
					FROM directory.landing_pages lp LEFT JOIN directory.places p ON p.id = lp.place_id
					WHERE lp.country = 'LT' AND lp.indexable GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				indexableByListing: byListing?.counts ?? {},
				sitesByPlaceKind: byPlaceKind?.counts ?? {},
				indexableListingsByPlaceKind: listingsByKind?.counts ?? {},
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

/** The last successful Lithuanian run (the files compared against). */
async function previousLtRun(sql: Sql): Promise<PreviousLtRun | null> {
	const [row] = await sql<PreviousLtRun[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'lt' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** The register's stats in the last successful run. */
async function previousSourceStats(sql: Sql): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${LT_SOURCE_ID} AS stats FROM directory.etl_runs
		WHERE source = 'lt' AND status = 'succeeded' AND stats -> 'sources' ? ${LT_SOURCE_ID}
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Lithuanian run that saw exactly the same files. */
async function checkLtApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'lt'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Lithuanian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	if (files.some((file) => blocked.files?.[file.key]?.sha256 !== file.sha256)) {
		throw new Error(`--approve: the files changed since run ${runId}; review again`);
	}
	return true;
}
