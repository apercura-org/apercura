/**
 * Merge of the parsed Italian lists into the shared directory schema (`country = 'IT'`), in the
 * import's one transaction.
 *
 * A place of the Ministry of Health's lists (a pharmacy, a parapharmacy, a hospital, an
 * accredited clinic) is a row of `directory.practitioners` (the page's subject) under its list's
 * id scheme, its name in `last_name` and no first name; its address is its site, one activity
 * links them, and a pharmacy's type, a hospital's facility type and areas of care are its
 * qualifications. A site is placed in its municipality by the ISTAT code (else by name in its
 * region, else in its province) and located at the municipality's point at city precision (no
 * map pin), unless the run keeps the register's coordinates. The rows are grouped in memory
 * (about 29,000 places), then upserted set-based, guarded by row hashes, so a second run over the
 * same files changes nothing.
 */
import { type ItIdScheme, itPlaceSlug } from "@apercura/core";
import { itListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { IT_SOURCES, type ItSourceId, type ParseResult } from "./sources/it/types";

export type ItPerson = {
	id_scheme: string;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type ItSite = {
	source: string;
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	municipality_code: string;
	province_abbreviation: string | null;
	region_code: string | null;
	latitude: number | null;
	longitude: number | null;
};

export type ItActivity = {
	source: string;
	source_key: string;
	id_scheme: string;
	national_id: string;
	site_key: string;
};

export type ItQualification = {
	id_scheme: string;
	national_id: string;
	source: string;
	code: string;
	label: string;
};

export type ItBatch = {
	people: ItPerson[];
	sites: ItSite[];
	activities: ItActivity[];
	qualifications: ItQualification[];
};

/** Groups the parsed rows into places, sites, activities and qualifications. */
export function buildItBatch(results: readonly ParseResult[]): ItBatch {
	const people: ItPerson[] = [];
	const sites: ItSite[] = [];
	const activities: ItActivity[] = [];
	const qualifications: ItQualification[] = [];
	for (const result of results) {
		const source = IT_SOURCES[result.source].siteSource;
		for (const row of result.rows) {
			people.push({
				id_scheme: row.idScheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: itListingSlugFor(row.professionCode, null),
				slug: itPlaceSlug(row.name, row.idScheme as ItIdScheme, row.nationalId),
			});
			sites.push({
				source,
				source_key: row.nationalId,
				address_line: [row.street, row.hamlet].filter(Boolean).join(", ") || null,
				postcode: row.postcode,
				city: row.city,
				municipality_code: row.municipalityCode,
				province_abbreviation: row.provinceAbbreviation,
				region_code: row.regionCode,
				latitude: row.latitude,
				longitude: row.longitude,
			});
			activities.push({
				source,
				source_key: `${row.nationalId}@${row.nationalId}`,
				id_scheme: row.idScheme,
				national_id: row.nationalId,
				site_key: row.nationalId,
			});
			for (const qualification of row.qualifications) {
				qualifications.push({
					id_scheme: row.idScheme,
					national_id: row.nationalId,
					source: qualification.source,
					code: qualification.code,
					label: qualification.label,
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

const PEOPLE_COLUMNS = `id_scheme text, national_id text, name text, profession_code text,
	listing_slug text, slug text`;
const SITE_COLUMNS = `source text, source_key text, address_line text, postcode text, city text,
	municipality_code text, province_abbreviation text, region_code text,
	latitude double precision, longitude double precision`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text";
const QUALIFICATION_COLUMNS =
	"id_scheme text, national_id text, source text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed places (GDPR objections always win)
 * and places the sites:
 * 1. the municipality of the list's ISTAT code;
 * 2. else (a code ISTAT no longer lists: a merged or renumbered municipality) the only
 *    municipality of that name in the place's region;
 * 3. else the province of the list's abbreviation (`RM`).
 */
export async function stageIt(tx: TransactionSql, batch: ItBatch) {
	await tx.unsafe(`CREATE TEMP TABLE it_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE it_sites (${SITE_COLUMNS}, place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE it_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE it_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "it_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"it_sites (source, source_key, address_line, postcode, city, municipality_code, province_abbreviation, region_code, latitude, longitude)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "it_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "it_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE it_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE it_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE it_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE it_people, it_sites, it_activities, it_quals`;

	const suppressed = await tx`
		DELETE FROM it_people r
		USING directory.suppressions s
		WHERE s.country = 'IT' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM it_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM it_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM it_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM it_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM it_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM it_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;

	// 1. The municipality of the list's ISTAT code.
	await tx`
		UPDATE it_sites s SET place_id = p.id, placed_by = 'code'
		FROM directory.places p
		WHERE p.country = 'IT' AND p.kind = 'commune' AND p.code = s.municipality_code
			AND p.removed_at IS NULL
	`;
	// 2. The only municipality of that name in the region.
	await tx`
		UPDATE it_sites s SET place_id = m.id, placed_by = 'name'
		FROM (
			SELECT directory.text_norm(p.name) AS name, p.region_code, min(p.id) AS id
			FROM directory.places p
			WHERE p.country = 'IT' AND p.kind = 'commune' AND p.removed_at IS NULL
			GROUP BY 1, 2
			HAVING count(*) = 1
		) m
		WHERE s.place_id IS NULL AND m.region_code = s.region_code
			AND m.name = directory.text_norm(s.city)
	`;
	// 3. The province of the list's abbreviation: the province most sites of that abbreviation
	// were placed in by their municipality (ISTAT's places carry no abbreviation).
	await tx`
		UPDATE it_sites s SET place_id = d.id, placed_by = 'province'
		FROM (
			SELECT s2.province_abbreviation,
				mode() WITHIN GROUP (ORDER BY p.department_code) AS department_code
			FROM it_sites s2
			JOIN directory.places p ON p.id = s2.place_id
			WHERE s2.province_abbreviation IS NOT NULL
			GROUP BY 1
		) m
		JOIN directory.places d ON d.country = 'IT' AND d.kind = 'department'
			AND d.code = m.department_code AND d.removed_at IS NULL
		WHERE s.place_id IS NULL AND s.province_abbreviation = m.province_abbreviation
	`;
	await tx`ANALYZE it_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			located: number;
			withPoint: number;
			placed: number;
			inMunicipality: number;
			byName: number;
			inProvince: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM it_people)::integer AS people,
			count(*)::integer AS sites,
			count(*) FILTER (WHERE s.latitude IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located,
			count(*) FILTER (WHERE s.latitude IS NOT NULL)::integer AS "withPoint",
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE s.placed_by IN ('code', 'name'))::integer AS "inMunicipality",
			count(*) FILTER (WHERE s.placed_by = 'name')::integer AS "byName",
			count(*) FILTER (WHERE s.placed_by = 'province')::integer AS "inProvince"
		FROM it_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id AND p.kind = 'commune'
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		located: counts?.located ?? 0,
		withPoint: counts?.withPoint ?? 0,
		placed: counts?.placed ?? 0,
		inMunicipality: counts?.inMunicipality ?? 0,
		byName: counts?.byName ?? 0,
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
 * Upserts the staged sites. A site is at its municipality's point at city precision (no map
 * pin); with the register's coordinates (`--register-coordinates`), at the list's point at
 * address precision. A site placed only in its province is unlocated. The commune label is
 * ISTAT's name of the municipality the site is placed in, else the list's.
 */
export async function mergeItSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*,
				CASE WHEN s.latitude IS NOT NULL
					THEN ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography END AS point,
				CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				CASE WHEN p.kind = 'commune' THEN p.name ELSE s.city END AS commune,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id, s.latitude,
					s.longitude)) AS address_hash
			FROM it_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, commune, 'IT',
			place_id, coalesce(point, centroid),
			CASE WHEN point IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN point IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, NULL,
			md5(concat_ws('|', address_line, postcode, commune, place_id, address_hash,
				ST_AsText(coalesce(point, centroid)::geometry))),
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
 * Upserts the staged places (`country = 'IT'`): the name the page prints in `last_name` (and as
 * the source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeItPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'IT', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code,
			NULL, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM it_people r
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
 * Upserts the activities (one per place) and removes those the lists read no longer give; a
 * list left out of the run keeps its activities.
 */
export async function mergeItActivities(tx: TransactionSql, sources: readonly ItSourceId[]) {
	const siteSources = sources.map((source) => IT_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_it_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM it_activities a
		JOIN directory.practitioners p ON p.country = 'IT' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_it_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_it_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, practice_kind, source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_it_activities r
		ON CONFLICT (source, source_key) DO UPDATE SET
			site_id = excluded.site_id,
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
		WHERE p.id = act.practitioner_id AND p.country = 'IT'
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_it_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications (pharmacy type, facility type, areas of care) of the places whose
 * set changed (hash compare, as in the other markets).
 */
export async function mergeItQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_it_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM it_quals q
		JOIN directory.practitioners p ON p.country = 'IT' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_it_quals`;
	await tx`
		CREATE TEMP TABLE run_it_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN it_people r ON p.country = 'IT' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_it_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_it_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_it_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_it_quals q
		JOIN run_it_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_it_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: a place of a list read in this run, missing from it twice in a row, is removed (an
 * owner-claimed page is kept and counted for review), as in the other markets. The places of a
 * list left out of the run are not counted missing.
 */
export async function markItMissing(tx: TransactionSql, sources: readonly ItSourceId[]) {
	const schemes = sources.map((source) => IT_SOURCES[source].idScheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'IT' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM it_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'IT' AND p.status = 'active' AND p.id_scheme = ANY (${schemes}::text[])
			AND NOT EXISTS (
				SELECT 1 FROM it_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'IT' AND status = 'active' AND id_scheme = ANY (${schemes}::text[])
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'IT' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
