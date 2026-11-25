/**
 * `etl:gb`: weekly import of the UK's NHS practice lists into the shared directory,
 * `country = 'GB'`: GP practices (and their branch surgeries), dental practices and
 * pharmacies of England and Wales (NHS England ODS), Scotland (Public Health Scotland) and
 * Northern Ireland (Business Services Organisation), all under the Open Government Licence.
 *
 * download each list (the latest CSV of a CKAN dataset, checksummed, retried) -> per-list
 * guards (quarantine, row floor, row and size changes) -> places (once) -> postcodes
 * (Code-Point Open, only the practices' own) -> one merge transaction (sites, practices,
 * activities, absences, suppressions, derived fields, read models, ANALYZE points as in #90)
 * -> circuit breakers on the UK's own pages -> COMMIT -> drain the outbox.
 *
 * A list that cannot be downloaded or read is left out of the run and keeps its rows (its
 * practices are neither updated nor counted missing); the run says so in `stats.sourceErrors`
 * and the command exits with code 3, as Austria's.
 */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GB_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import {
	GB_POSTCODES_FILES,
	GB_RESOURCE_PATTERNS,
	GB_SOURCE_FILES,
	type GbOptions,
} from "./config";
import {
	checkBreakers,
	checkGbPlaces,
	checkGbSource,
	checkOrphans,
	type GuardCheck,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql } from "./lib/db";
import { downloadFile, fetchJson, inspectLocalFile, type SourceFile } from "./lib/files";
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
	buildGbBatch,
	markGbMissing,
	mergeGbActivities,
	mergeGbPractitioners,
	mergeGbSites,
	stageGb,
} from "./merge-gb";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { parseBsoDental, parseBsoGp } from "./sources/gb/bso";
import { parseOdsBranches, parseOdsPractices } from "./sources/gb/ods";
import { latestResourceUrl, parsePhs } from "./sources/gb/phs";
import { fetchGbPlaceSources, importGbPlaces, readGbPlaceSources } from "./sources/gb/places";
import { readCodePoint } from "./sources/gb/postcodes";
import type { GbSourceId, ParseResult } from "./sources/gb/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** Identifier scheme of each list's practices, and the site source of its rows. */
export const GB_SOURCE_SCHEMES: Record<GbSourceId, { scheme: string; siteSource: string }> = {
	"ods-gp": { scheme: "GB-ODS-GP", siteSource: "gb-ods-gp" },
	// Branch surgeries are sites of the ODS GP practices, not practices of their own.
	"ods-branches": { scheme: "GB-ODS-GP", siteSource: "gb-ods-branch" },
	"ods-dent": { scheme: "GB-ODS-DENT", siteSource: "gb-ods-dent" },
	"ods-pharm": { scheme: "GB-ODS-PHARM", siteSource: "gb-ods-pharm" },
	"phs-gp": { scheme: "GB-PHS-GP", siteSource: "gb-phs-gp" },
	"phs-dent": { scheme: "GB-PHS-DENT", siteSource: "gb-phs-dent" },
	"phs-pharm": { scheme: "GB-PHS-PHARM", siteSource: "gb-phs-pharm" },
	"bso-gp": { scheme: "GB-BSO-GP", siteSource: "gb-bso-gp" },
	"bso-dent": { scheme: "GB-BSO-DENT", siteSource: "gb-bso-dent" },
};

/** A size floor and ceiling per downloaded file: outside them the file is broken, not unusual. */
const FILE_BYTES = { min: 1_000, max: 100 * 1024 * 1024 };

export type GbRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

/** Parses one list's file. Throws when the file is not what the list publishes. */
export async function parseGbFile(source: GbSourceId, path: string): Promise<ParseResult> {
	const data = await readFile(path);
	switch (source) {
		case "ods-gp":
		case "ods-dent":
		case "ods-pharm":
			return parseOdsPractices(source, data);
		case "ods-branches":
			return parseOdsBranches(data);
		case "phs-gp":
		case "phs-dent":
		case "phs-pharm":
			return parsePhs(source, data);
		case "bso-gp":
			return parseBsoGp(data);
		case "bso-dent":
			return parseBsoDental(data);
	}
}

