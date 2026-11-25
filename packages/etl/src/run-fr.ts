/**
 * `etl:fr`: weekly import of the French open data.
 *
 * download -> file guards -> stream-parse -> COPY into staging -> staging
 * guards -> one merge transaction (sites, practitioners, activities,
 * qualifications, absences, suppressions, FINESS, geocoding, Ameli, derived
 * fields, read models) -> circuit breakers -> COMMIT -> drain the cache
 * invalidation outbox.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FR_EXCLUDED_PROFESSIONS, FR_PROFESSIONS } from "@apercura/core/taxonomy";
import { type AnsFileKey, type FrOptions, SOURCE_DIR_FILES } from "./config";
import {
	acceptGeocode,
	emptyGeocodeResult,
	type GeocodeResult,
	geocodeBatch,
	geocodeInput,
	siteLabel,
} from "./geocode";
import {
	checkBreakers,
	checkFiles,
	checkOrphans,
	checkQuarantine,
	checkStaging,
	type GuardCheck,
	type StagingStats,
	verdict,
} from "./guards";
import { acquireImportLock, connect, type Sql, type TransactionSql } from "./lib/db";
import { downloadFile, inspectLocalFile, type SourceFile } from "./lib/files";
import { type LoadStats, loadPipeFile, Quarantine } from "./lib/load";
import {
	analyzeTables,
	applySiteLabels,
	applySiteLocations,
	applySuppressions,
	DERIVED_TABLES,
	enqueueSiteTags,
	enrichFromFiness,
	MERGED_TABLES,
	markMissing,
	matchAmeli,
	mergeActivities,
	mergePractitioners,
	mergeQualifications,
	mergeSites,
	orphanedPages,
	READ_MODEL_TABLES,
	recomputeDerived,
	refreshReadModels,
	restoreOwnNameAccentsInSites,
	restoreSiteNameAccents,
	type SiteLabelUpdate,
	type SiteLocation,
	sitesToGeocode,
	stageScope,
	stageSites,
	suppressedIndexablePages,
	syncTaxonomy,
	unpublishedExamples,
} from "./merge";
import { drainOutbox } from "./outbox";
import { loadAmeli } from "./sources/fr/ameli";
import {
	type ActivityRow,
	DIPLOMES_COLUMNS,
	PERSONNE_ACTIVITE_COLUMNS,
	parseDiplomeLine,
	parsePersonneActiviteLine,
	parseSavoirFaireLine,
	type QualificationRow,
	SAVOIR_FAIRE_COLUMNS,
	STG_ACTIVITY_COLUMNS,
	STG_QUALIFICATION_COLUMNS,
} from "./sources/fr/annuaire-sante";
import { loadFiness, resolveLatestFinessUrl } from "./sources/fr/finess";
import { fetchPlaceSources, importPlaces, readPlaceSources } from "./sources/fr/places";

export type RunStatus = "succeeded" | "failed" | "blocked" | "skipped" | "dry_run";

export type RunOutcome = {
	runId: number;
	status: RunStatus;
	stats: Record<string, unknown>;
	guards: GuardCheck[];
};

export type Logger = (message: string) => void;

const ANS_KEYS: AnsFileKey[] = ["personneActivite", "savoirFaire", "diplomes"];

const STAGING_TABLES = [
	"directory.stg_ans_activities",
	"directory.stg_ans_qualifications",
	"directory.stg_finess",
	"directory.stg_ameli",
	"directory.stg_quarantine",
];

function startMemorySampler() {
	let peak = process.memoryUsage().rss;
	const timer = setInterval(() => {
		peak = Math.max(peak, process.memoryUsage().rss);
	}, 250);
	timer.unref();
	return {
		peak: () => Math.max(peak, process.memoryUsage().rss),
		stop: () => clearInterval(timer),
	};
}

class StepTimer {
	readonly durations: Record<string, number> = {};
	constructor(private readonly log: Logger) {}
	async run<T>(name: string, step: () => Promise<T>): Promise<T> {
		const started = performance.now();
		this.log(`${name}…`);
		const result = await step();
		const elapsed = Math.round(performance.now() - started);
		this.durations[name] = elapsed;
		this.log(`${name} done in ${(elapsed / 1000).toFixed(1)} s`);
		return result;
	}
}

type PreviousRun = {
	id: number;
	files: Record<string, { bytes: number; sha256: string }> | null;
	stats: { staging?: StagingStats } | null;
};

export async function runFr(options: FrOptions, log: Logger = console.log): Promise<RunOutcome> {
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
	options: FrOptions,
	log: Logger,
	peakRss: () => number,
): Promise<RunOutcome> {
	const scope = { professions: options.professions, department: options.department };
	const [run] = await sql<{ id: number }[]>`
		INSERT INTO directory.etl_runs (source, status, scope, dry_run, approved_run_id)
		VALUES ('fr', 'running', ${JSON.stringify(scope)}::text::jsonb, ${options.dryRun}, ${options.approveRunId})
		RETURNING id
	`;
	if (!run) throw new Error("Could not create the etl_runs row");
	const runId = run.id;
	log(
		`Run ${runId}: professions ${options.professions.join(",")}${options.department ? `, department ${options.department}` : ""}${options.dryRun ? " (dry run)" : ""}`,
	);

	const timer = new StepTimer(log);
	const started = performance.now();
	const stats: Record<string, unknown> = {};
	const guards: GuardCheck[] = [];
	let files: SourceFile[] = [];
	let workDir: string | null = null;

	const finish = async (status: RunStatus, error?: string): Promise<RunOutcome> => {
		stats.durationMs = Math.round(performance.now() - started);
		stats.steps = timer.durations;
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
		return { runId, status, stats, guards };
	};

	try {
		// 1. Source files.
		const createdWorkDir = !options.workDir && !options.sourceDir;
		workDir =
			options.workDir ??
			(options.sourceDir ? null : await mkdtemp(join(tmpdir(), "apercura-etl-")));
		files = await timer.run("fetch sources", () => acquireFiles(options, workDir, log));
		const fileByKey = new Map(files.map((file) => [file.key, file]));

		const previousSameScope = await previousRun(sql, options, true);
		const previousAny = await previousRun(sql, options, false);

		if (
			previousSameScope?.files &&
			!options.force &&
			!options.dryRun &&
			options.approveRunId === null &&
			files.every((file) => previousSameScope.files?.[file.key]?.sha256 === file.sha256) &&
			files.length === Object.keys(previousSameScope.files).length
		) {
			log(`Sources unchanged since run ${previousSameScope.id}: nothing to do`);
			stats.unchangedSince = previousSameScope.id;
			stats.outbox = await drainOutbox(sql, {
				appUrl: options.appUrl,
				secret: options.revalidateSecret,
				log,
			});
			if (createdWorkDir && workDir) await rm(workDir, { recursive: true, force: true });
			return await finish("skipped");
		}

		const approved = await checkApproval(sql, options.approveRunId, files);

		// 2. File guards (ANS files only: they drive everything).
		guards.push(
			...checkFiles(
				ANS_KEYS.map((key) => fileByKey.get(key)).filter((file): file is SourceFile => !!file),
				previousAny?.files ?? null,
			),
		);
		const fileVerdict = verdict(guards, approved);
		if (!fileVerdict.ok) {
			log(
				`File guards failed: ${fileVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(fileVerdict.approvable ? "blocked" : "failed", "file guards failed");
		}

		// 3. Places (once, or with `etl:places`).
		const [{ places } = { places: 0 }] = await sql<{ places: number }[]>`
			SELECT count(*)::integer AS places FROM directory.places
		`;
		if (places === 0) {
			stats.places = await timer.run("import places", async () =>
				importPlaces(
					sql,
					options.sourceDir
						? await readPlaceSources(options.sourceDir)
						: await fetchPlaceSources(options.geoApiUrl),
					runId,
				),
			);
		}
		if (options.department) {
			const [found] = await sql`
				SELECT 1 FROM directory.places WHERE kind = 'department' AND code = ${options.department}
			`;
			if (!found) throw new Error(`Unknown department: ${options.department}`);
		}

		// 4. Stream-parse into staging with COPY.
		await sql.unsafe(`TRUNCATE ${STAGING_TABLES.join(", ")}`);
		const quarantine = await Quarantine.open(sql);
		const load: Record<string, LoadStats> = {};
		const rppsInScope = new Set<string>();
		const unknownCodes = new Map<string, number>();
		const unknownProfessions = new Map<string, number>();
		// Skipped lines of known professions: out of the import scope, or not self-employed.
		const outOfScope = new Map<string, number>();
		const notLiberal = new Map<string, number>();
		const professions = new Set(options.professions);
		try {
			load.personneActivite = await timer.run("load Personne_activite", () =>
				loadPipeFile<keyof typeof PERSONNE_ACTIVITE_COLUMNS, ActivityRow>({
					sql,
					fileKey: "personneActivite",
					path: requireFile(fileByKey, "personneActivite").path,
					columns: PERSONNE_ACTIVITE_COLUMNS,
					table: "directory.stg_ans_activities",
					tableColumns: STG_ACTIVITY_COLUMNS,
					quarantine,
					parse: (fields, count, index, lineNo) => {
						const parsed = parsePersonneActiviteLine(fields, count, index, professions, lineNo);
						if (parsed.kind === "skip") {
							const code = fields[index.professionCode] ?? "";
							const tally = professions.has(code)
								? notLiberal
								: FR_PROFESSIONS[code]
									? outOfScope
									: (FR_EXCLUDED_PROFESSIONS as readonly string[]).includes(code)
										? null
										: unknownProfessions;
							tally?.set(code, (tally.get(code) ?? 0) + 1);
						}
						return parsed;
					},
					rowsOf: (row) => [row.values],
					onRow: (row) => {
						rppsInScope.add(row.rpps);
						for (const code of row.unknownCodes)
							unknownCodes.set(code, (unknownCodes.get(code) ?? 0) + 1);
					},
				}),
			);
			load.savoirFaire = await timer.run("load SavoirFaire", () =>
				loadPipeFile<keyof typeof SAVOIR_FAIRE_COLUMNS, QualificationRow>({
					sql,
					fileKey: "savoirFaire",
					path: requireFile(fileByKey, "savoirFaire").path,
					columns: SAVOIR_FAIRE_COLUMNS,
					table: "directory.stg_ans_qualifications",
					tableColumns: STG_QUALIFICATION_COLUMNS,
					quarantine,
					parse: (fields, count, index) => parseSavoirFaireLine(fields, count, index, rppsInScope),
					rowsOf: (row) => row.values,
				}),
			);
			load.diplomes = await timer.run("load Dipl_AutExerc", () =>
				loadPipeFile<keyof typeof DIPLOMES_COLUMNS, QualificationRow>({
					sql,
					fileKey: "diplomes",
					path: requireFile(fileByKey, "diplomes").path,
					columns: DIPLOMES_COLUMNS,
					table: "directory.stg_ans_qualifications",
					tableColumns: STG_QUALIFICATION_COLUMNS,
					quarantine,
					parse: (fields, count, index) => parseDiplomeLine(fields, count, index, rppsInScope),
					rowsOf: (row) => row.values,
				}),
			);
			const finessFile = fileByKey.get("finess");
			if (finessFile) {
				stats.finessLoad = await timer.run("load FINESS+", () => loadFiness(sql, finessFile.path));
			}
			const ameliFile = fileByKey.get("ameli");
			if (ameliFile) {
				stats.ameliLoad = await timer.run("load Ameli", () =>
					loadAmeli(sql, ameliFile.path, quarantine),
				);
			}
		} finally {
			await quarantine.close();
		}
		await sql.unsafe(`ANALYZE ${STAGING_TABLES.join(", ")}`);
		stats.load = load;
		stats.quarantine = quarantine.summary();
		stats.taxonomy = {
			unknownCodes: Object.fromEntries(unknownCodes),
			unknownProfessions: Object.fromEntries(unknownProfessions),
			outOfScopeLines: Object.fromEntries(outOfScope),
			notLiberalLines: Object.fromEntries(notLiberal),
		};
		if (unknownCodes.size > 0 || unknownProfessions.size > 0) {
			log(
				`Taxonomy alert: unknown codes ${JSON.stringify({
					unknownCodes: Object.fromEntries(unknownCodes),
					unknownProfessions: Object.fromEntries(unknownProfessions),
				})}`,
			);
		}

		// 5. Quarantine and staging guards.
		guards.push(...checkQuarantine(load));
		const staging = await stagingStats(sql);
		stats.staging = staging;
		guards.push(...checkStaging(staging, previousAny?.stats?.staging ?? null));
		const stagingVerdict = verdict(guards, approved);
		if (!stagingVerdict.ok) {
			log(
				`Guards failed: ${stagingVerdict.blocking.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
			);
			return await finish(
				stagingVerdict.approvable ? "blocked" : "failed",
				"staging guards failed",
			);
		}

		// 6. Merge, in one transaction.
		const ctx = { runId, professions: options.professions, department: options.department };
		const merged = await sql.begin(async (tx) => {
			await syncTaxonomy(tx);
			const merge: Record<string, unknown> = {};
			merge.structures = await timer.run("resolve places", () => stageSites(tx));
			merge.siteNameAccents = await restoreSiteNameAccents(tx);
			merge.ownNameAccents = await timer.run("own name accents", () =>
				restoreOwnNameAccentsInSites(tx),
			);
			merge.scope = await stageScope(tx, ctx);
			const sites = await timer.run("merge sites", () => mergeSites(tx));
			merge.sites = { inserted: sites.inserted, updated: sites.updated };
			merge.practitioners = await timer.run("merge practitioners", () => mergePractitioners(tx));
			merge.activities = await timer.run("merge activities", () => mergeActivities(tx));
			merge.qualifications = await timer.run("merge qualifications", () => mergeQualifications(tx));
			merge.absences = await markMissing(tx, ctx);
			merge.suppressions = await applySuppressions(tx);
			const finess = await timer.run("FINESS+ enrichment", () => enrichFromFiness(tx));
			merge.finess = { ...finess, ids: undefined };
			const geocoding = await timer.run("geocoding", () => geocodeSites(tx, sql, options, log));
			merge.geocoding = { ...geocoding, labelledIds: undefined };
			// Statistics for what this transaction wrote, which autovacuum cannot see (#90).
			await timer.run("analyze merged tables", () => analyzeTables(tx, MERGED_TABLES));
			const derived = await timer.run("derived fields", () => recomputeDerived(tx, ctx));
			merge.removedSites = derived.removedSites.length;
			merge.indexableChanged = derived.indexableChanged;
			merge.ameli = await timer.run("Ameli matching", () => matchAmeli(tx));
			await timer.run("analyze derived fields", () => analyzeTables(tx, DERIVED_TABLES));
			const examples = await unpublishedExamples(tx);
			const suppressedPages = await suppressedIndexablePages(tx);
			const models = await timer.run("read models", () => refreshReadModels(tx, runId));
			merge.readModels = models;
			merge.siteTags = await enqueueSiteTags(tx, runId, [
				...sites.ids,
				...(finess.ids ?? []),
				...geocoding.labelledIds,
				...derived.removedSites,
			]);
			await timer.run("analyze read models", () => analyzeTables(tx, READ_MODEL_TABLES));
			const orphans = await timer.run("orphan check", () => orphanedPages(tx));
			merge.orphans = orphans.count;
			const breakers = [
				...checkBreakers({
					...models.pages,
					unpublished: Math.max(0, models.pages.unpublished - suppressedPages),
				}),
				...checkOrphans(orphans),
			];
			const breakerVerdict = verdict(breakers, approved);
			const [totals] = await tx<Record<string, number>[]>`
				SELECT
					(SELECT count(*) FROM directory.practitioners WHERE status = 'active')::integer AS practitioners,
					(SELECT count(*) FROM directory.practitioners WHERE indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.sites WHERE removed_at IS NULL)::integer AS sites,
					(SELECT count(*) FROM directory.sites WHERE removed_at IS NULL AND location IS NOT NULL)::integer AS located,
					(SELECT count(*) FROM directory.sites WHERE removed_at IS NULL AND geo_source = 'geocoder')::integer AS geocoded,
					(SELECT count(*) FROM directory.sites WHERE removed_at IS NULL AND geo_source = 'finess')::integer AS finess_located,
					(SELECT count(*) FROM directory.sites WHERE removed_at IS NULL AND geo_source = 'centroid')::integer AS centroid,
					(SELECT count(*) FROM directory.practitioners WHERE ameli_matched_at IS NOT NULL)::integer AS ameli_matched,
					(SELECT count(*) FROM directory.invalidation_outbox)::integer AS outbox
			`;
			merge.totals = totals;
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
		stats.changes = summarizeChanges(merged.merge);

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
		if (createdWorkDir && workDir) await rm(workDir, { recursive: true, force: true });
		return await finish("succeeded");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`Run ${runId} failed: ${message}`);
		await finish("failed", message).catch(() => {});
		throw error;
	}
}

function requireFile(files: Map<string, SourceFile>, key: string): SourceFile {
	const file = files.get(key);
	if (!file) throw new Error(`Missing source file: ${key}`);
	return file;
}

async function acquireFiles(
	options: FrOptions,
	workDir: string | null,
	log: Logger,
): Promise<SourceFile[]> {
	if (options.sourceDir) {
		const dir = options.sourceDir;
		const local = async (key: string, name: string, text: boolean, required: boolean) => {
			const path = join(dir, name);
			if (!existsSync(path)) {
				if (required) throw new Error(`Missing ${path}`);
				return null;
			}
			return inspectLocalFile(key, path, text);
		};
		const found = await Promise.all([
			local("personneActivite", SOURCE_DIR_FILES.personneActivite, true, true),
			local("savoirFaire", SOURCE_DIR_FILES.savoirFaire, true, true),
			local("diplomes", SOURCE_DIR_FILES.diplomes, true, true),
			existsSync(join(dir, `${SOURCE_DIR_FILES.finess}.gz`))
				? local("finess", `${SOURCE_DIR_FILES.finess}.gz`, false, false)
				: local("finess", SOURCE_DIR_FILES.finess, false, false),
			local("ameli", SOURCE_DIR_FILES.ameli, true, false),
		]);
		return found.filter((file): file is SourceFile => file !== null);
	}
	if (!workDir) throw new Error("No work directory");
	const ans = ANS_KEYS.map((key) =>
		downloadFile({ key, url: options.ansUrls[key], path: join(workDir, `${key}.txt`), text: true }),
	);
	const optional = async (label: string, fetchFile: () => Promise<SourceFile>) => {
		try {
			return await fetchFile();
		} catch (error) {
			log(`Warning: ${label} unavailable, enrichment skipped (${String(error)})`);
			return null;
		}
	};
	const ameli = optional("Ameli", () =>
		downloadFile({
			key: "ameli",
			url: options.ameliUrl,
			path: join(workDir, "ameli.csv"),
			text: true,
		}),
	);
	const finess = optional("FINESS+", async () =>
		downloadFile({
			key: "finess",
			url: await resolveLatestFinessUrl(options.finessDatasetUrl),
			path: join(workDir, "finess.json.gz"),
			text: false,
		}),
	);
	const results = await Promise.all([...ans, ameli, finess]);
	return results.filter((file): file is SourceFile => file !== null);
}

async function previousRun(
	sql: Sql,
	options: FrOptions,
	sameDepartment: boolean,
): Promise<PreviousRun | null> {
	const [row] = await sql<PreviousRun[]>`
		SELECT id, files, stats FROM directory.etl_runs
		WHERE source = 'fr' AND status = 'succeeded'
			AND scope -> 'professions' = ${JSON.stringify(options.professions)}::text::jsonb
			AND (NOT ${sameDepartment} OR scope -> 'department' = ${JSON.stringify(options.department)}::text::jsonb)
		ORDER BY id DESC
		LIMIT 1
	`;
	return row ?? null;
}

/** `--approve=<id>`: the run must be blocked and have seen exactly the same files. */
async function checkApproval(
	sql: Sql,
	runId: number | null,
	files: SourceFile[],
): Promise<boolean> {
	if (runId === null) return false;
	const [blocked] = await sql<
		{ status: string; files: Record<string, { sha256: string }> | null }[]
	>`
		SELECT status, files FROM directory.etl_runs WHERE id = ${runId} AND source = 'fr'
	`;
	if (!blocked) throw new Error(`--approve: run ${runId} does not exist`);
	if (blocked.status !== "blocked")
		throw new Error(`--approve: run ${runId} is ${blocked.status}, not blocked`);
	const same = files.every((file) => blocked.files?.[file.key]?.sha256 === file.sha256);
	if (!same)
		throw new Error(`--approve: the source files changed since run ${runId}; review again`);
	return true;
}

