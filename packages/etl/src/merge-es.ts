/**
 * Merge of the parsed Spanish extracts into the shared directory schema (`country = 'ES'`), in
 * the import's one transaction.
 *
 * A centre of REGCESS is a row of `directory.practitioners` (the page's subject), its name as
 * the register publishes it (cased) in `last_name` and no first name; its address is its site,
 * one activity links them, and its care units and its public or private dependency are its
 * qualifications. The register publishes no coordinates: a site is placed in its municipality
 * by the INE code and located at the municipality's point, at city precision (no map pin). The
 * rows are grouped here, in memory (about 115,000 centres), then upserted set-based, guarded by
 * row hashes, so a second run over the same files changes nothing.
 */
import { ES_ID_SCHEME, esCentreSlug } from "@apercura/core";
import { esListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import {
	ES_DEPENDENCY_SOURCE,
	ES_SOURCES,
	ES_UNIT_SOURCE,
	type EsSourceId,
	type ParseResult,
} from "./sources/es/types";

export type EsPerson = {
	national_id: string;
	name: string;
	profession_code: string;
	primary_specialty_code: string | null;
	listing_slug: string | null;
	slug: string;
};

export type EsSite = {
	source: string;
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	municipality_code: string;
	province_code: string;
	phone: string | null;
};

export type EsActivity = {
	source: string;
	source_key: string;
	national_id: string;
	site_key: string;
	skill_code: string | null;
};

export type EsQualification = { national_id: string; source: string; code: string; label: string };

export type EsBatch = {
	people: EsPerson[];
	sites: EsSite[];
	activities: EsActivity[];
	qualifications: EsQualification[];
};

/** Groups the parsed rows into centres, sites, activities and qualifications. */
export function buildEsBatch(results: readonly ParseResult[]): EsBatch {
	const people: EsPerson[] = [];
	const sites: EsSite[] = [];
	const activities: EsActivity[] = [];
	const qualifications: EsQualification[] = [];
	const seen = new Set<string>();
	for (const result of results) {
		const source = ES_SOURCES[result.source].siteSource;
		for (const row of result.rows) {
			// A code is unique across the extracts; were one repeated, the first extract keeps it.
			if (seen.has(row.nationalId)) continue;
			seen.add(row.nationalId);
			people.push({
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				primary_specialty_code: row.specialtyCode,
				listing_slug: esListingSlugFor(row.professionCode, row.specialtyCode),
				slug: esCentreSlug(row.name, row.nationalId),
			});
			sites.push({
				source,
				source_key: row.nationalId,
				address_line: row.street,
				postcode: row.postcode,
				city: row.city,
				municipality_code: row.municipalityCode,
				province_code: row.provinceCode,
				phone: row.phone,
			});
			activities.push({
				source,
				source_key: `${row.nationalId}@${row.nationalId}`,
				national_id: row.nationalId,
				site_key: row.nationalId,
				skill_code: row.specialtyCode,
			});
			for (const unit of row.units) {
				qualifications.push({
					national_id: row.nationalId,
					source: ES_UNIT_SOURCE,
					code: unit.code,
					label: unit.label,
				});
			}
			if (row.dependency) {
				qualifications.push({
					national_id: row.nationalId,
					source: ES_DEPENDENCY_SOURCE,
					code: row.dependency.code,
					label: row.dependency.label,
				});
			}
		}
	}
	return { people, sites, activities, qualifications };
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

const PEOPLE_COLUMNS = `national_id text, name text, profession_code text,
	primary_specialty_code text, listing_slug text, slug text`;
const SITE_COLUMNS = `source text, source_key text, address_line text, postcode text, city text,
	municipality_code text, province_code text, phone text`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, national_id text, site_key text, skill_code text";
const QUALIFICATION_COLUMNS = "national_id text, source text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed centres (GDPR objections always win)
 * and places the sites by the register's INE municipality code:
 * 1. the municipality of that code;
 * 2. else (a municipality the IGN's units do not know yet) the province.
 * A site is located at its municipality's point, when the municipality has one.
 */
export async function stageEs(tx: TransactionSql, batch: EsBatch) {
	await tx.unsafe(`CREATE TEMP TABLE es_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE es_sites (${SITE_COLUMNS}, place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE es_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE es_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "es_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"es_sites (source, source_key, address_line, postcode, city, municipality_code, province_code, phone)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "es_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "es_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE es_people ADD PRIMARY KEY (national_id)`;
	await tx`ALTER TABLE es_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE es_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE es_people, es_sites, es_activities, es_quals`;

	const suppressed = await tx`
		DELETE FROM es_people r
		USING directory.suppressions s
		WHERE s.country = 'ES' AND s.id_scheme = ${ES_ID_SCHEME} AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM es_activities a
		WHERE NOT EXISTS (SELECT 1 FROM es_people p WHERE p.national_id = a.national_id)
	`;
	await tx`
		DELETE FROM es_quals q
		WHERE NOT EXISTS (SELECT 1 FROM es_people p WHERE p.national_id = q.national_id)
	`;
	await tx`
		DELETE FROM es_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM es_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;

	// 1. The municipality of the register's INE code.
	await tx`
		UPDATE es_sites s SET place_id = p.id, placed_by = 'municipality'
		FROM directory.places p
		WHERE p.country = 'ES' AND p.kind = 'commune' AND p.code = s.municipality_code
			AND p.removed_at IS NULL
	`;
	// 2. The province.
	await tx`
		UPDATE es_sites s SET place_id = p.id, placed_by = 'province'
		FROM directory.places p
		WHERE s.place_id IS NULL AND p.country = 'ES' AND p.kind = 'department'
			AND p.code = s.province_code AND p.removed_at IS NULL
	`;
	await tx`ANALYZE es_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			located: number;
			placed: number;
			inMunicipality: number;
			inProvince: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM es_people)::integer AS people,
			count(*)::integer AS sites,
			count(*) FILTER (WHERE p.centroid IS NOT NULL)::integer AS located,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE s.placed_by = 'municipality')::integer AS "inMunicipality",
			count(*) FILTER (WHERE s.placed_by = 'province')::integer AS "inProvince"
		FROM es_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id AND p.kind = 'commune'
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		located: counts?.located ?? 0,
		placed: counts?.placed ?? 0,
		inMunicipality: counts?.inMunicipality ?? 0,
		inProvince: counts?.inProvince ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites, each at its municipality's point at city precision (the register
 * publishes no coordinates: no map pin), or unlocated when placed in its province only.
 */
export async function mergeEsSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id)) AS address_hash
			FROM es_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, city, 'ES',
			place_id, centroid,
			CASE WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', address_line, postcode, city, place_id, phone, address_hash,
				ST_AsText(centroid::geometry))),
			now()
		FROM src
		ON CONFLICT (source, source_key) DO UPDATE SET
			name = excluded.name,
			address_line = excluded.address_line,
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
 * Upserts the staged centres (`country = 'ES'`): the register's name in `last_name` (and as the
 * source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeEsPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'ES', ${ES_ID_SCHEME}, r.national_id, '', r.name, '', r.name, r.profession_code,
			r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.primary_specialty_code, r.listing_slug)),
			now(), 0, 'active'
		FROM es_people r
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
 * Upserts the activities (one per centre) and removes those the extracts read no longer give;
 * an extract left out of the run keeps its activities.
 */
