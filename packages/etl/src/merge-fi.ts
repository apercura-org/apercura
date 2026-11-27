/**
 * Merge of the parsed Finnish source into the shared directory schema (`country = 'FI'`), in the
 * import's one transaction.
 *
 * A service location of the Finnish Service Catalogue is a row of `directory.practitioners` (the
 * page's subject) under the scheme `FI-PTV`, its name in `last_name` and no first name; its
 * address is its one site, linked by an activity; the services given there and its organiser
 * are its qualifications. A location is placed in the municipality its address names (the
 * catalogue writes Statistics Finland's code) and located at the catalogue's own point (address
 * precision), else at the municipality's centre (city precision: no map pin). A location whose
 * municipality is unknown is left out. The rows are grouped here, in memory (a few thousand),
 * then upserted set-based, guarded by row hashes, so a second run over the same snapshot
 * changes nothing.
 */
import { FI_ID_SCHEMES, type FiIdScheme, fiFacilitySlug } from "@apercura/core";
import { fiListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { FiPlaceIndex } from "./sources/fi/places";
import { FI_SOURCES, type FiSourceId, type ParseResult } from "./sources/fi/types";

export type FiPerson = {
	id_scheme: FiIdScheme;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type FiSite = {
	source: string;
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	longitude: number | null;
	latitude: number | null;
	phone: string | null;
	place_id: number;
	placed_by: string;
};

export type FiActivity = {
	source: string;
	source_key: string;
	id_scheme: FiIdScheme;
	national_id: string;
	site_key: string;
};

export type FiQualificationRow = {
	id_scheme: FiIdScheme;
	national_id: string;
	source: string;
	code: string;
	label: string;
};

export type FiBatch = {
	people: FiPerson[];
	sites: FiSite[];
	activities: FiActivity[];
	qualifications: FiQualificationRow[];
	/** How the locations were placed and located, and what was left out. */
	placement: {
		/** At the catalogue's own point. */
		point: number;
		/** At their municipality's centre (the catalogue gives no usable point). */
		municipality: number;
		/** Locations whose municipality is not one of Statistics Finland's: left out. */
		unplaced: number;
	};
};

/** Groups the parsed rows into locations, sites, activities and qualifications, placed and located. */
export function buildFiBatch(results: readonly ParseResult[], places: FiPlaceIndex): FiBatch {
	const batch: FiBatch = {
		people: [],
		sites: [],
		activities: [],
		qualifications: [],
		placement: { point: 0, municipality: 0, unplaced: 0 },
	};
	for (const result of results) {
		const { scheme, siteSource } = FI_SOURCES[result.source];
		for (const row of result.rows) {
			const municipality = places.get(row.municipality);
			if (!municipality) {
				batch.placement.unplaced++;
				continue;
			}
			const point = row.longitude !== null && row.latitude !== null;
			if (point) batch.placement.point++;
			else batch.placement.municipality++;
			const site: FiSite = {
				source: siteSource,
				source_key: row.nationalId,
				address_line: row.street,
				postcode: row.postcode,
				city: row.city ?? municipality.name,
				longitude: point ? row.longitude : null,
				latitude: point ? row.latitude : null,
				phone: row.phone,
				place_id: municipality.id,
				placed_by: point ? "point" : "municipality",
			};
			batch.people.push({
				id_scheme: scheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: fiListingSlugFor(row.professionCode, null),
				slug: fiFacilitySlug(row.name, row.nationalId),
			});
			batch.sites.push(site);
			batch.activities.push({
				source: siteSource,
				source_key: `${row.nationalId}@${site.source_key}`,
				id_scheme: scheme,
				national_id: row.nationalId,
				site_key: site.source_key,
			});
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
const SITE_COLUMNS = `source text, source_key text, address_line text, postcode text, city text,
	longitude double precision, latitude double precision, phone text, place_id integer,
	placed_by text`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text";
const QUALIFICATION_COLUMNS =
	"id_scheme text, national_id text, source text, code text, label text";

const SCHEMES = Object.keys(FI_ID_SCHEMES);

/**
 * Stages the batch in temporary tables and drops suppressed locations (GDPR objections always
 * win), with their sites and qualifications.
 */
export async function stageFi(tx: TransactionSql, batch: FiBatch) {
	await tx.unsafe(`CREATE TEMP TABLE fi_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE fi_sites (${SITE_COLUMNS}, location geography(Point, 4326)) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE fi_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE fi_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "fi_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"fi_sites (source, source_key, address_line, postcode, city, longitude, latitude, phone, place_id, placed_by)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "fi_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "fi_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE fi_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE fi_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE fi_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`
		UPDATE fi_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`ANALYZE fi_people, fi_sites, fi_activities, fi_quals`;

	const suppressed = await tx`
		DELETE FROM fi_people r
		USING directory.suppressions s
		WHERE s.country = 'FI' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM fi_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM fi_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM fi_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM fi_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM fi_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM fi_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	const [staged] = await tx<
		{ people: number; sites: number; placed: number; inCommune: number; located: number }[]
	>`
		SELECT (SELECT count(*) FROM fi_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE p.kind = 'commune')::integer AS "inCommune",
			count(*) FILTER (WHERE s.location IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located,
			count(*) FILTER (WHERE s.location IS NOT NULL)::integer AS "atAddress"
		FROM fi_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
	`;
	return {
		people: staged?.people ?? 0,
		sites: staged?.sites ?? 0,
		placed: staged?.placed ?? 0,
		inCommune: staged?.inCommune ?? 0,
		located: staged?.located ?? 0,
		placement: batch.placement,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites: at the catalogue's point at address precision, else at the
 * municipality's centre at city precision (no map pin).
 */
export async function mergeFiSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM fi_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, city, 'FI',
			place_id, coalesce(location, centroid),
			CASE WHEN location IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN location IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
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
 * Upserts the staged locations (`country = 'FI'`): the name in `last_name` (and as the source
 * name), no first name. A page's slug is set once, at creation.
 */
export async function mergeFiPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'FI', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code, NULL,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM fi_people r
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
 * Upserts the activities (one per location) and removes those the source read no longer gives;
 * a source left out of the run keeps its activities.
 */
export async function mergeFiActivities(tx: TransactionSql, sources: readonly FiSourceId[]) {
	const siteSources = sources.map((source) => FI_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_fi_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM fi_activities a
		JOIN directory.practitioners p ON p.country = 'FI' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_fi_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_fi_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_fi_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'FI' AND p.id_scheme = ANY (${SCHEMES}::text[])
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND EXISTS (
				SELECT 1 FROM fi_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
			AND NOT EXISTS (
				SELECT 1 FROM run_fi_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications of the locations whose set changed (hash compare, as in the other
 * markets).
 */
export async function mergeFiQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_fi_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM fi_quals q
		JOIN directory.practitioners p ON p.country = 'FI' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_fi_quals`;
	await tx`
		CREATE TEMP TABLE run_fi_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN fi_people r ON p.country = 'FI' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_fi_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_fi_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_fi_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_fi_quals q
		JOIN run_fi_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_fi_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * How many runs in a row a location must be missing from the catalogue before its page is
 * removed: two, as in the other markets (an organiser that redescribes a location for a week
 * keeps its page).
 */
export const FI_MISSING_RUNS: Readonly<Record<FiSourceId, number>> = { ptv: 2 };

/**
 * Absences: a location of a source read in this run and missing from it is counted missing, and
 * removed after `FI_MISSING_RUNS` runs in a row (an owner-claimed page is kept and counted for
 * review). The rows of a source left out of the run are not counted missing.
 */
export async function markFiMissing(tx: TransactionSql, sources: readonly FiSourceId[]) {
	const schemes = sources.map((source) => FI_SOURCES[source].scheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'FI' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM fi_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'FI' AND p.id_scheme = ANY (${schemes}::text[]) AND p.status = 'active'
			AND NOT EXISTS (
				SELECT 1 FROM fi_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	let removed = 0;
	for (const source of sources) {
		const result = await tx`
			UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
				updated_at = now()
			WHERE country = 'FI' AND id_scheme = ${FI_SOURCES[source].scheme} AND status = 'active'
				AND missing_runs >= ${FI_MISSING_RUNS[source]} AND claim_status = 'unclaimed'
		`;
		removed += result.count;
	}
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'FI' AND status = 'active' AND missing_runs >= 1 AND claim_status <> 'unclaimed'
	`;
	return { missing: missing.count, removed, claimedNeedingReview: review?.count ?? 0 };
}
