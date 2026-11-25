/**
 * Merge of the parsed Austrian lists into the shared directory schema
 * (`country = 'AT'`), in the import's one transaction.
 *
 * The rows of every list are first grouped here, in memory (a few thousand
 * doctors per list): one person per (identifier scheme, key), one site per
 * practice location, one activity per person and location, one qualification
 * per specialty. The SQL then upserts them set-based, guarded by row hashes,
 * so a second run over the same files changes nothing.
 */
import { atPractitionerSlug } from "@apercura/core";
import { atListingSlugFor, primaryAtSpecialty } from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { AtPractice, ParseResult } from "./sources/at/types";

export type AtPerson = {
	id_scheme: string;
	national_id: string;
	title_code: string | null;
	civility_code: string | null;
	first_name: string;
	last_name: string;
	first_name_source: string;
	last_name_source: string;
	profession_code: string;
	primary_specialty_code: string | null;
	listing_slug: string | null;
	slug: string;
};

export type AtSite = {
	source: string;
	source_key: string;
	name: string | null;
	address_line: string | null;
	postcode: string | null;
	city: string | null;
	state_code: string;
	district: number | null;
	phone: string | null;
	x: number | null;
	y: number | null;
	srid: number | null;
};

export type AtActivity = {
	source: string;
	source_key: string;
	id_scheme: string;
	national_id: string;
	site_key: string;
	skill_code: string | null;
};

export type AtQualification = {
	id_scheme: string;
	national_id: string;
	code: string;
	label: string | null;
};

export type AtBatch = {
	people: AtPerson[];
	sites: AtSite[];
	activities: AtActivity[];
	qualifications: AtQualification[];
	/** Specialty labels the taxonomy does not know, with their row counts. */
	unknownSpecialties: Record<string, number>;
	/** Rows dropped because two different names gave one derived key (Salzburg). */
	keyCollisions: number;
};

const personKey = (row: Pick<AtPractice, "idScheme" | "nationalId">) =>
	`${row.idScheme}:${row.nationalId}`;

/**
 * Groups the parsed rows of the lists into people, sites, activities and
 * qualifications. The person's names come from their main practice's row (the
 * first one otherwise); their listing from `primaryAtSpecialty`.
 */
