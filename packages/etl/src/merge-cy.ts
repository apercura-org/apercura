/**
 * Merge of the parsed Cypriot lists into the shared directory schema (`country = 'CY'`), in the
 * import's one transaction.
 *
 * A facility is a row of `directory.practitioners` (the page's subject) under its list's scheme
 * (`CY-FARM` for a private pharmacy, `CY-MOH` for a state hospital or health centre), its name
 * in `last_name` and no first name; its one place is a site, linked by an activity. A facility
 * is placed in its municipality or community (`placeFacility`) and located at the point its list
 * gives (a state hospital: address precision), else at its municipality's or community's centre
 * (city precision: no map pin). A facility that cannot be placed is left out. The rows are built
 * here, in memory (about 700 facilities), then upserted set-based, guarded by row hashes, so a
 * second run over the same files changes nothing.
 */
import { CY_ID_SCHEMES, type CyIdScheme, cyFacilitySlug } from "@apercura/core";
import { cyListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { type CyPlaceIndex, placeFacility } from "./sources/cy/places";
import { CY_SOURCES, type CySourceId, type ParseResult } from "./sources/cy/types";

export type CyPerson = {
	id_scheme: CyIdScheme;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type CySite = {
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

export type CyActivity = {
	source: string;
	source_key: string;
	id_scheme: CyIdScheme;
	national_id: string;
	site_key: string;
};

export type CyBatch = {
	people: CyPerson[];
	sites: CySite[];
	activities: CyActivity[];
	/** How the facilities were placed and located, and what was left out. */
	placement: {
		/** At the point the list gives (the state hospitals). */
		point: number;
		/** At their municipality's or community's centre. */
		centre: number;
		/** Placed by their postcode, by the place their town or name names, by their point. */
		byPostcode: number;
		byName: number;
		byPoint: number;
		/** Facilities whose postcode, town or name names no known place: left out. */
		unplaced: number;
	};
};

/** Groups the parsed rows into facilities, sites and activities, placed and located. */
export function buildCyBatch(results: readonly ParseResult[], places: CyPlaceIndex): CyBatch {
	const batch: CyBatch = {
		people: [],
		sites: [],
		activities: [],
		placement: { point: 0, centre: 0, byPostcode: 0, byName: 0, byPoint: 0, unplaced: 0 },
	};
	for (const result of results) {
		const { scheme, siteSource } = CY_SOURCES[result.source];
		for (const row of result.rows) {
			const placement = placeFacility(row.location, places);
			if (!placement) {
				batch.placement.unplaced++;
				continue;
			}
			if (placement.placedBy === "postcode") batch.placement.byPostcode++;
			else if (placement.placedBy === "name") batch.placement.byName++;
			else batch.placement.byPoint++;
			const point = row.location.point;
			if (point) batch.placement.point++;
			else batch.placement.centre++;
			const site: CySite = {
				source: siteSource,
				source_key: row.nationalId,
				address_line: row.location.street,
				postcode: row.location.postcode,
				// A pharmacy's address names its locality as the list writes it (`Κάτω Πάφος`); a state
				// facility's is its municipality's or community's name.
				city:
					result.source === "farmakeia" && row.location.town
						? row.location.town
						: placement.place.name,
				longitude: point?.longitude ?? null,
				latitude: point?.latitude ?? null,
				phone: row.location.phone,
				place_id: placement.place.id,
				placed_by: point ? "point" : placement.placedBy,
			};
			batch.people.push({
				id_scheme: scheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: cyListingSlugFor(row.professionCode, null),
				slug: cyFacilitySlug(row.name, scheme, row.nationalId),
			});
			batch.sites.push(site);
			batch.activities.push({
				source: siteSource,
				source_key: `${row.nationalId}@${site.source_key}`,
				id_scheme: scheme,
				national_id: row.nationalId,
				site_key: site.source_key,
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
const SITE_COLUMNS = `source text, source_key text, address_line text, postcode text, city text,
	longitude double precision, latitude double precision, phone text, place_id integer,
	placed_by text`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text";

const SCHEMES = Object.keys(CY_ID_SCHEMES);

/** Stages the batch in temporary tables and drops suppressed facilities (GDPR objections always win). */
export async function stageCy(tx: TransactionSql, batch: CyBatch) {
	await tx.unsafe(`CREATE TEMP TABLE cy_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE cy_sites (${SITE_COLUMNS}, location geography(Point, 4326)) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE cy_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "cy_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"cy_sites (source, source_key, address_line, postcode, city, longitude, latitude, phone, place_id, placed_by)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "cy_activities", ACTIVITY_COLUMNS, batch.activities);
	await tx`ALTER TABLE cy_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE cy_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE cy_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`
		UPDATE cy_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`ANALYZE cy_people, cy_sites, cy_activities`;

	const suppressed = await tx`
		DELETE FROM cy_people r
		USING directory.suppressions s
		WHERE s.country = 'CY' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM cy_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM cy_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM cy_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM cy_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	const [staged] = await tx<
		{ people: number; sites: number; placed: number; located: number; atPoint: number }[]
	>`
		SELECT (SELECT count(*) FROM cy_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE s.location IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located,
			count(*) FILTER (WHERE s.location IS NOT NULL)::integer AS "atPoint"
		FROM cy_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
	`;
	return {
		people: staged?.people ?? 0,
		sites: staged?.sites ?? 0,
		placed: staged?.placed ?? 0,
		located: staged?.located ?? 0,
		atPoint: staged?.atPoint ?? 0,
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
 * Upserts the staged sites: at the list's point at address precision (a hospital), else at the
 * municipality's or community's centre at city precision (no map pin).
 */
export async function mergeCySites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, CASE WHEN p.kind = 'commune' THEN p.centroid END AS centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM cy_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, city, 'CY',
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
 * Upserts the staged facilities (`country = 'CY'`): the name in `last_name` (and as the source
 * name), no first name. A page's slug is set once, at creation.
 */
export async function mergeCyPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'CY', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code, NULL,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM cy_people r
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
 * Upserts the activities (one per facility) and removes those the lists read no longer give; a
 * list left out of the run keeps its activities.
 */
export async function mergeCyActivities(tx: TransactionSql, sources: readonly CySourceId[]) {
	const siteSources = sources.map((source) => CY_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_cy_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM cy_activities a
		JOIN directory.practitioners p ON p.country = 'CY' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_cy_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_cy_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_cy_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'CY' AND p.id_scheme = ANY (${SCHEMES}::text[])
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND EXISTS (
				SELECT 1 FROM cy_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
			AND NOT EXISTS (
				SELECT 1 FROM run_cy_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * How many runs in a row a facility of a list read in the run must be missing from it before its
 * page is removed: two, as in the other markets.
 */
export const CY_MISSING_RUNS: Readonly<Record<CySourceId, number>> = {
	farmakeia: 2,
	nosokomeia: 2,
	kentra: 2,
};

/**
 * Absences: a facility of a list read in this run and missing from it is counted missing, and
 * removed after `CY_MISSING_RUNS` runs in a row (an owner-claimed page is kept and counted for
 * review). A list's facilities are told by their scheme and kind (the two state lists share a
 * scheme), so a list left out of the run never counts another's missing.
 */
export async function markCyMissing(tx: TransactionSql, sources: readonly CySourceId[]) {
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'CY' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM cy_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	let missing = 0;
	let removed = 0;
	for (const source of sources) {
		const { scheme, professionCode } = CY_SOURCES[source];
		const counted = await tx`
			UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
			WHERE p.country = 'CY' AND p.id_scheme = ${scheme} AND p.profession_code = ${professionCode}
				AND p.status = 'active'
				AND NOT EXISTS (
					SELECT 1 FROM cy_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
				)
		`;
		missing += counted.count;
		const result = await tx`
			UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
				updated_at = now()
			WHERE country = 'CY' AND id_scheme = ${scheme} AND profession_code = ${professionCode}
				AND status = 'active' AND missing_runs >= ${CY_MISSING_RUNS[source]}
				AND claim_status = 'unclaimed'
		`;
		removed += result.count;
	}
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'CY' AND status = 'active' AND missing_runs >= 1 AND claim_status <> 'unclaimed'
	`;
	return { missing, removed, claimedNeedingReview: review?.count ?? 0 };
}