async function stagingStats(sql: Sql): Promise<StagingStats> {
	const [counts] = await sql<
		{ rows: number; with_structure: number; with_commune: number; invalid: number }[]
	>`
		SELECT
			count(*)::integer AS rows,
			count(*) FILTER (WHERE a.structure_id IS NOT NULL)::integer AS with_structure,
			count(*) FILTER (WHERE a.structure_id IS NOT NULL AND (
				EXISTS (SELECT 1 FROM directory.places p
					WHERE p.kind IN ('commune', 'arrondissement') AND p.code = a.commune_code)
				OR EXISTS (SELECT 1 FROM directory.places p
					WHERE p.kind IN ('commune', 'arrondissement') AND p.postcodes @> ARRAY[a.postcode])
			))::integer AS with_commune,
			count(*) FILTER (WHERE NOT directory.luhn_valid(a.rpps))::integer AS invalid
		FROM directory.stg_ans_activities a
	`;
	const professions = await sql<{ profession_code: string; rpps: number }[]>`
		SELECT profession_code, count(DISTINCT rpps)::integer AS rpps
		FROM directory.stg_ans_activities
		GROUP BY profession_code
		ORDER BY profession_code
	`;
	return {
		rows: counts?.rows ?? 0,
		rppsByProfession: Object.fromEntries(professions.map((row) => [row.profession_code, row.rpps])),
		rowsWithStructure: counts?.with_structure ?? 0,
		rowsWithCommune: counts?.with_commune ?? 0,
		invalidRpps: counts?.invalid ?? 0,
	};
}