export function buildAtBatch(results: readonly ParseResult[]): AtBatch {
	const rowsByPerson = new Map<string, AtPractice[]>();
	const nameOfKey = new Map<string, string>();
	const unknownSpecialties: Record<string, number> = {};
	let keyCollisions = 0;
	for (const result of results) {
		for (const row of result.rows) {
			const key = personKey(row);
			const name = `${row.lastNameSource}|${row.firstNameSource}`.toLowerCase();
			const known = nameOfKey.get(key);
			if (known !== undefined && known !== name) {
				// A list numbers its people (Vienna, Styria): one number, one name. A derived
				// key (Salzburg) can collide: the second name is left out and counted.
				if (row.idScheme === "AT-SBG" || row.idScheme === "AT-SBGZ") {
					keyCollisions++;
					continue;
				}
			}
			nameOfKey.set(key, known ?? name);
			if (row.specialty.kind === "unknown") {
				unknownSpecialties[row.specialty.key] = (unknownSpecialties[row.specialty.key] ?? 0) + 1;
			}
			const rows = rowsByPerson.get(key) ?? [];
			rows.push(row);
			rowsByPerson.set(key, rows);
		}
	}

	const people: AtPerson[] = [];
	const sites = new Map<string, AtSite>();
	const activities = new Map<string, AtActivity>();
	const qualifications: AtQualification[] = [];
	for (const rows of rowsByPerson.values()) {
		const ordered = [...rows].sort(
			(a, b) => Number(b.main) - Number(a.main) || a.lineNo - b.lineNo,
		);
		const first = ordered[0];
		if (!first) continue;
		const codes = ordered.map((row) =>
			row.specialty.kind === "specialty" ? row.specialty.code : null,
		);
		const primary = primaryAtSpecialty(codes);
		people.push({
			id_scheme: first.idScheme,
			national_id: first.nationalId,
			title_code: first.titleCode,
			civility_code: first.civilityCode,
			first_name: first.firstName,
			last_name: first.lastName,
			first_name_source: first.firstNameSource,
			last_name_source: first.lastNameSource,
			profession_code: first.professionCode,
			primary_specialty_code: primary,
			listing_slug: atListingSlugFor(first.professionCode, primary),
			slug: atPractitionerSlug(first.firstName, first.lastName, first.idScheme, first.nationalId),
		});
		const seenCodes = new Set<string>();
		for (const row of ordered) {
			const code =
				row.specialty.kind === "specialty"
					? row.specialty.code
					: row.specialty.kind === "unknown"
						? row.specialty.key
						: null;
			if (code && !seenCodes.has(code)) {
				seenCodes.add(code);
				qualifications.push({
					id_scheme: row.idScheme,
					national_id: row.nationalId,
					code,
					label: row.specialtyRaw,
				});
			}
			const siteKey = `${row.source}:${row.siteKey}`;
			if (!sites.has(siteKey)) {
				sites.set(siteKey, {
					source: row.source,
					source_key: row.siteKey,
					name: row.siteName,
					address_line: row.street,
					postcode: row.postcode,
					city: row.city,
					state_code: row.stateCode,
					district: row.viennaDistrict,
					phone: row.phone,
					x: row.point?.x ?? null,
					y: row.point?.y ?? null,
					srid: row.point?.srid ?? null,
				});
			}
			const activityKey = `${personKey(row)}@${row.siteKey}`;
			const rowCode = row.specialty.kind === "specialty" ? row.specialty.code : null;
			const existing = activities.get(activityKey);
			if (!existing) {
				activities.set(activityKey, {
					source: row.source,
					source_key: activityKey,
					id_scheme: row.idScheme,
					national_id: row.nationalId,
					site_key: row.siteKey,
					skill_code: rowCode,
				});
			} else if (rowCode && rowCode === primary) {
				// Several specialties at one practice: the activity names the primary one.
				existing.skill_code = rowCode;
			}
		}
	}
	return {
		people,
		sites: [...sites.values()],
		activities: [...activities.values()],
		qualifications,
		unknownSpecialties,
		keyCollisions,
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

const PEOPLE_COLUMNS = `id_scheme text, national_id text, title_code text, civility_code text,
	first_name text, last_name text, first_name_source text, last_name_source text,
	profession_code text, primary_specialty_code text, listing_slug text, slug text`;
const SITE_COLUMNS = `source text, source_key text, name text, address_line text, postcode text,
	city text, state_code text, district integer, phone text, x double precision,
	y double precision, srid integer`;
const ACTIVITY_COLUMNS = `source text, source_key text, id_scheme text, national_id text,
	site_key text, skill_code text`;
const QUALIFICATION_COLUMNS = "id_scheme text, national_id text, code text, label text";

/**
 * Stages the batch in temporary tables, drops suppressed people (GDPR
 * objections always win), locates the sites (source coordinates, transformed
 * to WGS 84) and resolves their places:
 * 1. Vienna: the district of the address;
 * 2. elsewhere: the only Gemeinde of the Bundesland with the address's town
 *    name, else the Gemeinde whose centre is nearest to the practice.
 */
export async function stageAt(tx: TransactionSql, batch: AtBatch) {
	await tx.unsafe(`CREATE TEMP TABLE at_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE at_sites (${SITE_COLUMNS}, location geography(Point, 4326), place_id integer) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE at_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(`CREATE TEMP TABLE at_quals (${QUALIFICATION_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "at_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"at_sites (source, source_key, name, address_line, postcode, city, state_code, district, phone, x, y, srid)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "at_activities", ACTIVITY_COLUMNS, batch.activities);
	await insertJson(tx, "at_quals", QUALIFICATION_COLUMNS, batch.qualifications);
	await tx`ALTER TABLE at_people ADD PRIMARY KEY (id_scheme, national_id)`;
	await tx`ALTER TABLE at_sites ADD PRIMARY KEY (source, source_key)`;
	await tx`ALTER TABLE at_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE at_people, at_sites, at_activities, at_quals`;

	const suppressed = await tx`
		DELETE FROM at_people r
		USING directory.suppressions s
		WHERE s.country = 'AT' AND s.id_scheme = r.id_scheme AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM at_activities a
		WHERE NOT EXISTS (
			SELECT 1 FROM at_people p WHERE p.id_scheme = a.id_scheme AND p.national_id = a.national_id
		)
	`;
	await tx`
		DELETE FROM at_quals q
		WHERE NOT EXISTS (
			SELECT 1 FROM at_people p WHERE p.id_scheme = q.id_scheme AND p.national_id = q.national_id
		)
	`;
	await tx`
		DELETE FROM at_sites s
		WHERE NOT EXISTS (
			SELECT 1 FROM at_activities a WHERE a.source = s.source AND a.site_key = s.source_key
		)
	`;

	await tx`
		UPDATE at_sites SET location =
			ST_Transform(ST_SetSRID(ST_MakePoint(x, y), srid), 4326)::geography
		WHERE x IS NOT NULL AND y IS NOT NULL AND srid IS NOT NULL
	`;
	await tx`
		UPDATE at_sites s SET place_id = p.id
		FROM directory.places p
		WHERE s.district IS NOT NULL AND p.country = 'AT' AND p.kind = 'arrondissement'
			AND p.code = '9' || lpad(s.district::text, 2, '0') || '01' AND p.removed_at IS NULL
	`;
	await tx`
		UPDATE at_sites s SET place_id = x.place_id
		FROM (
			SELECT s.source, s.source_key, min(p.id) AS place_id
			FROM at_sites s
			JOIN directory.places p ON p.country = 'AT' AND p.kind = 'commune'
				AND p.department_code = s.state_code AND p.removed_at IS NULL
				AND directory.match_key(p.name) = directory.match_key(s.city)
			WHERE s.place_id IS NULL AND s.city IS NOT NULL
			GROUP BY s.source, s.source_key
			HAVING count(*) = 1
		) x
		WHERE x.source = s.source AND x.source_key = s.source_key
	`;
	await tx`
		UPDATE at_sites s SET place_id = n.id
		FROM at_sites s2
		CROSS JOIN LATERAL (
			SELECT p.id FROM directory.places p
			WHERE p.country = 'AT' AND p.kind = 'commune' AND p.department_code = s2.state_code
				AND p.removed_at IS NULL AND p.centroid IS NOT NULL
			ORDER BY p.centroid <-> s2.location
			LIMIT 1
		) n
		WHERE s.source = s2.source AND s.source_key = s2.source_key
			AND s2.place_id IS NULL AND s2.location IS NOT NULL
	`;
	await tx`ANALYZE at_sites`;
	const [counts] = await tx<
		{ people: number; sites: number; located: number; placed: number; byName: number }[]
	>`
		SELECT (SELECT count(*) FROM at_people)::integer AS people,
			count(*)::integer AS sites,
			count(location)::integer AS located,
			count(place_id)::integer AS placed,
			0 AS "byName"
		FROM at_sites
	`;
	return {
		people: counts?.people ?? 0,
		sites: counts?.sites ?? 0,
		located: counts?.located ?? 0,
		placed: counts?.placed ?? 0,
		suppressed: suppressed.count,
	};
}

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/** Upserts the staged sites; a new location or address re-places the site. */
export async function mergeAtSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.city, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM at_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, phone, source_hash,
			source_seen_at
		)
		SELECT source, source_key, 'office', name, address_line, postcode, city, 'AT', place_id,
			coalesce(location, centroid),
			CASE WHEN location IS NOT NULL THEN 'address' WHEN centroid IS NOT NULL THEN 'city' END,
			CASE WHEN location IS NOT NULL THEN 'source' WHEN centroid IS NOT NULL THEN 'centroid' END,
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

/** Upserts the staged people (`country = 'AT'`); a page's slug is set once, at creation. */
export async function mergeAtPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, civility_code, title_code, first_name, last_name,
			first_name_source, last_name_source, profession_code, primary_specialty_code,
			listing_slug, slug, source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'AT', r.id_scheme, r.national_id, r.civility_code, r.title_code, r.first_name,
			r.last_name, r.first_name_source, r.last_name_source, r.profession_code,
			r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.civility_code, r.title_code, r.first_name, r.last_name,
				r.first_name_source, r.last_name_source, r.profession_code, r.primary_specialty_code,
				r.listing_slug)),
			now(), 0, 'active'
		FROM at_people r
		ON CONFLICT (country, id_scheme, national_id) DO UPDATE SET
			civility_code = excluded.civility_code,
			title_code = excluded.title_code,
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
 * Upserts the activities (one per person and practice) and removes those of
 * the run's people that the lists no longer give. Only the lists loaded by the
 * run (`schemes`) are in scope: a list that failed keeps its rows.
 */
export async function mergeAtActivities(tx: TransactionSql, schemes: readonly string[]) {
	await tx`
		CREATE TEMP TABLE run_at_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id, a.skill_code
		FROM at_activities a
		JOIN directory.practitioners p ON p.country = 'AT' AND p.id_scheme = a.id_scheme
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = a.source AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_at_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_at_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, skill_type_code, skill_code, practice_kind,
			source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key,
			CASE WHEN r.skill_code IS NULL THEN NULL ELSE 'S' END, r.skill_code, 'office',
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.skill_code)), now()
		FROM run_at_activities r
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
	const removed = await tx<{ id: number }[]>`
		UPDATE directory.activities act SET removed_at = now(), updated_at = now()
		FROM directory.practitioners p
		WHERE p.id = act.practitioner_id AND p.country = 'AT'
			AND p.id_scheme = ANY (${schemes as string[]}::text[])
			AND act.source LIKE 'at-%' AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_at_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/** Replaces the specialties of the people whose set changed (hash compare, as in France). */
export async function mergeAtQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_at_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (p.id, q.code) p.id AS practitioner_id, q.code, q.label
		FROM at_quals q
		JOIN directory.practitioners p ON p.country = 'AT' AND p.id_scheme = q.id_scheme
			AND p.national_id = q.national_id
		ORDER BY p.id, q.code, q.label
	`;
	await tx`ANALYZE run_at_quals`;
	await tx`
		CREATE TEMP TABLE run_at_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN at_people r ON p.country = 'AT' AND p.id_scheme = r.id_scheme AND p.national_id = r.national_id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', 'fach', 'S', code, label), ',' ORDER BY code)) AS hash
			FROM run_at_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_at_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_at_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, 'fach', 'S', q.code, q.label
		FROM run_at_quals q
		JOIN run_at_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_at_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/**
 * Absences of the lists loaded by the run (`schemes`): a person missing from
 * their list twice in a row is removed (an owner-claimed page is kept and
 * counted for review), as in France.
 */
export async function markAtMissing(tx: TransactionSql, schemes: readonly string[]) {
	const list = schemes as string[];
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'AT' AND p.missing_runs > 0 AND p.id_scheme = ANY (${list}::text[])
			AND EXISTS (
				SELECT 1 FROM at_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'AT' AND p.status = 'active' AND p.id_scheme = ANY (${list}::text[])
			AND NOT EXISTS (
				SELECT 1 FROM at_people r WHERE r.id_scheme = p.id_scheme AND r.national_id = p.national_id
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'AT' AND status = 'active' AND missing_runs >= 2 AND claim_status = 'unclaimed'
			AND id_scheme = ANY (${list}::text[])
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'AT' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
