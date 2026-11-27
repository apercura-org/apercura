/**
 * `etl:no`: weekly import of Norway's establishments of care into the shared directory,
 * `country = 'NO'`, from the Brønnøysund Register Centre's Central Coordinating Register for
 * Legal Entities (Enhetsregisteret, NLOD 2.0: its establishments and their owners), located with
 * Kartverket's addresses (Matrikkelen – Adresse, CC BY 4.0).
 *
 * download each file (checksummed, retried) -> an unchanged set of files ends the run (exit 0,
 * a cheap no-op) -> places (once: Kartverket's counties and municipalities) -> the register's
 * establishments under a listed industry code, their owners, the filters -> guards (quarantine,
 * floors, changes since the last success) -> the addresses and postcodes they name, read from
 * the address file -> placing -> one merge transaction (sites, establishments, activities,
 * qualifications, absences, suppressions, derived fields, read models, ANALYZE points as in #90)
 * -> circuit breakers on Norway's own pages -> COMMIT -> drain the outbox.
 *
 * Norway has one source, read from two files of the register: when either cannot be downloaded
 * or read, the run fails and the pages stay as they are (`stats.sourceErrors` says why). The
 * address file locates every establishment: without it the run fails too.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { NoOptions } from "./config";
import {
	checkBreakers,
	checkNoPlaces,
	checkNoSource,
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
	addressLookups,
	buildNoBatch,
	markNoMissing,
	mergeNoActivities,
	mergeNoPractitioners,
	mergeNoQualifications,
	mergeNoSites,
	stageNo,
} from "./merge-no";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { readAddressIndex } from "./sources/no/addresses";
import { parseBrreg } from "./sources/no/brreg";
import {
	fetchNoPlaceSources,
	importNoPlaces,
	loadNoPlaceIndex,
	readNoPlaceSources,
} from "./sources/no/places";
import {
	NO_FILE_IDS,
	NO_FILES,
	NO_SOURCES,
	type NoFileId,
	type NoSourceId,
	type ParseResult,
} from "./sources/no/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size floor and ceiling of a file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 2_000, max: 600 * 1024 * 1024 };

/**
 * Records a real download holds at least (November 2026: 873,697 establishments, about 1.2
 * million entities, 2.6 million addresses); fewer means a truncated file. The synthetic fixtures,
 * read with `--source-dir`, are exempt.
 */
const MIN_RECORDS = { underenheter: 500_000, enheter: 800_000, adresser: 2_000_000 } as const;

export type NoRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = {
	lines: number;
	candidates: number;
	rows: number;
	people: number;
	quarantined: number;
	bytes: number;
	entityLines: number;
	skipped: Record<string, number>;
	counters: ParseResult["counters"];
};

type PreviousNoRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runNo(options: NoOptions, log: Logger = console.log): Promise<NoRunOutcome> {
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

/** The files of a source: the register's two for `brreg`. */
const SOURCE_FILES: Readonly<Record<NoSourceId, readonly NoFileId[]>> = {
	brreg: ["underenheter", "enheter"],
};

async function runLocked(
	sql: Sql,
	options: NoOptions,
	log: Logger,
	peakRss: () => number,
): Promise<NoRunOutcome> {
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('no', 'running', ${JSON.stringify({ sources: options.sources })}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Norway, the register's establishments (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-no-")));

	const finish = async (status: RunStatus, error?: string): Promise<NoRunOutcome> => {
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
		// 1. The files, one at a time (the address file and the entities' are large).
		const keys: NoFileId[] = [
			...NO_FILE_IDS.filter((key) =>
				options.sources.some((source) => SOURCE_FILES[source].includes(key)),
			),
			"adresser",
		];
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const key of keys) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(key, join(options.sourceDir, NO_FILES[key]), false)
						: await downloadFile({
								key,
								url: options.urls[key],
								path: join(workDir ?? tmpdir(), NO_FILES[key]),
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
					if (key === "adresser") throw new Error(`the address file: ${message}`);
					for (const source of options.sources) {
						if (SOURCE_FILES[source].includes(key)) sourceErrors[source] = `${key}: ${message}`;
					}
					log(`${key}: ${message}`);
				}
			}
			return fetched;
		});
		const readable = options.sources.filter((source) => !sourceErrors[source]);
		if (readable.length === 0)
			return await finish("failed", "no Norwegian source could be fetched");

		const previous = await previousNoRun(sql);
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
		const approved = await checkNoApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country no`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'NO'
		`;
		if (places === 0) {
			stats.places = await timer.run("import Norwegian places", async () =>
				importNoPlaces(
					sql,
					options.sourceDir
						? await readNoPlaceSources(options.sourceDir)
						: await fetchNoPlaceSources(options.placesUrl, workDir ?? tmpdir()),
					runId,
				),
			);
		}

		// 3. Parse and check the source.
		const results: ParseResult[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse sources", async () => {
			for (const source of readable) {
				const fileOf = (key: NoFileId) => files.find((candidate) => candidate.key === key);
				const establishments = fileOf("underenheter");
				const entities = fileOf("enheter");
				if (!establishments || !entities) continue;
				let result: ParseResult;
				try {
					result = await parseBrreg(establishments.path, entities.path);
					if (!options.sourceDir && result.lines < MIN_RECORDS.underenheter) {
						throw new Error(
							`the establishments' file holds ${result.lines} records (at least ${MIN_RECORDS.underenheter} expected)`,
						);
					}
					if (!options.sourceDir && result.entityLines < MIN_RECORDS.enheter) {
						throw new Error(
							`the entities' file holds ${result.entityLines} records (at least ${MIN_RECORDS.enheter} expected)`,
						);
					}
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the source holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed establishment are dropped here, before
				// anything is staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "NO",
					idScheme: NO_SOURCES[source].scheme,
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
				suppressedLines[source] = suppressed.summary().NO ?? null;
				const current: SourceStats = {
					lines: result.lines,
					candidates: result.candidates,
					rows: rowCount,
					people: rowCount,
					quarantined: result.quarantined.length,
					bytes: establishments.bytes + entities.bytes,
					entityLines: result.entityLines,
					skipped: result.skipped,
					counters: result.counters,
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkNoSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${result.lines} establishments, ${result.candidates} under a listed code, ${rowCount} kept, ${current.quarantined} quarantined, skipped ${JSON.stringify(result.skipped)}`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0)
			return await finish("failed", "no Norwegian source passed its checks");
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

		// 4. The addresses and postcodes the establishments name, then the places.
		const addressFile = files.find((file) => file.key === "adresser");
		if (!addressFile) throw new Error("the address file was not fetched");
		const lookups = addressLookups(results);
		const addresses = await timer.run("read addresses", async () =>
			readAddressIndex(
				await readFile(addressFile.path),
				lookups.addresses,
				lookups.postcodes,
				options.sourceDir ? 1 : MIN_RECORDS.adresser,
			),
		);
		stats.addresses = {
			lines: addresses.lines,
			extractedOn: addresses.extractedOn,
			byAddress: addresses.byAddress.size,
			byPostcode: addresses.byPostcode.size,
		};
		const municipalities = await loadNoPlaceIndex(sql);
		const loaded = results.map((result) => result.source);
		const siteSources = loaded.map((source) => NO_SOURCES[source].siteSource);
		const batch = buildNoBatch(results, municipalities, addresses);
		stats.batch = {
			establishments: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
			placement: batch.placement,
		};
		log(
			`placed: ${batch.placement.address} at their address, ${batch.placement.postcode} at their postcode's centre, ${batch.placement.municipality} at their municipality's point, ${batch.placement.unplaced} left out`,
		);

		// 5. Merge, in one transaction.
		const ctx = {
			runId,
			country: "NO",
			professions: [...NO_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage", () => stageNo(tx, batch));
			merge.staged = staged;
			const placeChecks = checkNoPlaces(batch.placement);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeNoSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge establishments", () => mergeNoPractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeNoActivities(tx, loaded));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeNoQualifications(tx),
			);
			merge.absences = await markNoMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "NO");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "NO"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "NO"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'NO' AND status = 'active')::integer AS establishments,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'NO' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "atAddress",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL AND geo_source = 'postcode')::integer AS "atPostcode",
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.sites WHERE country_code = 'NO' AND source LIKE 'no-%' AND removed_at IS NULL AND phone IS NOT NULL)::integer AS "withPhone",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'NO')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'NO' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'NO' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byListing] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(listing_slug, n) AS counts FROM (
					SELECT listing_slug, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'NO' AND indexable GROUP BY 1
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
 * The last successful Norwegian run (the files compared against), or null when it left a source
 * out: such a run never makes the next one skip.
 */
async function previousNoRun(sql: Sql): Promise<PreviousNoRun | null> {
	const [row] = await sql<(PreviousNoRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial FROM directory.etl_runs
		WHERE source = 'no' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A source's stats in the last successful run that read it. */
async function previousSourceStats(sql: Sql, source: NoSourceId): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'no' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Norwegian run that saw exactly the same files. */
async function checkNoApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'no'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a Norwegian run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the files changed since run ${runId}; review again`);
	return true;
}
