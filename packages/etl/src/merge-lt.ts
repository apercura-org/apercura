/**
 * Merge of Lithuania's licence register into the shared directory schema (`country = 'LT'`), in
 * the import's one transaction.
 *
 * A page is an activity address of a licensed institution: a row of `directory.practitioners`
 * (the page's subject), the institution's name in `last_name` and no first name; its address is
 * its site, one activity links them, and its licensed services are its qualifications (source
 * `paslauga`). The rows are grouped in memory (about 6,400 pages), then upserted set-based,
 * guarded by row hashes, so a second run over the same files changes nothing.
 */
import { LT_ID_SCHEME, ltFacilitySlug } from "@apercura/core";
import { ltListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { LT_SERVICE_SOURCE, LT_SITE_SOURCE, type ParseResult } from "./sources/lt/types";

export type LtPerson = {
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type LtSite = {
	source_key: string;
	address_line: string | null;
	postcode: string | null;
	city: string;
	settlement_code: string | null;
	municipality_code: string;
};

export type LtQualification = { national_id: string; code: string; label: string };

export type LtBatch = {
	people: LtPerson[];
	sites: LtSite[];
	qualifications: LtQualification[];
};

/** Groups the parsed rows into pages, sites (one per page) and licensed services. */
export function buildLtBatch(result: ParseResult): LtBatch {
	const people: LtPerson[] = [];
	const sites: LtSite[] = [];
	const qualifications: LtQualification[] = [];
	for (const row of result.rows) {
		people.push({
			national_id: row.nationalId,
			name: row.name,
			profession_code: row.professionCode,
			listing_slug: ltListingSlugFor(row.professionCode, null),
			slug: ltFacilitySlug(row.name, row.nationalId),
		});
		sites.push({
			source_key: row.nationalId,
			address_line: row.street,
			postcode: row.postcode,
			city: row.city,
			settlement_code: row.settlementCode,
			municipality_code: row.municipalityCode,
		});
		for (const service of row.services) {
			qualifications.push({
				national_id: row.nationalId,
				code: service.code,
				label: service.label,
			});
		}
	}
	return { people, sites, qualifications };
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

const PEOPLE_COLUMNS =
	"national_id text, name text, profession_code text, listing_slug text, slug text";
const SITE_COLUMNS = `source_key text, address_line text, postcode text, city text,
	settlement_code text, municipality_code text`;
const QUALIFICATION_COLUMNS = "national_id text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed pages (GDPR objections always win) and
 * places the sites: in their settlement (the Address Register's code), else in their
 * municipality. A site is located at its settlement's point, else its municipality's, at city
 * precision: the register gives no coordinates.
 */
export async function stageLt(tx: TransactionSql, batch: LtBatch) {
	await tx.unsafe(`CREATE TEMP TABLE lt_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE lt_sites (${SITE_COLUMNS}, place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE lt_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "lt_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"lt_sites (source_key, address_line, postcode, city, settlement_code, municipality_code)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "lt_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE lt_people ADD PRIMARY KEY (national_id)`;
	await tx`ALTER TABLE lt_sites ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE lt_people, lt_sites, lt_quals`;

	const suppressed = await tx`
		DELETE FROM lt_people r
		USING directory.suppressions s
		WHERE s.country = 'LT' AND s.id_scheme = ${LT_ID_SCHEME} AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM lt_quals q
		WHERE NOT EXISTS (SELECT 1 FROM lt_people p WHERE p.national_id = q.national_id)
	`;
	await tx`
		DELETE FROM lt_sites s
		WHERE NOT EXISTS (SELECT 1 FROM lt_people p WHERE p.national_id = s.source_key)
	`;
	// 1. The settlement, by its Address Register code.
	await tx`
		UPDATE lt_sites s SET place_id = p.id, placed_by = 'settlement'
		FROM directory.places p
		WHERE p.country = 'LT' AND p.kind = 'commune' AND p.code = s.settlement_code
			AND p.removed_at IS NULL
	`;
	// 2. Else the municipality.
	await tx`
		UPDATE lt_sites s SET place_id = p.id, placed_by = 'municipality'
		FROM directory.places p
		WHERE s.place_id IS NULL AND p.country = 'LT' AND p.kind = 'department'
			AND p.code = s.municipality_code AND p.removed_at IS NULL
	`;
	await tx`ANALYZE lt_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			placed: number;
			inSettlement: number;
			inMunicipality: number;
			located: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM lt_people)::integer AS people,
			count(*)::integer AS sites,
			count(s.place_id)::integer AS placed,
			count(*) FILTER (WHERE s.placed_by = 'settlement')::integer AS "inSettlement",
			count(*) FILTER (WHERE s.placed_by = 'municipality')::integer AS "inMunicipality",
			count(p.centroid)::integer AS located
		FROM lt_sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		placed: counts?.placed ?? 0,
		inSettlement: counts?.inSettlement ?? 0,
		inMunicipality: counts?.inMunicipality ?? 0,
		located: counts?.located ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites, each at its place's centre, at city precision (no map pin): the
 * licence register gives no coordinates.
 */
export async function mergeLtSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id)) AS address_hash
			FROM lt_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT ${LT_SITE_SOURCE}, source_key, 'office', NULL, address_line, postcode, city, 'LT',
			place_id, centroid,
			CASE WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, NULL,
			md5(concat_ws('|', address_line, postcode, city, place_id, address_hash)),
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
 * Upserts the staged pages (`country = 'LT'`): the institution's name in `last_name` (and as the
 * source name), no first name. A page's slug is set once, at creation.
 */
export async function mergeLtPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'LT', ${LT_ID_SCHEME}, r.national_id, '', r.name, '', r.name, r.profession_code,
			NULL, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM lt_people r
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

/** Upserts the activities (one per page, at its own site) and removes those the list no longer gives. */
export async function mergeLtActivities(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_lt_activities ON COMMIT DROP AS
		SELECT r.national_id AS source_key, p.id AS practitioner_id, s.id AS site_id
		FROM lt_people r
		JOIN directory.practitioners p ON p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME}
			AND p.national_id = r.national_id
		LEFT JOIN directory.sites s ON s.source = ${LT_SITE_SOURCE} AND s.source_key = r.national_id
	`;
	await tx`ALTER TABLE run_lt_activities ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE run_lt_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, ${LT_SITE_SOURCE}, r.source_key, NULL, NULL, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_lt_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME}
			AND act.source = ${LT_SITE_SOURCE} AND act.removed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM run_lt_activities r WHERE r.source_key = act.source_key)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/** Replaces the licensed services of the pages whose set changed (hash compare, as in Czechia). */
export async function mergeLtQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_lt_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.code) p.id AS practitioner_id, q.code, q.label
		FROM lt_quals q
		JOIN directory.practitioners p ON p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME}
			AND p.national_id = q.national_id
		ORDER BY p.id, q.code, q.label
	`;
	await tx`ANALYZE run_lt_quals`;
	await tx`
		CREATE TEMP TABLE run_lt_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN lt_people r ON p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME}
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', ${LT_SERVICE_SOURCE}::text, 'S', code, label), ',' ORDER BY code)) AS hash
			FROM run_lt_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_lt_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_lt_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, ${LT_SERVICE_SOURCE}, 'S', q.code, q.label
		FROM run_lt_quals q
		JOIN run_lt_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_lt_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: a page missing from the register twice in a row is removed (an owner-claimed page
 * is kept and counted for review), as in the other markets.
 */
export async function markLtMissing(tx: TransactionSql) {
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME} AND p.missing_runs > 0
			AND EXISTS (SELECT 1 FROM lt_people r WHERE r.national_id = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'LT' AND p.id_scheme = ${LT_ID_SCHEME} AND p.status = 'active'
			AND NOT EXISTS (SELECT 1 FROM lt_people r WHERE r.national_id = p.national_id)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'LT' AND id_scheme = ${LT_ID_SCHEME} AND status = 'active'
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'LT' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
