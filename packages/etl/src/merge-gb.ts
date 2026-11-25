/**
 * Merge of the parsed UK lists into the shared directory schema (`country = 'GB'`), in the
 * import's one transaction.
 *
 * A practice is a row of `directory.practitioners` (the page's subject), its name in
 * `last_name` and no first name: the UK lists name practices, not people. Its sites are its
 * own address and, for an English or Welsh GP practice, its branch surgeries; one activity
 * links it to each. The rows are grouped here, in memory (about 35,000 practices), then
 * upserted set-based, guarded by row hashes, so a second run over the same files changes
 * nothing.
 */
import { gbPracticeSlug } from "@apercura/core";
import { gbListingSlugFor } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { GbPostcodePoint } from "./sources/gb/postcodes";
import type { GbPractice, ParseResult } from "./sources/gb/types";

export type GbPerson = {
	id_scheme: string;
	national_id: string;
	name: string;
	profession_code: string;
	listing_slug: string | null;
	slug: string;
};

export type GbSite = {
	source: string;
	source_key: string;
	name: string | null;
	address_line: string | null;
	postcode: string | null;
	city: string | null;
	localities: string[];
	lad_code: string | null;
	lad_name: string | null;
	phone: string | null;
};

export type GbActivity = {
	source: string;
	source_key: string;
	id_scheme: string;
	national_id: string;
	site_key: string;
	is_main: boolean;
};

export type GbBatch = {
	people: GbPerson[];
	sites: GbSite[];
	activities: GbActivity[];
	/** Branch surgeries left out because their parent practice is not in the run. */
	orphanBranches: number;
	/** Lines of a practice already read from the same list (first kept). */
	duplicates: number;
};

const personKey = (row: Pick<GbPractice, "idScheme" | "nationalId">) =>
	`${row.idScheme}:${row.nationalId}`;

