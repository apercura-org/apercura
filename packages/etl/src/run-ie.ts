/**
 * `etl:ie`: weekly import of Ireland's facilities into the shared directory, `country = 'IE'`:
 * the PSI's register of pharmacies, HIQA's register of designated centres for older people
 * (both under their publishers' re-use conditions) and the HSE's Health Atlas layers of
 * hospitals and health centres (CC BY 4.0, a March 2020 snapshot) (`sources/ie/types.ts`).
 *
 * download each list (retried) and each layer's item -> check each list's terms or licence ->
 * places (once: `etl:places --country ie`) -> parse, place and guard each list (quarantine,
 * floors, changes) -> drop the HSE hospitals that are a HIQA centre (`combineIeLists`) -> one
 * merge transaction (sites, facilities, activities, qualifications, absences, suppressions,
 * derived fields, read models, ANALYZE points as in #90) -> circuit breakers on Ireland's own
 * pages -> COMMIT -> drain the outbox.
 *
 * A list that cannot be downloaded or read, whose terms or licence changed, or that fails its
 * checks is left out of the run and keeps its rows: the run imports the others, says so in
 * `stats.sourceErrors`, and the command exits with code 3, as in Switzerland and Italy. When no
 * list can be read the run fails and the pages stay as they are. Unchanged lists are skipped.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IE_HSE_ATLAS_DATE } from "@apercura/core/country";
import { IE_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import type { IeOptions } from "./config";
import {
	type AtSourceStats,
	checkBreakers,
	checkIePlaces,
	checkIeSource,
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
	buildIeBatch,
	markIeMissing,
	mergeIeActivities,
	mergeIePractitioners,
	mergeIeQualifications,
	mergeIeSites,
	stageIe,
} from "./merge-ie";
import { drainOutbox } from "./outbox";
import type { Logger, RunOutcome, RunStatus } from "./run-fr";
import { StepTimer, startMemorySampler } from "./run-fr";
import { combineIeLists, type IePlacedList, placeIeList } from "./sources/ie/combine";
import { parseHiqa } from "./sources/ie/hiqa";
import { checkHseItem, parseHseLayer } from "./sources/ie/hse";
import { loadIeLocator, locateIePoints } from "./sources/ie/locate";
import { fetchIePlaceSources, importIePlaces, readIePlaceSources } from "./sources/ie/places";
import { parsePsi } from "./sources/ie/psi";
import { IE_SOURCES, type IeSourceId, type ParseResult } from "./sources/ie/types";
import { SuppressedLines, type SuppressedLinesSummary } from "./suppressions";

/** A size ceiling of a list: above it the file is not the list. */
const MAX_BYTES = 50 * 1024 * 1024;

export type IeRunOutcome = RunOutcome & { sourceErrors: Record<string, string> };

type SourceStats = AtSourceStats & {
	bytes: number;
	skipped: Record<string, number>;
	counters: Record<string, number>;
	placed: IePlacedList["placed"];
	/** The PSI's "correct at" date (`2026-11-02`). */
	correctAt?: string | null;
	/** An HSE layer's item's last change (ISO 8601), and the month of the Health Atlas's snapshot. */
	modified?: string | null;
	snapshot?: string;
};

type PreviousIeRun = {
	id: number;
	files: Record<string, { sha256: string; bytes: number }> | null;
};

