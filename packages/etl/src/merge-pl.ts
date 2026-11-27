/**
 * Merge of the parsed Polish register into the shared directory schema (`country = 'PL'`), in
 * the import's one transaction.
 *
 * An establishment of RPWDL is a row of `directory.practitioners` (the page's subject), its name
 * in `last_name` and no first name; each distinct address of its units and cells is a site, one
 * activity links the establishment to each, and its facts are its qualifications: the kinds of
 * its cells (part VIII codes, `komorka`), its kind of activity (`rodzaj`), its beds (`lozka`), its
 * ownership (`forma`) and, for an operator that is not a natural person, the operating entity's
 * name (`podmiot`). The rows are grouped here, in memory (about 35,000 establishments), then
 * upserted set-based, guarded by row hashes, so a second run over the same file changes nothing.
 */
import { PL_ID_SCHEME, plFacilitySlug } from "@apercura/core";
import { plListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import { type ParseResult, PL_SITE_SOURCE } from "./sources/pl/types";

export type PlPerson = {
	national_id: string;
	name: string;
	profession_code: string;
	primary_specialty_code: string | null;
	listing_slug: string | null;
	slug: string;
};

export type PlSiteRow = {
	source_key: string;
	name: string | null;
	address_line: string | null;
	postcode: string | null;
	city: string;
	gmina_code: string | null;
	simc: string | null;
	phone: string | null;
};

export type PlActivity = {
	source_key: string;
	national_id: string;
	site_key: string;
	skill_code: string | null;
};

export type PlQualification = {
	national_id: string;
	source: string;
	type_code: string;
	code: string;
	label: string | null;
};

export type PlBatch = {
	people: PlPerson[];
	sites: PlSiteRow[];
	activities: PlActivity[];
	qualifications: PlQualification[];
};

/** Groups the parsed establishments into pages, sites, activities and facts. */
export function buildPlBatch(result: ParseResult): PlBatch {
	const people: PlPerson[] = [];
	const sites: PlSiteRow[] = [];
	const activities: PlActivity[] = [];
	const qualifications: PlQualification[] = [];
	for (const row of result.rows) {
		people.push({
			national_id: row.nationalId,
			name: row.name,
			profession_code: row.professionCode,
			primary_specialty_code: row.specialtyCode,
			listing_slug: plListingSlugFor(row.professionCode, row.specialtyCode),
			slug: plFacilitySlug(row.name, row.nationalId),
		});
		for (const site of row.sites) {
			sites.push({
				source_key: site.key,
				name: site.name,
				address_line: site.street,
				postcode: site.postcode,
				city: site.city,
				gmina_code: site.gminaCode,
				simc: site.simc,
				phone: site.phone,
			});
			activities.push({
				source_key: `${row.nationalId}@${site.key}`,
				national_id: row.nationalId,
				site_key: site.key,
				skill_code: row.specialtyCode,
			});
		}
		const fact = (source: string, typeCode: string, code: string, label: string | null) =>
			qualifications.push({
				national_id: row.nationalId,
				source,
				type_code: typeCode,
				code,
				label,
			});
		for (const cell of row.cells) fact("komorka", "VIII", cell.code, cell.label);
		if (row.activityKind) fact("rodzaj", "R", row.activityKind, null);
		if (row.beds > 0) fact("lozka", "L", "ogolem", String(row.beds));
		fact("forma", "F", row.ownership === "public" ? "PUBLIC" : "PRIVATE", null);
		if (row.operator) fact("podmiot", "P", "operator", row.operator);
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
const SITE_COLUMNS = `source_key text, name text, address_line text, postcode text, city text,
	gmina_code text, simc text, phone text`;
const ACTIVITY_COLUMNS = "source_key text, national_id text, site_key text, skill_code text";
const QUALIFICATION_COLUMNS =
	"national_id text, source text, type_code text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed establishments (GDPR objections always
 * win), and places the sites:
 * 1. the gmina of the site's TERYT code (a town or rural area of an urban-rural gmina, a
 *    district of Warsaw or a delegation of Kraków, Łódź, Poznań or Wrocław read as its gmina or
 *    city by the parser);
 * 2. else the only gmina of the country named like the site's locality;
 * 3. else the powiat of its TERYT code.
 * A site is located at its gmina's centre (city precision: the register publishes no point).
 */
export async function stagePl(tx: TransactionSql, batch: PlBatch) {
	await tx.unsafe(`CREATE TEMP TABLE pl_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE pl_sites (${SITE_COLUMNS}, place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE pl_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE pl_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "pl_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"pl_sites (source_key, name, address_line, postcode, city, gmina_code, simc, phone)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "pl_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "pl_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE pl_people ADD PRIMARY KEY (national_id)`;
	await tx`ALTER TABLE pl_sites ADD PRIMARY KEY (source_key)`;
	await tx`ALTER TABLE pl_activities ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE pl_people, pl_sites, pl_activities, pl_quals`;

	const suppressed = await tx`
		DELETE FROM pl_people r
		USING directory.suppressions s
		WHERE s.country = 'PL' AND s.id_scheme = ${PL_ID_SCHEME} AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM pl_activities a
		WHERE NOT EXISTS (SELECT 1 FROM pl_people p WHERE p.national_id = a.national_id)
	`;
	await tx`
		DELETE FROM pl_quals q
		WHERE NOT EXISTS (SELECT 1 FROM pl_people p WHERE p.national_id = q.national_id)
	`;
	await tx`
		DELETE FROM pl_sites s
		WHERE NOT EXISTS (SELECT 1 FROM pl_activities a WHERE a.site_key = s.source_key)
	`;

	// 1. The gmina of the TERYT code.
	await tx`
		UPDATE pl_sites s SET place_id = p.id, placed_by = 'code'
		FROM directory.places p
		WHERE p.country = 'PL' AND p.kind = 'commune' AND p.code = s.gmina_code
			AND p.removed_at IS NULL
	`;
	// 2. The only gmina of the country named like the locality (a site without a code).
	await tx`
		UPDATE pl_sites s SET place_id = x.place_id, placed_by = 'name'
		FROM (
			SELECT s.source_key, min(p.id) AS place_id
			FROM pl_sites s
			JOIN directory.places p ON p.country = 'PL' AND p.kind = 'commune' AND p.removed_at IS NULL
				AND directory.match_key(p.name) = directory.match_key(s.city)
			WHERE s.place_id IS NULL
			GROUP BY s.source_key
			HAVING count(*) = 1
		) x
		WHERE x.source_key = s.source_key
	`;
	// 3. The powiat of the code.
	await tx`
		UPDATE pl_sites s SET place_id = d.id, placed_by = 'district'
		FROM directory.places d
		WHERE s.place_id IS NULL AND s.gmina_code IS NOT NULL AND d.country = 'PL'
			AND d.kind = 'department' AND d.code = left(s.gmina_code, 4) AND d.removed_at IS NULL
	`;
	await tx`ANALYZE pl_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			placed: number;
			byCode: number;
			byName: number;
			inDistrict: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM pl_people)::integer AS people,
			count(*)::integer AS sites,
			count(place_id)::integer AS placed,
			count(*) FILTER (WHERE placed_by = 'code')::integer AS "byCode",
			count(*) FILTER (WHERE placed_by = 'name')::integer AS "byName",
			count(*) FILTER (WHERE placed_by = 'district')::integer AS "inDistrict"
		FROM pl_sites
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		placed: counts?.placed ?? 0,
		byCode: counts?.byCode ?? 0,
		byName: counts?.byName ?? 0,
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
 * Upserts the staged sites, each at its gmina's centre, at city precision (no map pin): the
 * register publishes addresses, no point.
 */
export async function mergePlSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id)) AS address_hash
			FROM pl_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT ${PL_SITE_SOURCE}, source_key, 'office', name, address_line, postcode, city, 'PL',
			place_id, centroid,
			CASE WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN centroid IS NOT NULL THEN 'centroid' END,
			address_hash, phone,
			md5(concat_ws('|', name, address_line, postcode, city, place_id, phone, address_hash)),
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
 * Upserts the staged establishments (`country = 'PL'`): the name in `last_name` (and as the
 * source name), no first name. A page's slug is set once, at creation.
 */
export async function mergePlPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug,
			source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'PL', ${PL_ID_SCHEME}, r.national_id, '', r.name, '', r.name, r.profession_code,
			r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.primary_specialty_code, r.listing_slug)),
			now(), 0, 'active'
		FROM pl_people r
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

/** Upserts the activities (one per establishment and place of care) and removes those the register no longer gives. */
export async function mergePlActivities(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_pl_activities ON COMMIT DROP AS
		SELECT a.source_key, p.id AS practitioner_id, s.id AS site_id, a.skill_code
		FROM pl_activities a
		JOIN directory.practitioners p ON p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME}
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = ${PL_SITE_SOURCE} AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_pl_activities ADD PRIMARY KEY (source_key)`;
	await tx`ANALYZE run_pl_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, ${PL_SITE_SOURCE}, r.source_key,
			CASE WHEN r.skill_code IS NULL THEN NULL ELSE 'S' END, r.skill_code, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.skill_code)), now()
		FROM run_pl_activities r
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
		WHERE p.id = act.practitioner_id AND p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME}
			AND act.source = ${PL_SITE_SOURCE} AND act.removed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM run_pl_activities r WHERE r.source_key = act.source_key)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/** Replaces the facts of the establishments whose set changed (hash compare, as in Czechia). */
export async function mergePlQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_pl_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.source, q.type_code, q.code) p.id AS practitioner_id, q.source,
			q.type_code, q.code, q.label
		FROM pl_quals q
		JOIN directory.practitioners p ON p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME}
			AND p.national_id = q.national_id
		ORDER BY p.id, q.source, q.type_code, q.code, q.label
	`;
	await tx`ANALYZE run_pl_quals`;
	await tx`
		CREATE TEMP TABLE run_pl_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN pl_people r ON p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME}
			AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, type_code, code, label), ','
					ORDER BY source, type_code, code)) AS hash
			FROM run_pl_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_pl_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_pl_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, q.type_code, q.code, q.label
		FROM run_pl_quals q
		JOIN run_pl_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_pl_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences: an establishment missing from the register twice in a row is removed (an
 * owner-claimed page is kept and counted for review), as in the other markets.
 */
export async function markPlMissing(tx: TransactionSql) {
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME} AND p.missing_runs > 0
			AND EXISTS (SELECT 1 FROM pl_people r WHERE r.national_id = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'PL' AND p.id_scheme = ${PL_ID_SCHEME} AND p.status = 'active'
			AND NOT EXISTS (SELECT 1 FROM pl_people r WHERE r.national_id = p.national_id)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'PL' AND id_scheme = ${PL_ID_SCHEME} AND status = 'active'
			AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'PL' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