export async function mergeEsActivities(tx: TransactionSql, sources: readonly EsSourceId[]) {
	const siteSources = sources.map((source) => ES_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_es_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id, a.skill_code
		FROM es_activities a
		JOIN directory.practitioners p ON p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME}
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_es_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_es_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key,
			CASE WHEN r.skill_code IS NULL THEN NULL ELSE 'S' END, r.skill_code, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.skill_code)), now()
		FROM run_es_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME}
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_es_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications (care units, dependency) of the centres whose set changed (hash
 * compare, as in Austria and Czechia).
 */
export async function mergeEsQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_es_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM es_quals q
		JOIN directory.practitioners p ON p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME}
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_es_quals`;
	await tx`
		CREATE TEMP TABLE run_es_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN es_people r ON p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME}
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_es_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_es_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_es_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_es_quals q
		JOIN run_es_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_es_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: a centre of an extract read in this run, missing from it twice in a row, is removed
 * (an owner-claimed page is kept and counted for review), as in the other markets. The centres
 * of an extract left out of the run are not counted missing.
 */
export async function markEsMissing(tx: TransactionSql, sources: readonly EsSourceId[]) {
	const professions = sources.flatMap((source) => [...ES_SOURCES[source].professions]);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME} AND p.missing_runs > 0
			AND EXISTS (SELECT 1 FROM es_people r WHERE r.national_id = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'ES' AND p.id_scheme = ${ES_ID_SCHEME} AND p.status = 'active'
			AND p.profession_code = ANY (${professions}::text[])
			AND NOT EXISTS (SELECT 1 FROM es_people r WHERE r.national_id = p.national_id)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'ES' AND id_scheme = ${ES_ID_SCHEME} AND status = 'active'
			AND profession_code = ANY (${professions}::text[])
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'ES' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
