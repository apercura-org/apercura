/**
 * Merge of the parsed Latvian lists into the shared directory schema (`country = 'LV'`), in the
 * import's one transaction.
 *
 * A place of care is a row of `directory.practitioners` (the page's subject) under its list's
 * scheme (`LV-GP`, `LV-SLIM`, `LV-APT`), its name in `last_name` and no first name; each of its
 * addresses is a site, one activity per site links them, and a GP practice's GPs and a pharmacy's
 * kind are its qualifications. A site keeps its street (`address_line`) and its locality the
 * Latvian way (`address_complement`: `Ance, Ances pag., Ventspils nov.`), is placed in its town,
 * parish or state city by that locality (`placeSite`), and located at its published point
 * (address precision), else at its commune's centroid (city precision: no map pin). The rows are
 * grouped here, in memory (about 1,500 places), then upserted set-based, guarded by row hashes, so
 * a second run over the same files changes nothing.
 */
import { LV_ID_SCHEMES, type LvIdScheme, lvFacilitySlug } from "@apercura/core";
import { lvListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { type LvPlaceIndex, loadLvPlaceIndex, placeSite } from "./sources/lv/places";
import { LV_SOURCES, type LvSourceId, type ParseResult } from "./sources/lv/types";

export type LvPerson = {
	id_scheme: LvIdScheme;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type LvSite = {
	source: string;
	source_key: string;
	name: string | null;
	address_line: string | null;
	locality: string;
	town: string;
	postcode: string | null;
	longitude: number | null;
	latitude: number | null;
	phone: string | null;
};

export type LvActivity = {
	source: string;
	source_key: string;
	id_scheme: LvIdScheme;
	national_id: string;
	site_key: string;
};

export type LvQualificationRow = {
	id_scheme: LvIdScheme;
	national_id: string;
	source: string;
	code: string;
	label: string | null;
};

export type LvBatch = {
	people: LvPerson[];
	sites: LvSite[];
	activities: LvActivity[];
	qualifications: LvQualificationRow[];
};

/** Groups the parsed rows into places, sites, activities and qualifications. */
export function buildLvBatch(results: readonly ParseResult[]): LvBatch {
	const batch: LvBatch = { people: [], sites: [], activities: [], qualifications: [] };
	for (const result of results) {
		const { scheme, siteSource } = LV_SOURCES[result.source];
		const seenSites = new Set<string>();
		for (const row of result.rows) {
			batch.people.push({
				id_scheme: scheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: lvListingSlugFor(row.professionCode, null),
				slug: lvFacilitySlug(row.name, scheme, row.nationalId),
			});
			for (const site of row.sites) {
				// A site of the Ministry's list may serve two practices (two GPs' institutions at one
				// address): one site, an activity for each.
				if (!seenSites.has(site.key)) {
					seenSites.add(site.key);
					batch.sites.push({
						source: siteSource,
						source_key: site.key,
						name: site.name,
						address_line: site.street,
						locality: site.locality,
						town: site.locality.split(",")[0]?.trim() ?? site.locality,
						postcode: site.postcode,
						longitude: site.point?.longitude ?? null,
						latitude: site.point?.latitude ?? null,
						phone: site.phone,
					});
				}
				batch.activities.push({
					source: siteSource,
					source_key: `${row.nationalId}@${site.key}`,
					id_scheme: scheme,
					national_id: row.nationalId,
					site_key: site.key,
				});
			}
			for (const qualification of row.qualifications) {
				batch.qualifications.push({
					id_scheme: scheme,
					national_id: row.nationalId,
					...qualification,
				});
			}
		}
	}
	return batch;
}

/** Inserts rows into a temporary table, a JSON array per statement. */
async function insertJson(
	tx: TransactionSql,
	table: string,
	columns: string,
	rows: readonly object[],
) {
	for (let index = 0; index < rows.length; index += 2_000) {
		const chunk = JSON.stringify(rows.slice(index, index + 2_000));
		await tx.unsafe(
			`INSERT INTO ${table} SELECT * FROM jsonb_to_recordset($1::text::jsonb) AS r (${columns})`,
			[chunk],
		);
	}
}

const PEOPLE_COLUMNS = `id_scheme text, national_id text, name text, profession_code text,
	listing_slug text, slug text`;
const SITE_COLUMNS = `source text, source_key text, name text, address_line text, locality text,
	town text, postcode text, longitude double precision, latitude double precision, phone text,
	place_id integer, placed_by text`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text";
const QUALIFICATION_COLUMNS =
	"id_scheme text, national_id text, source text, code text, label text";

const SCHEMES = Object.keys(LV_ID_SCHEMES);

/**
 * Stages the batch in temporary tables, drops suppressed places (GDPR objections always win)
 * and places every site (`placeSite`: its locality's standard name, its point, its municipality).
 */
export async function stageLv(tx: TransactionSql, batch: LvBatch, index?: LvPlaceIndex) {
	const places = index ?? (await loadLvPlaceIndex(tx));
	const counts = { name: 0, nearest: 0, department: 0, none: 0 };
	const sites = batch.sites.map((site) => {
		const placement = placeSite(
			{
				locality: site.locality,
				point:
					site.longitude !== null && site.latitude !== null
						? { longitude: site.longitude, latitude: site.latitude }
						: null,
			},
			places,
		);
		counts[placement.placedBy ?? "none"]++;
		return { ...site, place_id: placement.placeId, placed_by: placement.placedBy };
	});
	await tx.unsafe(`CREATE TEMP TABLE lv_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE lv_sites (${SITE_COLUMNS}, location geography(Point, 4326)) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE lv_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE lv_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "lv_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"lv_sites (source, source_key, name, address_line, locality, town, postcode, longitude, latitude, phone, place_id, placed_by)",
		SITE_COLUMNS,
		sites,
	);
	await insertJson(tx, "lv_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "lv_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE lv_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE lv_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE lv_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`
		UPDATE lv_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`ANALYZE lv_people, lv_sites, lv_activities, lv_quals`;

	const suppressed = await tx`
		DELETE FROM lv_people r
		USING directory.suppressions s
		WHERE s.country = 'LV' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM lv_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM lv_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM lv_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM lv_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM lv_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM lv_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	const [staged] = await tx<
		{ people: number; sites: number; placed: number; inCommune: number; located: number }[]
	>`
		SELECT (SELECT count(*) FROM lv_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE p.kind = 'commune')::integer AS "inCommune",
			count(*) FILTER (WHERE s.location IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located
		FROM lv_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
	`;
	return {
		people: staged?.people ?? 0,
		sites: staged?.sites ?? 0,
		placed: staged?.placed ?? 0,
		inCommune: staged?.inCommune ?? 0,
		located: staged?.located ?? 0,
		placedBy: counts,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites: at the published point at address precision, else at the commune's
 * centroid at city precision (no map pin), else unlocated when placed in a municipality only.
 */
export async function mergeLvSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				md5(concat_ws('|', s.address_line, s.locality, s.postcode, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM lv_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, address_complement, postcode, commune_label,
			country_code, place_id, location, geo_precision, geo_source, address_hash, phone,
			source_hash, source_seen_at
		)
		SELECT source, source_key, 'office', name, address_line, locality, postcode, town, 'LV',
			place_id, coalesce(location, centroid),
			CASE WHEN location IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN location IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', name, address_line, locality, postcode, place_id, phone, address_hash,
				ST_AsText(centroid::geometry))),
			now()
		FROM src
		ON CONFLICT (source, source_key) DO UPDATE SET
			name = excluded.name,
			address_line = excluded.address_line,
			address_complement = excluded.address_complement,
			postcode = excluded.postcode,
			commune_label = excluded.commune_label,
			country_code = excluded.country_code,
			place_id = excluded.place_id,
			location = excluded.location,
			geo_precision = excluded.geo_precision,
			geo_source = excluded.geo_source,
			address_hash = excluded.address_hash,
			phone = excluded.phone,
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			removed_at = NULL,
			updated_at = now()
		WHERE s.source_hash IS DISTINCT FROM excluded.source_hash OR s.removed_at IS NOT NULL
		RETURNING s.id, (xmax = 0) AS inserted
	`;
	return { ids: rows.map((row) => row.id), ...split(rows) };
}

/**
 * Upserts the staged places (`country = 'LV'`): the name in `last_name` (and as the source
 * name), no first name. A page's slug is set once, at creation.
 */
export async function mergeLvPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'LV', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code, NULL,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM lv_people r
		ON CONFLICT (country, id_scheme, national_id) DO UPDATE SET
			first_name = excluded.first_name,
			last_name = excluded.last_name,
			first_name_source = excluded.first_name_source,
			last_name_source = excluded.last_name_source,
			profession_code = excluded.profession_code,
			primary_specialty_code = excluded.primary_specialty_code,
			listing_slug = excluded.listing_slug,
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			missing_runs = 0,
			removed_at = NULL,
			status = CASE WHEN p.status = 'removed' THEN 'active' ELSE p.status END,
			updated_at = now()
		WHERE p.source_hash IS DISTINCT FROM excluded.source_hash
			OR p.missing_runs > 0
			OR p.status = 'removed'
		RETURNING p.id, (xmax = 0) AS inserted
	`;
	return split(rows);
}

/**
 * Upserts the activities (one per site of a place) and removes those the lists read no longer
 * give; a list left out of the run keeps its activities.
 */
export async function mergeLvActivities(tx: TransactionSql, sources: readonly LvSourceId[]) {
	const siteSources = sources.map((source) => LV_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_lv_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM lv_activities a
		JOIN directory.practitioners p ON p.country = 'LV' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_lv_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_lv_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_lv_activities r
		ON CONFLICT (source, source_key) DO UPDATE SET
			site_id = excluded.site_id,
			skill_type_code = excluded.skill_type_code,
			skill_code = excluded.skill_code,
			practice_kind = excluded.practice_kind,
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			removed_at = NULL,
			updated_at = now()
		WHERE act.source_hash IS DISTINCT FROM excluded.source_hash OR act.removed_at IS NOT NULL
		RETURNING act.id, (xmax = 0) AS inserted
	`;
	// The rows just written are invisible to autovacuum (#90).
	await tx`ANALYZE directory.practitioners, directory.activities`;
	const removed = await tx<{ id: number }[]>`
		UPDATE directory.activities act SET removed_at = now(), updated_at = now()
		FROM directory.practitioners p
		WHERE p.id = act.practitioner_id AND p.country = 'LV' AND p.id_scheme = ANY (${SCHEMES}::text[])
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_lv_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications of the places whose set changed (hash compare, as in the other
 * markets): a GP who joins or leaves a practice changes its page.
 */
export async function mergeLvQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_lv_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM lv_quals q
		JOIN directory.practitioners p ON p.country = 'LV' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_lv_quals`;
	await tx`
		CREATE TEMP TABLE run_lv_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN lv_people r ON p.country = 'LV' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_lv_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_lv_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_lv_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_lv_quals q
		JOIN run_lv_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_lv_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * How many runs in a row a place of a list read in the run must be missing from it before its
 * page is removed: two, as in the other markets. A run reads a new NVD quarter four times a year
 * and an unchanged set of files skips the run, so a GP practice that left the NVD's list goes at
 * the second new file that leaves it out; the register of pharmacies changes daily, so a closed
 * pharmacy goes within two weeks.
 */
export const LV_MISSING_RUNS = 2;

/**
 * Absences: a place of a list read in this run and missing from it is counted missing, and
 * removed after `LV_MISSING_RUNS` runs in a row (an owner-claimed page is kept and counted for
 * review). The places of a list left out of the run are not counted missing.
 */
export async function markLvMissing(tx: TransactionSql, sources: readonly LvSourceId[]) {
	const schemes = sources.map((source) => LV_SOURCES[source].scheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'LV' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM lv_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'LV' AND p.id_scheme = ANY (${schemes}::text[]) AND p.status = 'active'
			AND NOT EXISTS (
				SELECT 1 FROM lv_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'LV' AND id_scheme = ANY (${schemes}::text[]) AND status = 'active'
			AND missing_runs >= ${LV_MISSING_RUNS} AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'LV' AND status = 'active' AND missing_runs >= 1 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