/**
 * Downloads one list: an ODS report directly; a CKAN dataset's latest CSV resource (the
 * Scottish and Northern Irish lists publish a new file per period).
 */
async function fetchGbSource(
	source: GbSourceId,
	url: string,
	path: string,
): Promise<SourceFile & { resource?: string }> {
	if (!url.includes("/api/3/action/package_show")) {
		return downloadFile({ key: source, url, path, text: false });
	}
	const resource = latestResourceUrl(await fetchJson<unknown>(url), GB_RESOURCE_PATTERNS[source]);
	const file = await downloadFile({ key: source, url: resource.url, path, text: false });
	return { ...file, url, resource: resource.name };
}

export async function runGb(options: GbOptions, log: Logger = console.log): Promise<GbRunOutcome> {
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
	minimised: number;
	bytes: number;
	resource?: string;
	skipped: Record<string, number>;
};

type PreviousGbRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

const exists = (path: string) =>
	access(path).then(
		() => true,
		() => false,
	);

async function runLocked(
	sql: Sql,
	options: GbOptions,
	log: Logger,
	peakRss: () => number,
): Promise<GbRunOutcome> {
	const scope = { sources: options.sources };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('gb', 'running', ${JSON.stringify(scope)}::text::jsonb, ${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: United Kingdom, lists ${options.sources.join(",")}${options.dryRun ? " (dry run)" : ""}`,
	);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	const sourceErrors: Record<string, string> = {};
	let files: (SourceFile & { resource?: string })[] = [];
	let postcodesFile: SourceFile | null = null;
	const createdWorkDir = !options.workDir && !options.sourceDir;
	const workDir =
		options.workDir ??
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-gb-")));

	const finish = async (status: RunStatus, error?: string): Promise<GbRunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
		if (Object.keys(sourceErrors).length > 0) stats.sourceErrors = sourceErrors;
		const fileInfo = Object.fromEntries(
			files.map((file) => [
				file.key,
				{
					url: file.url,
					resolvedUrl: file.resolvedUrl,
					resource: file.resource,
					bytes: file.bytes,
					sha256: file.sha256,
					lastModified: file.lastModified,
				},
			]),
		);
		if (postcodesFile) {
			stats.postcodesFile = {
				url: postcodesFile.url,
				bytes: postcodesFile.bytes,
				sha256: postcodesFile.sha256,
			};
		}
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
			const fetched: (SourceFile & { resource?: string })[] = [];
			for (const source of options.sources) {
				try {
					const file = options.sourceDir
						? await inspectLocalFile(
								source,
								join(options.sourceDir, GB_SOURCE_FILES[source]),
								false,
							)
						: await fetchGbSource(
								source,
								options.urls[source],
								join(workDir ?? tmpdir(), GB_SOURCE_FILES[source]),
							);
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
		if (files.length === 0) return await finish("failed", "no UK list could be fetched");

		const previous = await previousGbRun(sql);
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
		const approved = await checkGbApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country gb`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places WHERE country = 'GB'
		`;
		if (places === 0) {
			stats.places = await timer.run("import UK places", async () =>
				importGbPlaces(
					sql,
					options.sourceDir
						? await readGbPlaceSources(options.sourceDir)
						: await fetchGbPlaceSources(options.placesUrls, workDir ?? tmpdir()),
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
				const source = file.key as GbSourceId;
				let result: ParseResult;
				try {
					result = await parseGbFile(source, file.path);
				} catch (error) {
					sourceErrors[source] = `parse: ${error instanceof Error ? error.message : String(error)}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const people = new Set(
					result.rows.map((row) => (row.main ? `${row.idScheme}:${row.nationalId}` : row.siteKey)),
				).size;
				const rowCount = result.rows.length;
				// GDPR objections: the rows of a suppressed key are dropped here, before anything is
				// staged, and so are quarantined samples that name one (#116).
				const suppressed = await SuppressedLines.load(sql, {
					country: "GB",
					idScheme: GB_SOURCE_SCHEMES[source].scheme,
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
				suppressedLines[source] = suppressed.summary().GB ?? null;
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people,
					quarantined: result.quarantined.length,
					minimised: result.minimised,
					bytes: file.bytes,
					...(file.resource ? { resource: file.resource } : {}),
					skipped: result.skipped,
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkGbSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					sourceErrors[source] = `guards: ${broken.map((check) => check.detail).join("; ")}`;
					log(`${source}: left out of this run (${sourceErrors[source]})`);
					continue;
				}
				results.push(result);
				log(
					`${source}: ${current.rows} rows, ${people} practices, ${current.quarantined} quarantined, ${current.minimised} named after a person`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (results.length === 0) return await finish("failed", "no UK list passed its checks");
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
		const schemes = [
			...new Set(
				loaded
					.filter((source) => source !== "ods-branches")
					.map((source) => GB_SOURCE_SCHEMES[source].scheme),
			),
		];
		const siteSources = loaded.map((source) => GB_SOURCE_SCHEMES[source].siteSource);
		const batch = buildGbBatch(results);
		stats.batch = {
			practices: batch.people.length,
			sites: batch.sites.length,
			orphanBranches: batch.orphanBranches,
			duplicates: batch.duplicates,
		};

		// 4. Postcodes: Code-Point Open, read for the practices' postcodes only.
		const wanted = new Set(
			batch.sites.map((site) => site.postcode).filter((postcode): postcode is string => !!postcode),
		);
		const postcodes = await timer.run("locate postcodes", async () => {
			let path: string | null = null;
			if (options.sourceDir) {
				for (const name of GB_POSTCODES_FILES) {
					const candidate = join(options.sourceDir, name);
					if (await exists(candidate)) {
						postcodesFile = await inspectLocalFile("gb-postcodes", candidate, false);
						path = candidate;
						break;
					}
				}
				if (!path) throw new Error("Code-Point Open is missing from --source-dir");
			} else {
				postcodesFile = await downloadFile({
					key: "gb-postcodes",
					url: options.postcodesUrl,
					path: join(workDir ?? tmpdir(), GB_POSTCODES_FILES[0]),
					text: false,
				});
				path = postcodesFile.path;
			}
			return readCodePoint(await readFile(path), wanted);
		});
		log(`Postcodes: ${postcodes.size} of ${wanted.size} located by Code-Point Open`);

		// 5. Merge, in one transaction.
		const ctx = {
			runId,
			country: "GB",
			professions: [...GB_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageGb(tx, batch, postcodes));
			merge.staged = staged;
			const placeChecks = checkGbPlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeGbSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge practices", () => mergeGbPractitioners(tx));
			merge.activities = await timer.run("merge activities", () =>
				mergeGbActivities(tx, schemes, siteSources),
			);
			merge.absences = await markGbMissing(tx, schemes);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "GB");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "GB"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "GB"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'GB' AND status = 'active')::integer AS practices,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'GB' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'gb-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'gb-%' AND removed_at IS NULL AND geo_source = 'postcode')::integer AS located,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'gb-%' AND removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'GB' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [bySource] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(id_scheme, n) AS counts FROM (
					SELECT id_scheme, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'GB' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'GB' AND indexable GROUP BY 1
				) x
			`;
			merge.totals = {
				...totals,
				bySource: bySource?.counts ?? {},
				indexableByProfession: byProfession?.counts ?? {},
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

/** The last successful UK run (files compared against). */
async function previousGbRun(sql: Sql): Promise<PreviousGbRun | null> {
	const [row] = await sql<PreviousGbRun[]>`
		SELECT id, files FROM directory.etl_runs
		WHERE source = 'gb' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** A list's stats in the last successful run that loaded it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'gb' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked UK run that saw exactly the same files. */
async function checkGbApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'gb'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not a UK run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