/** Groups the parsed rows into practices, sites and activities. */
export function buildGbBatch(results: readonly ParseResult[]): GbBatch {
	const people = new Map<string, GbPerson>();
	const sites = new Map<string, GbSite>();
	const activities = new Map<string, GbActivity>();
	let orphanBranches = 0;
	let duplicates = 0;
	const addSite = (row: GbPractice) => {
		const siteKey = `${row.source}:${row.siteKey}`;
		if (!sites.has(siteKey)) {
			sites.set(siteKey, {
				source: row.source,
				source_key: row.siteKey,
				name: row.siteName,
				address_line: row.street,
				postcode: row.postcode,
				city: row.town,
				localities: row.localities,
				lad_code: row.ladCode,
				lad_name: row.ladName,
				phone: row.phone,
			});
		}
		const activityKey = `${personKey(row)}@${row.source}:${row.siteKey}`;
		if (!activities.has(activityKey)) {
			activities.set(activityKey, {
				source: row.source,
				source_key: activityKey,
				id_scheme: row.idScheme,
				national_id: row.nationalId,
				site_key: row.siteKey,
				is_main: row.main,
			});
		}
	};
	// Practices first, then the branches of the practices read.
	for (const result of results) {
		for (const row of result.rows) {
			if (!row.main) continue;
			const key = personKey(row);
			if (people.has(key)) {
				duplicates++;
				continue;
			}
			people.set(key, {
				id_scheme: row.idScheme,
				national_id: row.nationalId,
				name: row.name,
				profession_code: row.professionCode,
				listing_slug: gbListingSlugFor(row.professionCode),
				slug: gbPracticeSlug(row.name, row.idScheme, row.nationalId),
			});
			addSite(row);
		}
	}
	for (const result of results) {
		for (const row of result.rows) {
			if (row.main) continue;
			if (!people.has(personKey(row))) {
				orphanBranches++;
				continue;
			}
			addSite(row);
		}
	}
	return {
		people: [...people.values()],
		sites: [...sites.values()],
		activities: [...activities.values()],
		orphanBranches,
		duplicates,
	};
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
const SITE_COLUMNS = `source text, source_key text, name text, address_line text, postcode text,
	city text, localities text[], lad_code text, lad_name text, phone text`;
const ACTIVITY_COLUMNS = `source text, source_key text, id_scheme text, national_id text,
	site_key text, is_main boolean`;
const POSTCODE_COLUMNS = "postcode text, x double precision, y double precision, lad_code text";

/** How far from a site its town may be when no address line names one (3 km). */
const NEAREST_TOWN_METRES = 3_000;

/**
 * Stages the batch in temporary tables, drops suppressed practices (GDPR objections always
 * win), locates the sites by postcode (Code-Point Open, British National Grid, transformed to
 * WGS 84) and places them:
 * 1. the local authority: the list's own (Scottish council areas), else the postcode's, else
 *    the Northern Irish district the list names;
 * 2. the town of the authority with the address's post town name, else with one of its
 *    locality lines (Northern Ireland: any town of Northern Ireland with that name, which also
 *    gives the authority);
 * 3. else the authority's town nearest to the postcode, within 3 km;
 * 4. else the local authority itself (London's boroughs list their practices there).
 */
export async function stageGb(
	tx: TransactionSql,
	batch: GbBatch,
	postcodes: ReadonlyMap<string, GbPostcodePoint>,
) {
	await tx.unsafe(`CREATE TEMP TABLE gb_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE gb_sites (${SITE_COLUMNS}, location geography(Point, 4326), place_id integer, placed_by text) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE gb_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE gb_postcodes (${POSTCODE_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "gb_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"gb_sites (source, source_key, name, address_line, postcode, city, localities, lad_code, lad_name, phone)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "gb_activities", ACTIVITY_COLUMNS, batch.activities);
	const wanted = new Set(batch.sites.map((site) => site.postcode));
	await insertJson(
		tx,
		"gb_postcodes",
		POSTCODE_COLUMNS,
		[...postcodes.entries()]
			.filter(([postcode]) => wanted.has(postcode))
			.map(([postcode, point]) => ({ postcode, x: point.x, y: point.y, lad_code: point.ladCode })),
	);
	await tx`ALTER TABLE gb_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE gb_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE gb_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE gb_postcodes ADD PRIMARY KEY (postcode)`;
	await tx`ANALYZE gb_people, gb_sites, gb_activities, gb_postcodes`;

	const suppressed = await tx`
		DELETE FROM gb_people r
		USING directory.suppressions s
		WHERE s.country = 'GB' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM gb_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM gb_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM gb_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM gb_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;

	// 1. Point and local authority of the postcode.
	await tx`
		UPDATE gb_sites s SET
			location = ST_Transform(ST_SetSRID(ST_MakePoint(pc.x, pc.y), 27700), 4326)::geography,
			lad_code = coalesce(s.lad_code, pc.lad_code),
			placed_by = 'postcode'
		FROM gb_postcodes pc
		WHERE pc.postcode = s.postcode
	`;
	// Northern Ireland's dental list names its district.
	await tx`
		UPDATE gb_sites s SET lad_code = d.code
		FROM directory.places d
		WHERE s.lad_code IS NULL AND s.lad_name IS NOT NULL AND d.country = 'GB'
			AND d.kind = 'department' AND d.removed_at IS NULL AND d.code LIKE 'N%'
			AND directory.match_key(d.name) = directory.match_key(s.lad_name)
	`;
	// Northern Ireland's other lists: the district of their postcode district, when the dental
	// list's surgeries of that postcode district all name the same one (BT20 -> Ards and North
	// Down). Northern Irish postcodes cannot be located with open data.
	await tx`
		WITH districts AS (
			SELECT split_part(postcode, ' ', 1) AS district, min(lad_code) AS lad_code
			FROM gb_sites
			WHERE source = 'gb-bso-dent' AND lad_code IS NOT NULL
			GROUP BY 1
			HAVING count(DISTINCT lad_code) = 1
		)
		UPDATE gb_sites s SET lad_code = d.lad_code
		FROM districts d
		WHERE s.lad_code IS NULL AND s.postcode LIKE 'BT%' AND split_part(s.postcode, ' ', 1) = d.district
	`;
	// A local authority code the places do not know is dropped (an older vintage).
	await tx`
		UPDATE gb_sites s SET lad_code = NULL
		WHERE s.lad_code IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM directory.places d
			WHERE d.country = 'GB' AND d.kind = 'department' AND d.code = s.lad_code AND d.removed_at IS NULL
		)
	`;
	await tx`ANALYZE gb_sites`;

	// 2. The town named by the address: the post town first, then the locality lines in order.
	await tx`
		CREATE TEMP TABLE gb_site_names ON COMMIT DROP AS
		SELECT s.source, s.source_key, n.ord, directory.match_key(n.name) AS key
		FROM gb_sites s
		CROSS JOIN LATERAL unnest(ARRAY[s.city] || coalesce(s.localities, '{}'))
			WITH ORDINALITY AS n (name, ord)
		WHERE n.name IS NOT NULL AND n.name <> ''
	`;
	await tx`ANALYZE gb_site_names`;
	await tx`
		UPDATE gb_sites s SET place_id = x.place_id, placed_by = coalesce(s.placed_by, 'town')
		FROM (
			SELECT DISTINCT ON (n.source, n.source_key) n.source, n.source_key, min(p.id) AS place_id
			FROM gb_site_names n
			JOIN gb_sites s ON s.source = n.source AND s.source_key = n.source_key
			JOIN directory.places p ON p.country = 'GB' AND p.kind = 'commune' AND p.removed_at IS NULL
				AND p.department_code = s.lad_code AND directory.match_key(p.name) = n.key
			WHERE s.lad_code IS NOT NULL
			GROUP BY n.source, n.source_key, n.ord
			HAVING count(*) = 1
			ORDER BY n.source, n.source_key, n.ord
		) x
		WHERE x.source = s.source AND x.source_key = s.source_key
	`;
	// No authority (Northern Ireland, a postcode too new for Code-Point Open): the only town of
	// the nation with the name, which gives the authority.
	await tx`
		UPDATE gb_sites s SET place_id = x.place_id, lad_code = x.lad_code, placed_by = 'town'
		FROM (
			SELECT DISTINCT ON (n.source, n.source_key) n.source, n.source_key, min(p.id) AS place_id,
				min(p.department_code) AS lad_code
			FROM gb_site_names n
			JOIN gb_sites s ON s.source = n.source AND s.source_key = n.source_key
			JOIN directory.places p ON p.country = 'GB' AND p.kind = 'commune' AND p.removed_at IS NULL
				AND (p.department_code LIKE 'N%') = (s.postcode LIKE 'BT%')
				AND directory.match_key(p.name) = n.key
			WHERE s.lad_code IS NULL AND s.place_id IS NULL
			GROUP BY n.source, n.source_key, n.ord
			HAVING count(*) = 1
			ORDER BY n.source, n.source_key, n.ord
		) x
		WHERE x.source = s.source AND x.source_key = s.source_key
	`;
	// 3. The nearest town of the authority, close enough to be the one.
	await tx`
		UPDATE gb_sites s SET place_id = n.id
		FROM gb_sites s2
		CROSS JOIN LATERAL (
			SELECT p.id FROM directory.places p
			WHERE p.country = 'GB' AND p.kind = 'commune' AND p.department_code = s2.lad_code
				AND p.removed_at IS NULL AND p.centroid IS NOT NULL
				AND ST_DWithin(p.centroid, s2.location, ${NEAREST_TOWN_METRES})
			ORDER BY p.centroid <-> s2.location
			LIMIT 1
		) n
		WHERE s.source = s2.source AND s.source_key = s2.source_key
			AND s2.place_id IS NULL AND s2.location IS NOT NULL AND s2.lad_code IS NOT NULL
	`;
	// 4. The local authority itself.
	await tx`
		UPDATE gb_sites s SET place_id = d.id
		FROM directory.places d
		WHERE s.place_id IS NULL AND d.country = 'GB' AND d.kind = 'department'
			AND d.code = s.lad_code AND d.removed_at IS NULL
	`;
	// The town the site is listed in is printed after the street: not twice.
	await tx`
		UPDATE gb_sites s SET address_line = CASE
			WHEN lower(s.address_line) = lower(p.name) THEN NULL
			ELSE left(s.address_line, length(s.address_line) - length(p.name) - 2)
		END
		FROM directory.places p
		WHERE p.id = s.place_id AND p.kind = 'commune' AND s.address_line IS NOT NULL
			AND (lower(s.address_line) = lower(p.name)
				OR right(lower(s.address_line), length(p.name) + 2) = ', ' || lower(p.name))
	`;
	await tx`ANALYZE gb_sites`;
	const [counts] = await tx<
		{
			people: number;
			sites: number;
			located: number;
			placed: number;
			britishSites: number;
			inTown: number;
		}[]
	>`
		SELECT (SELECT count(*) FROM gb_people)::integer AS people,
			count(*)::integer AS sites,
			count(location)::integer AS located,
			count(place_id)::integer AS placed,
			count(*) FILTER (WHERE postcode NOT LIKE 'BT%')::integer AS "britishSites",
			count(*) FILTER (WHERE place_id IN (
				SELECT id FROM directory.places WHERE country = 'GB' AND kind = 'commune'
			))::integer AS "inTown"
		FROM gb_sites
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		located: counts?.located ?? 0,
		placed: counts?.placed ?? 0,
		britishSites: counts?.britishSites ?? 0,
		inTown: counts?.inTown ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Upserts the staged sites. A site located by its postcode is at street precision; one placed
 * by its town only (Northern Ireland) takes the town's centre, at city precision (no map pin).
 */
export async function mergeGbSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM gb_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', name, address_line, postcode, city, 'GB', place_id,
			coalesce(location, centroid),
			CASE WHEN location IS NOT NULL THEN 'street' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN location IS NOT NULL THEN 'postcode' WHEN centroid IS NOT NULL THEN 'centroid' END,
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
 * Upserts the staged practices (`country = 'GB'`): the name shown in `last_name` (and as the
 * "source" name: the published name of a practice named after a person is never stored), no
 * first name. A page's slug is set once, at creation.
 */
export async function mergeGbPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, listing_slug, slug, source_hash, source_seen_at,
			missing_runs, status
		)
		SELECT 'GB', r.id_scheme, r.national_id, '', r.name, '', r.name, r.profession_code,
			r.listing_slug, r.slug,
			md5(concat_ws('|', r.name, r.profession_code, r.listing_slug)),
			now(), 0, 'active'
		FROM gb_people r
		ON CONFLICT (country, id_scheme, national_id) DO UPDATE SET
			first_name = excluded.first_name,
			last_name = excluded.last_name,
			first_name_source = excluded.first_name_source,
			last_name_source = excluded.last_name_source,
			profession_code = excluded.profession_code,
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
 * Upserts the activities (one per practice and site) and removes those the lists no longer
 * give. Only the lists the run loaded are in scope (`schemes` for the practices, `sources` for
 * the sites): a list that failed keeps its rows, and so do the branch surgeries when their
 * report failed.
 */
export async function mergeGbActivities(
	tx: TransactionSql,
	schemes: readonly string[],
	sources: readonly string[],
) {
	await tx`
		CREATE TEMP TABLE run_gb_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id, a.is_main
		FROM gb_activities a
		JOIN directory.practitioners p ON p.country = 'GB' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_gb_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_gb_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, practice_kind, source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id)), now()
		FROM run_gb_activities r
		-- The practice's own address first: a new activity's id ranks it before the branches
		-- in the derived fields (recomputeDerived), so the page takes the practice's town.
		ORDER BY r.is_main DESC, r.source, r.source_key
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
	// The rows just written are invisible to autovacuum: without fresh statistics the planner
	// takes the activities for an empty table and loops over them per practice (#90).
	await tx`ANALYZE directory.practitioners, directory.activities`;
	const removed = await tx<{ id: number }[]>`
		UPDATE directory.activities act SET removed_at = now(), updated_at = now()
		FROM directory.practitioners p
		WHERE p.id = act.practitioner_id AND p.country = 'GB'
			AND p.id_scheme = ANY (${schemes as string[]}::text[])
			AND act.source = ANY (${sources as string[]}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_gb_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Absences of the lists loaded by the run (`schemes`): a practice missing from its list twice
 * in a row is removed (an owner-claimed page is kept and counted for review), as in France.
 */
export async function markGbMissing(tx: TransactionSql, schemes: readonly string[]) {
	const list = schemes as string[];
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'GB' AND p.missing_runs > 0 AND p.id_scheme = ANY (${list}::text[])
			AND EXISTS (
				SELECT 1 FROM gb_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'GB' AND p.status = 'active' AND p.id_scheme = ANY (${list}::text[])
			AND NOT EXISTS (
				SELECT 1 FROM gb_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'GB' AND status = 'active' AND missing_runs >= 2 AND claim_status = 'unclaimed'
			AND id_scheme = ANY (${list}::text[])
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'GB' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
