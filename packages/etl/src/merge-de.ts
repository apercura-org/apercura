/**
 * Merge of the parsed German sources into the shared directory schema (`country = 'DE'`), in the
 * import's one transaction.
 *
 * A facility is a row of `directory.practitioners` (the page's subject) under its source's
 * scheme (`DE-KHV`, `DE-RHV`, `DE-APO-TH`, `DE-APO-BB`), its name in `last_name` and no first
 * name; its address is its site, one activity links them, and its departments, emergency care,
 * operator type, kind of facility, pharmacy kind and step-free access are its qualifications. A
 * facility is placed in its Gemeinde by its municipality key, else its town's name, else its
 * point (`placeFacility`); a pharmacy is located at its published point (address precision), a
 * hospital or clinic at its Gemeinde's centre (city precision: no map pin). The rows are grouped
 * here, in memory (about 4,800 facilities), then upserted set-based, guarded by row hashes, so a
 * second run over the same files changes nothing.
 */
import { DE_ID_SCHEMES, type DeIdScheme, deFacilitySlug } from "@apercura/core";
import { deListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { type DePlaceIndex, loadDePlaceIndex, placeFacility } from "./sources/de/places";
import { DE_SOURCES, type DeSourceId, type ParseResult } from "./sources/de/types";

export type DePerson = {
	id_scheme: DeIdScheme;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type DeSite = {
	source: string;
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	municipality_code: string | null;
	state_code: string;
	longitude: number | null;
	latitude: number | null;
	phone: string | null;
};

export type DeActivity = {
	source: string;
	source_key: string;
	id_scheme: DeIdScheme;
	national_id: string;
	site_key: string;
};

export type DeQualificationRow = {
	id_scheme: DeIdScheme;
	national_id: string;
	source: string;
	code: string;
	label: string;
};

export type DeBatch = {
	people: DePerson[];
	sites: DeSite[];
	activities: DeActivity[];
	qualifications: DeQualificationRow[];
};

/** Groups the parsed rows into facilities, sites, activities and qualifications. */
export function buildDeBatch(results: readonly ParseResult[]): DeBatch {
	const batch: DeBatch = { people: [], sites: [], activities: [], qualifications: [] };
	for (const result of results) {
		const { scheme, siteSource } = DE_SOURCES[result.source];
		for (const row of result.rows) {
			batch.people.push({
				id_scheme: scheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: deListingSlugFor(row.professionCode, null),
				slug: deFacilitySlug(row.name, scheme, row.nationalId),
			});
			batch.sites.push({
				source: siteSource,
				source_key: row.nationalId,
				address_line: row.street,
				postcode: row.postcode,
				city: row.city,
				municipality_code: row.municipalityCode,
				state_code: row.stateCode,
				longitude: row.point?.longitude ?? null,
				latitude: row.point?.latitude ?? null,
				phone: row.phone,
			});
			batch.activities.push({
				source: siteSource,
				source_key: `${row.nationalId}@${row.nationalId}`,
				id_scheme: scheme,
				national_id: row.nationalId,
				site_key: row.nationalId,
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

const SCHEMES = Object.keys(DE_ID_SCHEMES);

/**
 * Stages the batch in temporary tables, drops suppressed facilities (GDPR objections always
 * win) and places every site (`placeFacility`: municipality key, town name, point, Kreis).
 */
export async function stageDe(tx: TransactionSql, batch: DeBatch, index?: DePlaceIndex) {
	const places = index ?? (await loadDePlaceIndex(tx));
	const counts = { code: 0, name: 0, nearest: 0, district: 0, none: 0 };
	const sites = batch.sites.map((site) => {
		const placement = placeFacility(
			{
				municipalityCode: site.municipality_code,
				city: site.city,
				stateCode: site.state_code,
				point:
					site.longitude !== null && site.latitude !== null
						? { longitude: site.longitude, latitude: site.latitude }
						: null,
			},
			places,
		);
		counts[placement.placedBy ?? "none"]++;
		return {
			source: site.source,
			source_key: site.source_key,
			address_line: site.address_line,
			postcode: site.postcode,
			city: site.city,
			longitude: site.longitude,
			latitude: site.latitude,
			phone: site.phone,
			place_id: placement.placeId,
			placed_by: placement.placedBy,
		};
	});
	await tx.unsafe(`CREATE TEMP TABLE de_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE de_sites (${SITE_COLUMNS}, location geography(Point, 4326)) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE de_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE de_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "de_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"de_sites (source, source_key, address_line, postcode, city, longitude, latitude, phone, place_id, placed_by)",
		SITE_COLUMNS,
		sites,
	);
	await insertJson(tx, "de_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "de_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE de_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE de_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE de_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`
		UPDATE de_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`ANALYZE de_people, de_sites, de_activities, de_quals`;

	const suppressed = await tx`
		DELETE FROM de_people r
		USING directory.suppressions s
		WHERE s.country = 'DE' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM de_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM de_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM de_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM de_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM de_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM de_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	const [staged] = await tx<
		{ people: number; sites: number; placed: number; inCommune: number; located: number }[]
	>`
		SELECT (SELECT count(*) FROM de_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE p.kind = 'commune')::integer AS "inCommune",
			count(*) FILTER (WHERE s.location IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located
		FROM de_sites s
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
 * Upserts the staged sites: at the published point at address precision (pharmacies), else at
 * the Gemeinde's centre at city precision (the hospital directory publishes no coordinates: no
 * map pin), else unlocated when placed in a Kreis only.
 */
export async function mergeDeSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM de_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, city, 'DE',
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
 * Upserts the staged facilities (`country = 'DE'`): the name in `last_name` (and as the source
 * name), no first name. A page's slug is set once, at creation.
 */
export async function mergeDePractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'DE', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code, NULL,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM de_people r
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
 * Upserts the activities (one per facility) and removes those the sources read no longer give;
 * a source left out of the run keeps its activities.
 */
export async function mergeDeActivities(tx: TransactionSql, sources: readonly DeSourceId[]) {
	const siteSources = sources.map((source) => DE_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_de_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM de_activities a
		JOIN directory.practitioners p ON p.country = 'DE' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_de_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_de_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_de_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'DE' AND p.id_scheme = ANY (${SCHEMES}::text[])
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_de_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications of the facilities whose set changed (hash compare, as in the
 * other markets).
 */
export async function mergeDeQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_de_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM de_quals q
		JOIN directory.practitioners p ON p.country = 'DE' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_de_quals`;
	await tx`
		CREATE TEMP TABLE run_de_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN de_people r ON p.country = 'DE' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_de_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_de_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_de_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_de_quals q
		JOIN run_de_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_de_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * How many runs in a row a facility of a source read in the run must be missing from it before
 * its page is removed. The directory of hospitals is a yearly edition: a run reads a new one only
 * once a year (an unchanged file skips the run), and the edition that no longer lists a site is
 * the statistical offices' own count, so one absence removes it. The pharmacy lists change as
 * the authorities update them: two absences, as in the other markets.
 */
export const DE_MISSING_RUNS: Readonly<Record<DeSourceId, number>> = {
	khv: 1,
	rhv: 1,
	"apo-th": 2,
	"apo-bb": 2,
};

/**
 * Absences: a facility of a source read in this run and missing from it is counted missing, and
 * removed after `DE_MISSING_RUNS` runs in a row (an owner-claimed page is kept and counted for
 * review). The facilities of a source left out of the run are not counted missing.
 */
export async function markDeMissing(tx: TransactionSql, sources: readonly DeSourceId[]) {
	const schemes = sources.map((source) => DE_SOURCES[source].scheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'DE' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM de_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'DE' AND p.id_scheme = ANY (${schemes}::text[]) AND p.status = 'active'
			AND NOT EXISTS (
				SELECT 1 FROM de_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	let removed = 0;
	for (const source of sources) {
		const result = await tx`
			UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
				updated_at = now()
			WHERE country = 'DE' AND id_scheme = ${DE_SOURCES[source].scheme} AND status = 'active'
				AND missing_runs >= ${DE_MISSING_RUNS[source]} AND claim_status = 'unclaimed'
		`;
		removed += result.count;
	}
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'DE' AND status = 'active' AND missing_runs >= 1 AND claim_status <> 'unclaimed'
	`;
	return { missing: missing.count, removed, claimedNeedingReview: review?.count ?? 0 };
}