export async function runIe(options: IeOptions, log: Logger = console.log): Promise<IeRunOutcome> {
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

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function runLocked(
	sql: Sql,
	options: IeOptions,
	log: Logger,
	peakRss: () => number,
): Promise<IeRunOutcome> {
	const scope = { sources: options.sources };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('ie', 'running', ${JSON.stringify(scope)}::text::jsonb,
			${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: Ireland, PSI, HIQA and HSE (${options.sources.join(", ")})${options.dryRun ? " (dry run)" : ""}`,
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
		(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-ie-")));
	const leaveOut = (source: string, error: string) => {
		sourceErrors[source] = error;
		log(`${source}: left out of this run (${error})`);
	};

	const finish = async (status: RunStatus, error?: string): Promise<IeRunOutcome> => {
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
		// 1. The lists, and each HSE layer's item (its licence): each on its own, so one failing
		// download never stops the others. The items are not compared between runs (their view
		// counts change every day); their licence and last change are.
		const items: Partial<Record<IeSourceId, { modified: string | null }>> = {};
		files = await timer.run("fetch sources", async () => {
			const fetched: SourceFile[] = [];
			for (const source of options.sources) {
				const config = IE_SOURCES[source];
				try {
					if (config.item) {
						const raw = options.sourceDir
							? await readFile(join(options.sourceDir, config.item.file), "utf8")
							: await readFile(
									(
										await downloadFile({
											key: `${source}-item`,
											url: config.item.url,
											path: join(workDir ?? tmpdir(), config.item.file),
											text: true,
										})
									).path,
									"utf8",
								);
						items[source] = checkHseItem(raw);
					}
					const file = options.sourceDir
						? await inspectLocalFile(source, join(options.sourceDir, config.file), false)
						: await downloadFile({
								key: source,
								url: options.urls[source] ?? config.url,
								path: join(workDir ?? tmpdir(), config.file),
								text: false,
							});
					if (file.bytes < config.minBytes || file.bytes > MAX_BYTES) {
						throw new Error(`${file.bytes} bytes, outside ${config.minBytes}–${MAX_BYTES}`);
					}
					// HIQA's export is live: its day is the server's Last-Modified, else the run's.
					if (source === "hiqa" && (options.sourceDir || !file.lastModified)) {
						file.lastModified = options.today;
					}
					fetched.push(file);
					log(`${source}: ${file.bytes} bytes, sha256 ${file.sha256.slice(0, 12)}`);
				} catch (error) {
					const text = message(error);
					leaveOut(source, /^(?:licence|terms) changed/.test(text) ? text : `fetch: ${text}`);
				}
			}
			return fetched;
		});
		if (files.length === 0) return await finish("failed", "no list could be fetched");

		const previous = await previousIeRun(sql);
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
			// The PSI's date as the last run read it (the web's data page reads it from `files`).
			const known = previous.files as Record<string, { lastModified?: string | null }>;
			for (const file of files)
				file.lastModified = known[file.key]?.lastModified ?? file.lastModified;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			return await finish("skipped");
		}
		const approved = await checkIeApproval(sql, options.approveRunId, files);

		// 2. Places (once, or with `etl:places --country ie`).
		const [{ places, lookup } = { places: 0, lookup: 0 }] = await sql<
			{ places: number; lookup: number }[]
		>`
			SELECT (SELECT count(*) FROM directory.places WHERE country = 'IE')::integer AS places,
				(SELECT count(*) FROM directory.place_lookup WHERE country = 'IE')::integer AS lookup
		`;
		if (places === 0 || lookup === 0) {
			stats.places = await timer.run("import Irish places", async () =>
				importIePlaces(
					sql,
					options.sourceDir
						? await readIePlaceSources(options.sourceDir)
						: await fetchIePlaceSources(workDir ?? tmpdir(), options.placesUrls),
					runId,
				),
			);
		}
		const locator = await loadIeLocator(sql);
		if (locator.townCount === 0)
			return await finish("failed", "no Irish town to place facilities in");

		// 3. Parse, place and check each list.
		const lists: IePlacedList[] = [];
		const sourceStats: Record<string, SourceStats> = {};
		const quarantineSamples: { source: string; lineNo: number; reason: string }[] = [];
		const suppressedLines: Record<string, SuppressedLinesSummary[string] | null> = {};
		await timer.run("parse and place lists", async () => {
			for (const file of files) {
				const source = file.key as IeSourceId;
				const config = IE_SOURCES[source];
				let result: ParseResult;
				try {
					const data = await readFile(file.path);
					result =
						source === "psi"
							? await parsePsi(data)
							: source === "hiqa"
								? parseHiqa(data.toString("utf8"))
								: parseHseLayer(source, data.toString("utf8"));
				} catch (error) {
					const text = message(error);
					leaveOut(source, /^(?:licence|terms) changed/.test(text) ? text : `parse: ${text}`);
					continue;
				}
				if (source === "psi") {
					result.facts.correctAt ??= null;
					// The web's data page dates the register by the day the PSI says it is correct at.
					if (result.facts.correctAt) file.lastModified = String(result.facts.correctAt);
				}
				// Counted as the list holds them: a suppression never looks like a shrinking list.
				const rowCount = result.rows.length;
				// Objections: the rows of a suppressed facility are dropped before anything is staged.
				const suppressed = await SuppressedLines.load(sql, {
					country: "IE",
					idScheme: config.idScheme,
				});
				result = {
					...result,
					rows: result.rows.filter(
						(row) => !suppressed.skip(source, [row.nationalId], 0, 1, row.professionCode),
					),
					quarantined: result.quarantined.filter(
						(line) => !suppressed.skip(source, [line.sample], 0, 1),
					),
				};
				suppressedLines[source] = suppressed.summary().IE ?? null;
				const points = await locateIePoints(
					sql,
					result.rows.flatMap((row) =>
						row.latitude !== null && row.longitude !== null
							? [{ key: row.nationalId, longitude: row.longitude, latitude: row.latitude }]
							: [],
					),
				);
				const placed = placeIeList(result, locator, points);
				const current: SourceStats = {
					lines: result.lines,
					rows: rowCount,
					people: rowCount,
					quarantined: result.quarantined.length,
					bytes: file.bytes,
					skipped: result.skipped,
					counters: result.counters,
					placed: placed.placed,
					...(source === "psi"
						? { correctAt: (result.facts.correctAt as string | null) ?? null }
						: {}),
					...(config.item
						? { modified: items[source]?.modified ?? null, snapshot: IE_HSE_ATLAS_DATE }
						: {}),
				};
				sourceStats[source] = current;
				for (const line of result.quarantined.slice(0, 20)) {
					quarantineSamples.push({ source, lineNo: line.lineNo, reason: line.reason });
				}
				const before = await previousSourceStats(sql, source);
				const checks = checkIeSource(source, current, before);
				const broken = checks.filter((check) => !check.ok && !check.approvable);
				guards.push(...checks);
				if (broken.length > 0) {
					leaveOut(source, `guards: ${broken.map((check) => check.detail).join("; ")}`);
					continue;
				}
				lists.push(placed);
				log(
					`${source}: ${result.lines} lines, ${rowCount} facilities, ${current.quarantined} quarantined, placed ${JSON.stringify(placed.placed)}`,
				);
			}
		});
		stats.sources = sourceStats;
		stats.quarantine = { samples: quarantineSamples };
		stats.suppressedLines = suppressedLines;
		if (lists.length === 0) return await finish("failed", "no list passed its checks");
		const fileVerdict = verdict(
			guards.filter((check) => lists.some((list) => check.name.startsWith(`${list.source}.`))),
			approved,
		);
		if (!fileVerdict.ok) {
			log(
				`Guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "list guards failed");
		}

		const combined = combineIeLists(lists, locator);
		stats.combine = combined.stats;
		if (combined.stats.hseDuplicatesOfHiqa > 0) {
			log(
				`${combined.stats.hseDuplicatesOfHiqa} HSE hospitals are a HIQA centre, not imported (e.g. ${combined.stats.duplicateExamples
					.slice(0, 3)
					.map((example) => `${example.key} = HIQA ${example.hiqa}`)
					.join(", ")})`,
			);
		}
		if (combined.stats.hseHeldBack > 0) {
			log(`Without HIQA's register, ${combined.stats.hseHeldBack} HSE care hospitals are not read`);
		}
		const loaded = lists.map((list) => list.source);
		const siteSources = loaded.map((source) => IE_SOURCES[source].registry);
		const batch = buildIeBatch(combined.facilities, combined.spared);
		stats.batch = {
			facilities: batch.people.length,
			sites: batch.sites.length,
			qualifications: batch.qualifications.length,
		};

		// 4. Merge, in one transaction.
		const ctx = {
			runId,
			country: "IE",
			professions: [...IE_DEFAULT_PROFESSIONS],
			department: null,
		};
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			const staged = await timer.run("stage and place", () => stageIe(tx, batch));
			merge.staged = staged;
			const placeChecks = checkIePlaces(staged);
			const placeVerdict = verdict(placeChecks, approved);
			if (!placeVerdict.ok) {
				await tx.rollback();
				return { committed: false, merge, breakers: placeChecks, verdict: placeVerdict };
			}
			const sites = await timer.run("merge sites", () => mergeIeSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge facilities", () => mergeIePractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeIeActivities(tx, loaded));
			merge.qualifications = await timer.run("merge qualifications", () =>
				mergeIeQualifications(tx),
			);
			merge.absences = await markIeMissing(tx, loaded);
			merge.suppressions = await applySuppressions(tx, runId);
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () =>
				recomputeDerived(tx, ctx, siteSources),
			);
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx, "IE");
			const models = await timer.run("read models", () => refreshReadModels(tx, runId, "IE"));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [...sites.ids, ...derived.removedSites]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx, "IE"));
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
					(SELECT count(*) FROM directory.practitioners WHERE country = 'IE' AND status = 'active')::integer AS facilities,
					(SELECT count(*) FROM directory.practitioners WHERE country = 'IE' AND indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ie-%' AND removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ie-%' AND removed_at IS NULL AND geo_precision = 'address')::integer AS "listPoint",
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ie-%' AND removed_at IS NULL AND geo_precision = 'city')::integer AS "townPoint",
					(SELECT count(*) FROM directory.sites WHERE source LIKE 'ie-%' AND removed_at IS NULL AND location IS NULL)::integer AS unlocated,
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'IE')::integer AS "listingPages",
					(SELECT count(*) FROM directory.landing_pages WHERE country = 'IE' AND indexable)::integer AS listings,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			const [byProfession] = await tx<{ counts: Record<string, number> | null }[]>`
				SELECT jsonb_object_agg(profession_code, n) AS counts FROM (
					SELECT profession_code, count(*)::integer AS n FROM directory.practitioners
					WHERE country = 'IE' AND status = 'active' GROUP BY 1
				) x
			`;
			const [byCounty] = await tx<{ counts: Record<string, Record<string, number>> | null }[]>`
				SELECT jsonb_object_agg(county, kinds) AS counts FROM (
					SELECT county, jsonb_object_agg(profession_code, n) AS kinds FROM (
						SELECT pl.department_code AS county, p.profession_code, count(DISTINCT p.id)::integer AS n
						FROM directory.practitioners p
						JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
						JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
						JOIN directory.places pl ON pl.id = s.place_id
						WHERE p.country = 'IE' AND p.status = 'active'
						GROUP BY 1, 2
					) x GROUP BY 1
				) y
			`;
			merge.totals = {
				...totals,
				byProfession: byProfession?.counts ?? {},
				byCounty: byCounty?.counts ?? {},
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
		const text = message(error);
		log(`Run ${runId} failed: ${text}`);
		await finish("failed", text).catch(() => {});
		throw error;
	}
}

