/**
 * Merge of the placed Irish lists into the shared directory schema (`country = 'IE'`), in the
 * import's one transaction.
 *
 * A facility (a pharmacy, a nursing home, a hospital, a health centre) is a row of
 * `directory.practitioners` (the page's subject) under its list's id scheme, its name in
 * `last_name` and no first name; its address is its site, one activity links them, and a
 * hospital's kind, a nursing home's capacity, operator and HIQA page are its qualifications. A
 * site is placed in the town or the county `IeLocator` found and located at its list's point
 * (the HSE's layers: address precision, a map pin) or its town's (city precision: no map pin); a
 * site placed in its county only is unlocated. The rows are upserted set-based, guarded by row
 * hashes, so a second run over the same files changes nothing.
 */
import { ieFacilitySlug } from "@apercura/core";
import { ieListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { IeCombined, LocatedIeFacility } from "./sources/ie/combine";
import { IE_SOURCES, type IeSourceId } from "./sources/ie/types";

export type IePerson = {
	id_scheme: string;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type IeSite = {
	source: string;
	source_key: string;
	kind: string;
	address_line: string | null;
	postcode: string | null;
	city: string | null;
	place_kind: string;
	place_code: string;
	latitude: number | null;
	longitude: number | null;
	phone: string | null;
};

export type IeActivity = {
	source: string;
	source_key: string;
	id_scheme: string;
	national_id: string;
	site_key: string;
	practice_kind: string;
};

export type IeQualificationRow = {
	id_scheme: string;
	national_id: string;
	source: string;
	code: string;
	label: string | null;
};

export type IeBatch = {
	people: IePerson[];
	sites: IeSite[];
	activities: IeActivity[];
	qualifications: IeQualificationRow[];
	/** Facilities not read this run whose rows stay as they are (`IeCombined.spared`). */
	spared: { id_scheme: string; national_id: string }[];
};

/** Groups the placed facilities into pages, sites, activities and qualifications. */
export function buildIeBatch(
	facilities: readonly LocatedIeFacility[],
	spared: IeCombined["spared"] = [],
): IeBatch {
	const batch: IeBatch = {
		people: [],
		sites: [],
		activities: [],
		qualifications: [],
		spared: spared.map((row) => ({ id_scheme: row.idScheme, national_id: row.nationalId })),
	};
	for (const row of facilities) {
		const config = IE_SOURCES[row.source];
		batch.people.push({
			id_scheme: row.idScheme,
			national_id: row.nationalId,
			name: row.name,
			profession_code: row.professionCode,
			listing_slug: ieListingSlugFor(row.professionCode, null),
			slug: ieFacilitySlug(row.name, row.idScheme, row.nationalId),
		});
		batch.sites.push({
			source: config.registry,
			source_key: row.nationalId,
			kind: config.siteKind,
			address_line: row.location.street,
			postcode: row.eircode,
			city: row.location.city,
			place_kind: row.location.kind,
			place_code: row.location.code,
			latitude: row.latitude,
			longitude: row.longitude,
			phone: row.phone,
		});
		batch.activities.push({
			source: config.registry,
			source_key: `${row.nationalId}@${row.nationalId}`,
			id_scheme: row.idScheme,
			national_id: row.nationalId,
			site_key: row.nationalId,
			practice_kind: config.siteKind,
		});
		for (const qualification of row.qualifications) {
			batch.qualifications.push({
				id_scheme: row.idScheme,
				national_id: row.nationalId,
				...qualification,
			});
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
const SITE_COLUMNS = `source text, source_key text, kind text, address_line text, postcode text,
	city text, place_kind text, place_code text, latitude double precision,
	longitude double precision, phone text`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text, practice_kind text";
const QUALIFICATION_COLUMNS =
	"id_scheme text, national_id text, source text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed facilities (objections always win) and
 * places the sites in the town or county their location names.
 */
export async function stageIe(tx: TransactionSql, batch: IeBatch) {
	await tx.unsafe(`CREATE TEMP TABLE ie_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE ie_sites (${SITE_COLUMNS}, place_id integer) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE ie_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE ie_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe("CREATE TEMP TABLE ie_spared (id_scheme text, national_id text) ON COMMIT DROP");
	await insertJson(tx, "ie_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"ie_sites (source, source_key, kind, address_line, postcode, city, place_kind, place_code, latitude, longitude, phone)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "ie_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "ie_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await insertJson(tx, "ie_spared", "id_scheme text, national_id text", batch.spared);
	await tx`ALTER TABLE ie_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE ie_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE ie_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE ie_people, ie_sites, ie_activities, ie_quals, ie_spared`;

	const suppressed = await tx`
		DELETE FROM ie_people r
		USING directory.suppressions s
		WHERE s.country = 'IE' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM ie_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM ie_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM ie_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM ie_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM ie_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM ie_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	await tx`
		UPDATE ie_sites s SET place_id = p.id
		FROM directory.places p
		WHERE p.country = 'IE' AND p.kind = s.place_kind AND p.code = s.place_code
			AND p.removed_at IS NULL
	`;
	await tx`ANALYZE ie_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			placed: number;
			inTown: number;
			inCounty: number;
			withPoint: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM ie_people)::integer AS people,
			count(*)::integer AS sites,
			count(place_id)::integer AS placed,
			count(*) FILTER (WHERE place_id IS NOT NULL AND place_kind = 'commune')::integer AS "inTown",
			count(*) FILTER (WHERE place_id IS NOT NULL AND place_kind = 'department')::integer AS "inCounty",
			count(*) FILTER (WHERE latitude IS NOT NULL)::integer AS "withPoint"
		FROM ie_sites
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		placed: counts?.placed ?? 0,
		inTown: counts?.inTown ?? 0,
		inCounty: counts?.inCounty ?? 0,
		withPoint: counts?.withPoint ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites: at the list's point (address precision, a map pin), else at the
 * town's point (city precision), else (placed in a county only) unlocated. The commune label is
 * the town the address names (`Tallaght`, `Dublin 15`), else the name of the place the site is
 * placed in.
 */
export async function mergeIeSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*,
				CASE WHEN s.latitude IS NOT NULL
					THEN ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography END AS point,
				CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				coalesce(nullif(s.city, ''), p.name) AS commune,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id, s.latitude,
					s.longitude)) AS address_hash
			FROM ie_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, kind, NULL, address_line, postcode, commune, 'IE',
			place_id, coalesce(point, centroid),
			CASE WHEN point IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN point IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', kind, address_line, postcode, commune, place_id, address_hash, phone,
				ST_AsText(coalesce(point, centroid)::geometry))),
			now()
		FROM src
		ON CONFLICT (source, source_key) DO UPDATE SET
			kind = excluded.kind,
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
 * Upserts the staged facilities (`country = 'IE'`): the name the page prints in `last_name` (and
 * as the source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeIePractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'IE', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code,
			NULL, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM ie_people r
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
 * Upserts the activities (one per facility, its practice kind its site's) and removes those the
 * lists read no longer give; a list left out of the run keeps its activities, and so do the
 * facilities not read this run (`ie_spared`).
 */
export async function mergeIeActivities(tx: TransactionSql, sources: readonly IeSourceId[]) {
	const siteSources = sources.map((source) => IE_SOURCES[source].registry);
	await tx`
		CREATE TEMP TABLE run_ie_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, a.practice_kind, p.id AS practitioner_id, s.id AS site_id
		FROM ie_activities a
		JOIN directory.practitioners p ON p.country = 'IE' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_ie_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_ie_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, practice_kind, source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, r.practice_kind,
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.practice_kind)), now()
		FROM run_ie_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'IE'
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_ie_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
			AND NOT EXISTS (
				SELECT 1 FROM ie_spared x WHERE x.id_scheme = p.id_scheme AND x.national_id = p.national_id
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/** Replaces the qualifications of the facilities whose set changed (hash compare). */
export async function mergeIeQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_ie_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM ie_quals q
		JOIN directory.practitioners p ON p.country = 'IE' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_ie_quals`;
	await tx`
		CREATE TEMP TABLE run_ie_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN ie_people r ON p.country = 'IE' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, coalesce(label, '')), ','
					ORDER BY source, code)) AS hash
			FROM run_ie_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_ie_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_ie_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_ie_quals q
		JOIN run_ie_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_ie_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: a facility of a list read in this run, missing from it twice in a row, is removed (an
 * owner-claimed page is kept and counted for review), as in the other markets. The facilities of
 * a list left out of the run are not counted missing, nor those not read this run (`ie_spared`).
 */
export async function markIeMissing(tx: TransactionSql, sources: readonly IeSourceId[]) {
	const schemes = sources.map((source) => IE_SOURCES[source].idScheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'IE' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM ie_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'IE' AND p.status = 'active' AND p.id_scheme = ANY (${schemes}::text[])
			AND NOT EXISTS (
				SELECT 1 FROM ie_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
			AND NOT EXISTS (
				SELECT 1 FROM ie_spared x WHERE x.id_scheme = p.id_scheme AND x.national_id = p.national_id
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'IE' AND status = 'active' AND id_scheme = ANY (${schemes}::text[])
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'IE' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
