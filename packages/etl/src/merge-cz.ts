/**
 * Merge of the parsed Czech list into the shared directory schema (`country = 'CZ'`), in the
 * import's one transaction.
 *
 * A facility of the NRPZS is a row of `directory.practitioners` (the page's subject), its name
 * as the register publishes it in `last_name` and no first name; its place of care is its site,
 * one activity links them, and its fields of care are its qualifications. The rows are grouped
 * here, in memory (about 33,000 facilities), then upserted set-based, guarded by row hashes, so
 * a second run over the same file changes nothing.
 */
import { CZ_ID_SCHEME, czFacilitySlug } from "@apercura/core";
import { PRAGUE_CODE, PRAGUE_DISTRICT_CODE } from "@apercura/core/country";
import { czListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { CZ_SITE_SOURCE, type ParseResult } from "./sources/cz/types";

export type CzPerson = {
	national_id: string;
	name: string;
	profession_code: string;
	primary_specialty_code: string | null;
	listing_slug: string | null;
	slug: string;
};

export type CzSite = {
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	district_code: string;
	latitude: number | null;
	longitude: number | null;
	phone: string | null;
};

export type CzActivity = {
	source_key: string;
	national_id: string;
	site_key: string;
	skill_code: string | null;
};

export type CzQualification = { national_id: string; code: string; label: string };

export type CzBatch = {
	people: CzPerson[];
	sites: CzSite[];
	activities: CzActivity[];
	qualifications: CzQualification[];
	/** Places of care listed for two facilities (the first one keeps the site). */
	sharedSites: number;
};

/** Groups the parsed rows into facilities, sites, activities and fields of care. */
export function buildCzBatch(result: ParseResult): CzBatch {
	const people: CzPerson[] = [];
	const sites = new Map<string, CzSite>();
	const activities: CzActivity[] = [];
	const qualifications: CzQualification[] = [];
	let sharedSites = 0;
	for (const row of result.rows) {
		people.push({
			national_id: row.nationalId,
			name: row.name,
			profession_code: row.professionCode,
			primary_specialty_code: row.specialtyCode,
			listing_slug: czListingSlugFor(row.professionCode, row.specialtyCode),
			slug: czFacilitySlug(row.name, row.nationalId),
		});
		if (sites.has(row.siteKey)) sharedSites++;
		else {
			sites.set(row.siteKey, {
				source_key: row.siteKey,
				address_line: row.street,
				postcode: row.postcode,
				city: row.city,
				district_code: row.districtCode,
				latitude: row.latitude,
				longitude: row.longitude,
				phone: row.phone,
			});
		}
		activities.push({
			source_key: `${row.nationalId}@${row.siteKey}`,
			national_id: row.nationalId,
			site_key: row.siteKey,
			skill_code: row.specialtyCode,
		});
		for (const field of row.fields) {
			qualifications.push({ national_id: row.nationalId, code: field.code, label: field.label });
		}
	}
	return { people, sites: [...sites.values()], activities, qualifications, sharedSites };
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
const SITE_COLUMNS = `source_key text, address_line text, postcode text, city text,
	district_code text, latitude double precision, longitude double precision, phone text`;
const ACTIVITY_COLUMNS = "source_key text, national_id text, site_key text, skill_code text";
const QUALIFICATION_COLUMNS = "national_id text, code text, label text";

/** How far a place of care may be from the municipality it is placed in by distance (20 km). */
const NEAREST_COMMUNE_METRES = 20_000;

/**
 * Stages the batch in temporary tables, drops suppressed facilities (GDPR objections always
 * win), locates the sites (the register's WGS 84 points) and places them:
 * 1. Prague: the administrative district the register names (`Praha 8`);
 * 2. elsewhere: the only municipality of the district with the register's municipality name
 *    (the nearer one when two share it);
 * 3. else (Prague without a district, a name the places do not know) the nearest Prague
 *    district, or the nearest municipality of the district within 20 km;
 * 4. else the district itself.
 */
export async function stageCz(tx: TransactionSql, batch: CzBatch) {
	await tx.unsafe(`CREATE TEMP TABLE cz_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE cz_sites (${SITE_COLUMNS}, location geography(Point, 4326), place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE cz_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE cz_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "cz_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"cz_sites (source_key, address_line, postcode, city, district_code, latitude, longitude, phone)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "cz_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "cz_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE cz_people ADD PRIMARY KEY (national_id)`;
	await tx`ALTER TABLE cz_sites ADD PRIMARY KEY (source_key)`;
	await tx`ALTER TABLE cz_activities ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE cz_people, cz_sites, cz_activities, cz_quals`;

	const suppressed = await tx`
		DELETE FROM cz_people r
		USING directory.suppressions s
		WHERE s.country = 'CZ' AND s.id_scheme = ${CZ_ID_SCHEME} AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM cz_activities a
		WHERE NOT EXISTS (SELECT 1 FROM cz_people p WHERE p.national_id = a.national_id)
	`;
	await tx`
		DELETE FROM cz_quals q
		WHERE NOT EXISTS (SELECT 1 FROM cz_people p WHERE p.national_id = q.national_id)
	`;
	await tx`
		DELETE FROM cz_sites s
		WHERE NOT EXISTS (SELECT 1 FROM cz_activities a WHERE a.site_key = s.source_key)
	`;

	await tx`
		UPDATE cz_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE latitude IS NOT NULL AND longitude IS NOT NULL
	`;
	await tx`ANALYZE cz_sites`;
	// 1. Prague's administrative district, by name.
	await tx`
		UPDATE cz_sites s SET place_id = x.place_id, placed_by = 'name'
		FROM (
			SELECT s.source_key, min(p.id) AS place_id
			FROM cz_sites s
			JOIN directory.places p ON p.country = 'CZ' AND p.kind = 'arrondissement'
				AND p.department_code = ${PRAGUE_DISTRICT_CODE} AND p.removed_at IS NULL
				AND directory.match_key(p.name) = directory.match_key(s.city)
			WHERE s.district_code = ${PRAGUE_DISTRICT_CODE}
			GROUP BY s.source_key
			HAVING count(*) = 1
		) x
		WHERE x.source_key = s.source_key
	`;
	// 2. The municipality of the district, by name (never Prague itself: its districts list it).
	await tx`
		UPDATE cz_sites s SET place_id = x.place_id, placed_by = 'name'
		FROM (
			SELECT s.source_key, min(p.id) AS place_id
			FROM cz_sites s
			JOIN directory.places p ON p.country = 'CZ' AND p.kind = 'commune'
				AND p.department_code = s.district_code AND p.removed_at IS NULL
				AND p.code <> ${PRAGUE_CODE}
				AND directory.match_key(p.name) = directory.match_key(s.city)
			WHERE s.place_id IS NULL
			GROUP BY s.source_key
			HAVING count(*) = 1
		) x
		WHERE x.source_key = s.source_key
	`;
	// 2b. Two municipalities of the district share the name (Pohled, Březina): the nearer one.
	await tx`
		UPDATE cz_sites s SET place_id = n.id, placed_by = 'name'
		FROM cz_sites s2
		CROSS JOIN LATERAL (
			SELECT p.id FROM directory.places p
			WHERE p.country = 'CZ' AND p.kind = 'commune' AND p.removed_at IS NULL
				AND p.department_code = s2.district_code AND p.code <> ${PRAGUE_CODE}
				AND p.centroid IS NOT NULL
				AND directory.match_key(p.name) = directory.match_key(s2.city)
			ORDER BY p.centroid <-> s2.location
			LIMIT 1
		) n
		WHERE s.source_key = s2.source_key AND s2.place_id IS NULL AND s2.location IS NOT NULL
	`;
	// 3. The nearest Prague district, or municipality of the district, to the register's point.
	await tx`
		UPDATE cz_sites s SET place_id = n.id, placed_by = 'nearest'
		FROM cz_sites s2
		CROSS JOIN LATERAL (
			SELECT p.id FROM directory.places p
			WHERE p.country = 'CZ' AND p.removed_at IS NULL AND p.centroid IS NOT NULL
				AND p.department_code = s2.district_code
				AND CASE WHEN s2.district_code = ${PRAGUE_DISTRICT_CODE}
					THEN p.kind = 'arrondissement'
					ELSE p.kind = 'commune' AND p.code <> ${PRAGUE_CODE} END
				AND ST_DWithin(p.centroid, s2.location, ${NEAREST_COMMUNE_METRES})
			ORDER BY p.centroid <-> s2.location
			LIMIT 1
		) n
		WHERE s.source_key = s2.source_key AND s2.place_id IS NULL AND s2.location IS NOT NULL
	`;
	// 4. The district itself.
	await tx`
		UPDATE cz_sites s SET place_id = d.id, placed_by = 'district'
		FROM directory.places d
		WHERE s.place_id IS NULL AND d.country = 'CZ' AND d.kind = 'department'
			AND d.code = s.district_code AND d.removed_at IS NULL
	`;
	await tx`ANALYZE cz_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			located: number;
			placed: number;
			byName: number;
			nearest: number;
			inDistrict: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM cz_people)::integer AS people,
			count(*)::integer AS sites,
			count(location)::integer AS located,
			count(place_id)::integer AS placed,
			count(*) FILTER (WHERE placed_by = 'name')::integer AS "byName",
			count(*) FILTER (WHERE placed_by = 'nearest')::integer AS nearest,
			count(*) FILTER (WHERE placed_by = 'district')::integer AS "inDistrict"
		FROM cz_sites
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		located: counts?.located ?? 0,
		placed: counts?.placed ?? 0,
		byName: counts?.byName ?? 0,
		nearest: counts?.nearest ?? 0,
		inDistrict: counts?.inDistrict ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites. A site with the register's point is at address precision; one
 * without takes its municipality's centre, at city precision (no map pin).
 */
export async function mergeCzSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM cz_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT ${CZ_SITE_SOURCE}, source_key, 'office', NULL, address_line, postcode, city, 'CZ',
			place_id, coalesce(location, centroid),
			CASE WHEN location IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN location IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', address_line, postcode, city, place_id, phone, address_hash)),
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
 * Upserts the staged facilities (`country = 'CZ'`): the register's name in `last_name` (and as
 * the source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeCzPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'CZ', ${CZ_ID_SCHEME}, r.national_id, '', r.name, '', r.name, r.profession_code,
			r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.primary_specialty_code, r.listing_slug)),
			now(), 0, 'active'
		FROM cz_people r
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

/** Upserts the activities (one per facility and place of care) and removes those the list no longer gives. */
export async function mergeCzActivities(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_cz_activities ON COMMIT DROP AS
		SELECT a.source_key, p.id AS practitioner_id, s.id AS site_id, a.skill_code
		FROM cz_activities a
		JOIN directory.practitioners p ON p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME}
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = ${CZ_SITE_SOURCE} AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_cz_activities ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE run_cz_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, ${CZ_SITE_SOURCE}, r.source_key,
			CASE WHEN r.skill_code IS NULL THEN NULL ELSE 'S' END, r.skill_code, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.skill_code)), now()
		FROM run_cz_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME}
			AND act.source = ${CZ_SITE_SOURCE} AND act.removed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM run_cz_activities r WHERE r.source_key = act.source_key)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/** Replaces the fields of care of the facilities whose set changed (hash compare, as in Austria). */
export async function mergeCzQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_cz_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.code) p.id AS practitioner_id, q.code, q.label
		FROM cz_quals q
		JOIN directory.practitioners p ON p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME}
			AND p.national_id = q.national_id
		ORDER BY p.id, q.code, q.label
	`;
	await tx`ANALYZE run_cz_quals`;
	await tx`
		CREATE TEMP TABLE run_cz_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN cz_people r ON p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME}
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', 'obor', 'S', code, label), ',' ORDER BY code)) AS hash
			FROM run_cz_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_cz_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_cz_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, 'obor', 'S', q.code, q.label
		FROM run_cz_quals q
		JOIN run_cz_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_cz_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: a facility missing from the register twice in a row is removed (an owner-claimed
 * page is kept and counted for review), as in the other markets.
 */
export async function markCzMissing(tx: TransactionSql) {
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME} AND p.missing_runs > 0
			AND EXISTS (SELECT 1 FROM cz_people r WHERE r.national_id = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'CZ' AND p.id_scheme = ${CZ_ID_SCHEME} AND p.status = 'active'
			AND NOT EXISTS (SELECT 1 FROM cz_people r WHERE r.national_id = p.national_id)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'CZ' AND id_scheme = ${CZ_ID_SCHEME} AND status = 'active'
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'CZ' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
