/**
 * Merge of the parsed Norwegian establishments into the shared directory schema
 * (`country = 'NO'`), in the import's one transaction.
 *
 * An establishment is a row of `directory.practitioners` (the page's subject) under the scheme
 * `NO-ORGNR`, its name in `last_name` and no first name, with one site (its location address)
 * linked by one activity; its registered industry code and, for a public owner, its owner are
 * its qualifications. A site is placed in the municipality its address names and located at the
 * cadastre's point of its street address (address precision), else at its postcode's centre or,
 * without one, the municipality's point (city precision: no map pin). An establishment whose
 * municipality is not a known one (Svalbard) is left out. The rows are grouped here, in memory
 * (about 6,000 establishments), then upserted set-based, guarded by row hashes, so a second run
 * over the same files changes nothing.
 */
import { NO_ID_SCHEMES, type NoIdScheme, noFacilitySlug } from "@apercura/core";
import { noListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { AddressIndex } from "./sources/no/addresses";
import type { NoMunicipalityPlace } from "./sources/no/places";
import { addressKey } from "./sources/no/text";
import { NO_SOURCES, type NoSourceId, type ParseResult } from "./sources/no/types";

export type NoPerson = {
	id_scheme: NoIdScheme;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type NoSite = {
	source: string;
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	longitude: number | null;
	latitude: number | null;
	/** `address` (the cadastre's point), `postcode` (its centre) or `centroid` (the municipality's). */
	located_by: "address" | "postcode" | "centroid";
	phone: string | null;
	place_id: number;
};

export type NoActivity = {
	source: string;
	source_key: string;
	id_scheme: NoIdScheme;
	national_id: string;
	site_key: string;
};

export type NoQualificationRow = {
	id_scheme: NoIdScheme;
	national_id: string;
	source: string;
	code: string;
	label: string;
};

export type NoBatch = {
	people: NoPerson[];
	sites: NoSite[];
	activities: NoActivity[];
	qualifications: NoQualificationRow[];
	/** How the establishments were located, and what was left out. */
	placement: {
		/** At the cadastre's point of their street address. */
		address: number;
		/** At their postcode's centre (the address is not in the cadastre's file). */
		postcode: number;
		/** At their municipality's point (no postcode centre either). */
		municipality: number;
		/** Establishments whose municipality is not a known one (Svalbard): left out. */
		unplaced: number;
	};
};

/** The street addresses and postcodes the run looks up in the address file. */
export function addressLookups(results: readonly ParseResult[]): {
	addresses: Set<string>;
	postcodes: Set<string>;
} {
	const addresses = new Set<string>();
	const postcodes = new Set<string>();
	for (const result of results) {
		for (const row of result.rows) {
			if (row.address.street)
				addresses.add(addressKey(row.address.municipality, row.address.street));
			if (row.address.postcode) postcodes.add(row.address.postcode);
		}
	}
	return { addresses, postcodes };
}

/** Groups the parsed rows into establishments, sites, activities and qualifications, placed and located. */
export function buildNoBatch(
	results: readonly ParseResult[],
	municipalities: ReadonlyMap<string, NoMunicipalityPlace>,
	addresses: AddressIndex,
): NoBatch {
	const batch: NoBatch = {
		people: [],
		sites: [],
		activities: [],
		qualifications: [],
		placement: { address: 0, postcode: 0, municipality: 0, unplaced: 0 },
	};
	for (const result of results) {
		const { scheme, siteSource } = NO_SOURCES[result.source];
		for (const row of result.rows) {
			const place = municipalities.get(row.address.municipality);
			if (!place) {
				batch.placement.unplaced++;
				continue;
			}
			const atAddress = row.address.street
				? addresses.byAddress.get(addressKey(row.address.municipality, row.address.street))
				: undefined;
			const atPostcode = row.address.postcode
				? addresses.byPostcode.get(row.address.postcode)
				: undefined;
			const point = atAddress ?? atPostcode ?? null;
			const locatedBy = atAddress ? "address" : atPostcode ? "postcode" : "centroid";
			batch.placement[locatedBy === "centroid" ? "municipality" : locatedBy]++;
			const site: NoSite = {
				source: siteSource,
				source_key: row.nationalId,
				address_line: row.address.street,
				postcode: row.address.postcode,
				// The post town an address prints after its postcode, else the municipality.
				city: row.address.postTown ?? place.name,
				longitude: point?.longitude ?? null,
				latitude: point?.latitude ?? null,
				located_by: locatedBy,
				phone: row.phone,
				place_id: place.id,
			};
			batch.people.push({
				id_scheme: scheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: noListingSlugFor(row.professionCode, null),
				slug: noFacilitySlug(row.name, scheme, row.nationalId),
			});
			batch.sites.push(site);
			batch.activities.push({
				source: siteSource,
				source_key: row.nationalId,
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
	longitude double precision, latitude double precision, located_by text, phone text,
	place_id integer`;
const ACTIVITY_COLUMNS =
	"source text, source_key text, id_scheme text, national_id text, site_key text";
const QUALIFICATION_COLUMNS =
	"id_scheme text, national_id text, source text, code text, label text";

const SCHEMES = Object.keys(NO_ID_SCHEMES);

/**
 * Stages the batch in temporary tables and drops suppressed establishments (GDPR objections
 * always win), with their sites and qualifications.
 */
export async function stageNo(tx: TransactionSql, batch: NoBatch) {
	await tx.unsafe(`CREATE TEMP TABLE no_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE no_sites (${SITE_COLUMNS}, location geography(Point, 4326)) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE no_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE no_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "no_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"no_sites (source, source_key, address_line, postcode, city, longitude, latitude, located_by, phone, place_id)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "no_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "no_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE no_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE no_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE no_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`
		UPDATE no_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`ANALYZE no_people, no_sites, no_activities, no_quals`;

	const suppressed = await tx`
		DELETE FROM no_people r
		USING directory.suppressions s
		WHERE s.country = 'NO' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM no_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM no_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM no_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM no_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM no_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM no_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;
	const [staged] = await tx<
		{ people: number; sites: number; placed: number; located: number; atAddress: number }[]
	>`
		SELECT (SELECT count(*) FROM no_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE s.location IS NOT NULL OR p.centroid IS NOT NULL)::integer AS located,
			count(*) FILTER (WHERE s.located_by = 'address')::integer AS "atAddress"
		FROM no_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
	`;
	return {
		people: staged?.people ?? 0,
		sites: staged?.sites ?? 0,
		placed: staged?.placed ?? 0,
		located: staged?.located ?? 0,
		atAddress: staged?.atAddress ?? 0,
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
 * Upserts the staged sites: at the cadastre's point at address precision, else at the postcode's
 * centre or the municipality's point at city precision (no map pin).
 */
export async function mergeNoSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM no_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', NULL, address_line, postcode, city, 'NO',
			place_id, coalesce(location, centroid),
			CASE WHEN located_by = 'address' AND location IS NOT NULL THEN 'address'
				WHEN coalesce(location, centroid) IS NOT NULL THEN 'city' END,
			CASE WHEN located_by = 'address' AND location IS NOT NULL THEN 'source'
				WHEN location IS NOT NULL THEN 'postcode'
				WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', address_line, postcode, city, place_id, phone, address_hash, located_by,
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
 * Upserts the staged establishments (`country = 'NO'`): the name in `last_name` (and as the
 * source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeNoPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'NO', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code, NULL,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM no_people r
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
 * Upserts the activities (one per establishment, at its site) and removes those the source no
 * longer gives; a source left out of the run keeps its activities.
 */
export async function mergeNoActivities(tx: TransactionSql, sources: readonly NoSourceId[]) {
	const siteSources = sources.map((source) => NO_SOURCES[source].siteSource);
	await tx`
		CREATE TEMP TABLE run_no_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id
		FROM no_activities a
		JOIN directory.practitioners p ON p.country = 'NO' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_no_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_no_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_no_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'NO' AND p.id_scheme = ANY (${SCHEMES}::text[])
			AND act.source = ANY (${siteSources}::text[]) AND act.removed_at IS NULL
			AND EXISTS (
				SELECT 1 FROM no_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
			AND NOT EXISTS (
				SELECT 1 FROM run_no_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Replaces the qualifications of the establishments whose set changed (hash compare, as in the
 * other markets).
 */
export async function mergeNoQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_no_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.code) p.id AS practitioner_id, q.source, q.code, q.label
		FROM no_quals q
		JOIN directory.practitioners p ON p.country = 'NO' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.code, q.label
	`;
	await tx`ANALYZE run_no_quals`;
	await tx`
		CREATE TEMP TABLE run_no_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN no_people r ON p.country = 'NO' AND p.id_scheme = r.id_scheme
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, 'S', code, label), ',' ORDER BY source, code)) AS hash
			FROM run_no_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_no_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_no_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, 'S', q.code, q.label
		FROM run_no_quals q
		JOIN run_no_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_no_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * How many runs in a row an establishment must be missing from the register (or fail its
 * filters) before its page is removed: two, as in the other markets (the files are rebuilt every
 * night).
 */
export const NO_MISSING_RUNS: Readonly<Record<NoSourceId, number>> = { brreg: 2 };

/**
 * Absences: an establishment of a source read in this run and missing from it is counted
 * missing, and removed after `NO_MISSING_RUNS` runs in a row (an owner-claimed page is kept and
 * counted for review). The rows of a source left out of the run are not counted missing.
 */
export async function markNoMissing(tx: TransactionSql, sources: readonly NoSourceId[]) {
	const schemes = sources.map((source) => NO_SOURCES[source].scheme);
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'NO' AND p.missing_runs > 0
			AND EXISTS (
				SELECT 1 FROM no_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'NO' AND p.id_scheme = ANY (${schemes}::text[]) AND p.status = 'active'
			AND NOT EXISTS (
				SELECT 1 FROM no_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	let removed = 0;
	for (const source of sources) {
		const result = await tx`
			UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
				updated_at = now()
			WHERE country = 'NO' AND id_scheme = ${NO_SOURCES[source].scheme} AND status = 'active'
				AND missing_runs >= ${NO_MISSING_RUNS[source]} AND claim_status = 'unclaimed'
		`;
		removed += result.count;
	}
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'NO' AND status = 'active' AND missing_runs >= 1 AND claim_status <> 'unclaimed'
	`;
	return { missing: missing.count, removed, claimedNeedingReview: review?.count ?? 0 };
}