/**
 * The last successful Irish run (the lists compared against), or null when it left a list out:
 * such a run never makes the next one skip.
 */
async function previousIeRun(sql: Sql): Promise<PreviousIeRun | null> {
	const [row] = await sql<(PreviousIeRun & { partial: boolean })[]>`
		SELECT id, files, stats ? 'sourceErrors' AS partial
		FROM directory.etl_runs
		WHERE source = 'ie' AND status = 'succeeded' AND stats ? 'sources'
		ORDER BY id DESC
		LIMIT 1
	`;
	return row && !row.partial ? { id: row.id, files: row.files } : null;
}

/** A list's stats in the last successful run that read it (it may have been left out since). */
async function previousSourceStats(sql: Sql, source: string): Promise<SourceStats | null> {
	const [row] = await sql<{ stats: SourceStats }[]>`
		SELECT stats -> 'sources' -> ${source} AS stats FROM directory.etl_runs
		WHERE source = 'ie' AND status = 'succeeded' AND stats -> 'sources' ? ${source}
			AND NOT coalesce(stats -> 'sourceErrors' ? ${source}, false)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row?.stats ?? null;
}

/** `--approve=<id>`: the run must be a blocked Irish run that saw exactly the same lists. */
async function checkIeApproval(sql: Sql, runId: number | null, files: SourceFile[]) {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'ie'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} is not an Irish run`);
	if (blocked.status !== "blocked") {
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	}
	const same =
		files.length === Object.keys(blocked.files ?? {}).length &&
		files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same) throw new Error(`--approve: the lists changed since run ${runId}; review again`);
	return true;
}