/**
 * Locates sites without coordinates: cached geocoder result, new geocoder
 * call (not in dry runs or offline), or the commune centroid. Labels every
 * registry site with the BAN's street name when the match is sure
 * (`siteLabel`). Cached results from before the label columns are geocoded
 * again once, online, for their label; offline they still locate but labels
 * stay as they are.
 */
async function geocodeSites(tx: TransactionSql, sql: Sql, options: FrOptions, log: Logger) {
	const candidates = await sitesToGeocode(tx);
	const inputs = new Map<number, ReturnType<typeof geocodeInput>>();
	for (const site of candidates) {
		if (site.addressLine && (site.placeCode || site.postcode)) {
			inputs.set(site.id, geocodeInput(site.addressLine, site.postcode, site.placeCode));
		}
	}
	const keys = [...new Set([...inputs.values()].map((input) => input.key))];
	const cache = new Map<string, GeocodeResult & { withLabels: boolean }>();
	for (let start = 0; start < keys.length; start += 10_000) {
		const rows = await tx<(GeocodeResult & { withLabels: boolean })[]>`
			SELECT address_key AS key, latitude, longitude, score, result_type AS "resultType",
				result_citycode AS "resultCitycode", precision, result_label AS label,
				result_housenumber AS housenumber, result_name AS name, result_street AS street,
				result_postcode AS postcode, result_city AS city, with_labels AS "withLabels"
			FROM directory.geocode_cache
			WHERE address_key = ANY (${keys.slice(start, start + 10_000)}::text[])
		`;
		for (const row of rows) cache.set(row.key, row);
	}
	const misses = [
		...new Map(
			[...inputs.values()]
				.filter((input) => !cache.get(input.key)?.withLabels)
				.map((input) => [input.key, input]),
		).values(),
	];
	let requested = 0;
	if (misses.length > 0 && !options.skipGeocoding && !options.dryRun) {
		log(`Geocoding ${misses.length} new addresses…`);
		const results = await geocodeBatch(options.geocoderUrl, misses, (done, total) =>
			log(`  geocoded ${done}/${total}`),
		);
		requested = misses.length;
		const found = new Set(results.map((result) => result.key));
		for (const miss of misses) {
			if (!found.has(miss.key)) results.push(emptyGeocodeResult(miss.key));
		}
		// Committed on its own connection: cached results survive a rollback.
		for (let start = 0; start < results.length; start += 10_000) {
			const chunk = results.slice(start, start + 10_000);
			await sql`
				INSERT INTO directory.geocode_cache AS c (
					address_key, latitude, longitude, score, result_type, result_citycode, precision,
					result_label, result_housenumber, result_name, result_street, result_postcode,
					result_city, with_labels, provider, geocoded_at
				)
				SELECT *, true, 'geoplateforme', now() FROM unnest(
					${chunk.map((r) => r.key)}::text[],
					${chunk.map((r) => r.latitude)}::float8[],
					${chunk.map((r) => r.longitude)}::float8[],
					${chunk.map((r) => r.score)}::real[],
					${chunk.map((r) => r.resultType)}::text[],
					${chunk.map((r) => r.resultCitycode)}::text[],
					${chunk.map((r) => r.precision)}::text[],
					${chunk.map((r) => r.label)}::text[],
					${chunk.map((r) => r.housenumber)}::text[],
					${chunk.map((r) => r.name)}::text[],
					${chunk.map((r) => r.street)}::text[],
					${chunk.map((r) => r.postcode)}::text[],
					${chunk.map((r) => r.city)}::text[]
				)
				ON CONFLICT (address_key) DO UPDATE SET
					latitude = excluded.latitude, longitude = excluded.longitude, score = excluded.score,
					result_type = excluded.result_type, result_citycode = excluded.result_citycode,
					precision = excluded.precision, result_label = excluded.result_label,
					result_housenumber = excluded.result_housenumber, result_name = excluded.result_name,
					result_street = excluded.result_street, result_postcode = excluded.result_postcode,
					result_city = excluded.result_city, with_labels = excluded.with_labels,
					geocoded_at = excluded.geocoded_at
			`;
			// As a later run reads it back: the score is stored as a `real`.
			for (const result of chunk) {
				const score = result.score === null ? null : Math.fround(result.score);
				cache.set(result.key, { ...result, score, withLabels: true });
			}
		}
	}

	const locations: SiteLocation[] = [];
	const labels: SiteLabelUpdate[] = [];
	let rejected = 0;
	let shown = 0;
	for (const site of candidates) {
		const input = inputs.get(site.id);
		const result = input ? cache.get(input.key) : undefined;
		// No address to geocode: nothing to label. A result cached without labels: keep them.
		if (!input || result?.withLabels) {
			const label = result ? siteLabel(result, site) : { geoLabel: null, geoAddressLine: null };
			if (label.geoLabel !== site.geoLabel || label.geoAddressLine !== site.geoAddressLine) {
				labels.push({ id: site.id, ...label });
			}
			if (label.geoAddressLine) shown++;
		} else if (site.geoAddressLine) {
			shown++;
		}
		if (site.located) continue;
		if (result && acceptGeocode(result, new Set(site.allowedCodes))) {
			locations.push({
				id: site.id,
				latitude: result.latitude,
				longitude: result.longitude,
				precision: result.precision ?? "city",
				source: "geocoder",
				placeCode: result.resultCitycode,
			});
			continue;
		}
		if (result) rejected++;
		if (site.hasCentroid) {
			locations.push({
				id: site.id,
				latitude: null,
				longitude: null,
				precision: "city",
				source: "centroid",
				placeCode: null,
			});
		}
	}
	const applied = await applySiteLocations(tx, locations);
	const labelled = await applySiteLabels(tx, labels);
	return {
		candidates: candidates.filter((site) => !site.located).length,
		labelCandidates: candidates.length,
		cacheHits: keys.filter((key) => cache.has(key)).length - requested,
		requested,
		pending: options.skipGeocoding || options.dryRun ? misses.length : 0,
		rejected,
		...applied,
		// Sites whose street line is the BAN's, and how many changed in this run.
		labels: { shown, updated: labelled.length },
		labelledIds: labelled,
	};
}

function summarizeChanges(merge: Record<string, unknown>) {
	const get = (path: string): number => {
		let value: unknown = merge;
		for (const part of path.split("."))
			value = (value as Record<string, unknown> | undefined)?.[part];
		return typeof value === "number" ? value : 0;
	};
	const changes = {
		sites: get("sites.inserted") + get("sites.updated"),
		practitioners: get("practitioners.inserted") + get("practitioners.updated"),
		activities: get("activities.inserted") + get("activities.updated") + get("activities.removed"),
		qualifications: get("qualifications.practitionersChanged"),
		removed: get("absences.removed"),
		pages:
			get("readModels.pages.inserted") +
			get("readModels.pages.updated") +
			get("readModels.pages.deleted"),
		landingPages:
			get("readModels.landing.inserted") +
			get("readModels.landing.updated") +
			get("readModels.landing.deleted"),
		searchDocs: get("readModels.search.written") + get("readModels.search.deleted"),
		ameli: get("ameli.updated") + get("ameli.cleared"),
		geocoded: get("geocoding.geocoded") + get("geocoding.centroid"),
		labels: get("geocoding.labels.updated"),
	};
	return { ...changes, total: Object.values(changes).reduce((sum, value) => sum + value, 0) };
}
