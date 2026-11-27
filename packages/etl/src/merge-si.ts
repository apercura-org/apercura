/**
 * Merge of the insurer's parsed lists into the shared directory schema (`country = 'SI'`), in
 * the import's one transaction.
 *
 * The rows of the lists are first grouped here, in memory (about 2,900 doctors): one person per
 * insurer's doctor number, one site per practice (the provider at its address), one activity per
 * doctor, practice and ZZZS activity, carrying whether the doctor still takes new patients (the
 * list's `DA` or `NE`, `mode_code`) and the activity's code (`skill_code`, and `sector_code`,
 * which the page's read model carries). The SQL then upserts them set-based, guarded by row
 * hashes, so a second run over the same files changes nothing.
 */
import { createHash } from "node:crypto";
import { SI_ID_SCHEME, siPractitionerSlug } from "@apercura/core";
import {
	primarySiProfession,
	SI_ACTIVITIES,
	siListingSlugFor,
	siProfessionOfActivity,
} from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";
import type { SiLocatorIndex, SiPlacedBy } from "./sources/si/locate";
import { foldLabel, splitDoctorName } from "./sources/si/names";
import { SI_LIST_SOURCE, SI_SITE_SOURCE, type SiParseResult, type SiRow } from "./sources/si/types";

export type SiPerson = {
	national_id: string;
	first_name: string;
	last_name: string;
	first_name_source: string;
	last_name_source: string;
	profession_code: string;
	primary_specialty_code: string | null;
	listing_slug: string | null;
	slug: string;
};

export type SiSite = {
	source_key: string;
	name: string;
	kind: "office" | "health_center" | "hospital";
	address_line: string | null;
	postcode: string | null;
	/** The post office (`Škofja vas`): the address's town line, never the municipality. */
	post_office: string | null;
	municipality: string | null;
	longitude: number | null;
	latitude: number | null;
	placed_by: SiPlacedBy | null;
};

export type SiActivity = {
	source: string;
	source_key: string;
	national_id: string;
	site_key: string;
	activity_code: string;
	acceptance: "accepting" | "closed" | null;
	practice_kind: SiSite["kind"];
};

export type SiBatch = {
	people: SiPerson[];
	sites: SiSite[];
	activities: SiActivity[];
	/** Practices the locator could not place, by postcode (`unknown` without one). */
	unplaced: Record<string, number>;
	/** How the practices were placed. */
	placedBy: Record<string, number>;
};

/**
 * The kind of a practice, from its provider's name: a health centre (zdravstveni dom), a hospital
 * (bolnišnica, a university medical centre), else a practice of its own.
 */
export function siPracticeKind(providerName: string): SiSite["kind"] {
	const name = foldLabel(providerName);
	if (/\bbolnisnic|\bklinicni center\b|\bukc\b|\bonkoloski institut\b/.test(name))
		return "hospital";
	if (/\bzdravstveni dom\b|^zd\b/.test(name)) return "health_center";
	return "office";
}

/** The key of a practice: its provider and a short hash of its address, as the list gives them. */
export function siSiteKey(row: Pick<SiRow, "providerCode" | "street" | "postcode">): string {
	const hash = createHash("sha256")
		.update(`${foldLabel(row.street ?? "")}|${row.postcode ?? ""}`)
		.digest("hex")
		.slice(0, 8);
	return `${row.providerCode}-${hash}`;
}

/** The order rows are read in: the lists' order, then their lines. */
const LIST_ORDER = Object.keys(SI_LIST_SOURCE);

/**
 * Groups the parsed rows of the lists into people, sites and activities. A doctor's names come
 * from their first row; their kind from `primarySiProfession`, their specialty from the activity
 * of that kind they have most rows of. Each practice is located once (`SiLocatorIndex`), its
 * provider's name and street written with the register's and the lists' proper names.
 */
export function buildSiBatch(results: readonly SiParseResult[], locator: SiLocatorIndex): SiBatch {
	const rows = results
		.flatMap((result) => result.rows)
		.sort(
			(a, b) => LIST_ORDER.indexOf(a.source) - LIST_ORDER.indexOf(b.source) || a.lineNo - b.lineNo,
		);
	const byPerson = new Map<string, SiRow[]>();
	for (const row of rows) {
		const list = byPerson.get(row.nationalId) ?? [];
		list.push(row);
		byPerson.set(row.nationalId, list);
	}
	// The doctors' names are proper names wherever a provider's name holds them.
	const names = new Map<string, { firstName: string; lastName: string }>();
	for (const [id, own] of byPerson) {
		const name = splitDoctorName(own[0]?.nameSource ?? "");
		names.set(id, name);
		locator.learn(`${name.firstName} ${name.lastName}`);
	}

	const people: SiPerson[] = [];
	const sites = new Map<string, SiSite>();
	const activities = new Map<string, SiActivity>();
	const unplaced: Record<string, number> = {};
	const placedBy: Record<string, number> = {};
	for (const [id, own] of byPerson) {
		const first = own[0];
		const name = names.get(id);
		if (!first || !name) continue;
		const profession = primarySiProfession(own);
		if (!profession) continue;
		const counts = new Map<string, number>();
		for (const row of own) {
			if (siProfessionOfActivity(row.activityCode) === profession) {
				counts.set(row.activityCode, (counts.get(row.activityCode) ?? 0) + 1);
			}
		}
		const specialty =
			[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
		people.push({
			national_id: id,
			first_name: name.firstName,
			last_name: name.lastName,
			// The source's own fields, in its capitals: family names, then given names.
			first_name_source: name.firstName.toLocaleUpperCase("sl"),
			last_name_source: name.lastName.toLocaleUpperCase("sl"),
			profession_code: profession,
			primary_specialty_code: specialty,
			listing_slug: siListingSlugFor(profession, specialty),
			slug: siPractitionerSlug(name.firstName, name.lastName, id),
		});
		for (const row of own) {
			const siteKey = siSiteKey(row);
			let site = sites.get(siteKey);
			if (!site) {
				const location = locator.locate(row);
				const kind = siPracticeKind(row.providerName);
				if (location) placedBy[location.by] = (placedBy[location.by] ?? 0) + 1;
				else unplaced[row.postcode ?? "unknown"] = (unplaced[row.postcode ?? "unknown"] ?? 0) + 1;
				site = {
					source_key: siteKey,
					name: locator.caseText(row.providerName) ?? row.providerName,
					kind,
					address_line: location?.street ?? locator.caseText(row.street),
					postcode: row.postcode,
					post_office: location?.postOffice ?? locator.caseText(row.postOffice),
					municipality: location?.municipality ?? null,
					longitude: location?.longitude ?? null,
					latitude: location?.latitude ?? null,
					placed_by: location?.by ?? null,
				};
				sites.set(siteKey, site);
			}
			const activityKey = `${id}@${siteKey}:${row.activityCode}`;
			if (!activities.has(activityKey) && SI_ACTIVITIES[row.activityCode]) {
				activities.set(activityKey, {
					source: SI_LIST_SOURCE[row.source],
					source_key: activityKey,
					national_id: id,
					site_key: siteKey,
					activity_code: row.activityCode,
					acceptance: row.acceptance,
					practice_kind: site.kind,
				});
			}
		}
	}
	return {
		people,
		sites: [...sites.values()],
		activities: [...activities.values()],
		unplaced,
		placedBy,
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

const PEOPLE_COLUMNS = `national_id text, first_name text, last_name text, first_name_source text,
	last_name_source text, profession_code text, primary_specialty_code text, listing_slug text,
	slug text`;
const SITE_COLUMNS = `source_key text, name text, kind text, address_line text, postcode text,
	post_office text, municipality text, longitude double precision, latitude double precision,
	placed_by text`;
const ACTIVITY_COLUMNS = `source text, source_key text, national_id text, site_key text,
	activity_code text, acceptance text, practice_kind text`;

/**
 * Stages the batch in temporary tables, drops suppressed doctors (GDPR objections always win)
 * and resolves each practice's municipality by its register code.
 */
export async function stageSi(tx: TransactionSql, batch: SiBatch) {
	await tx.unsafe(`CREATE TEMP TABLE si_people (${PEOPLE_COLUMNS}) ON COMMIT DROP`);
	await tx.unsafe(
		`CREATE TEMP TABLE si_sites (${SITE_COLUMNS}, location geography(Point, 4326), place_id integer) ON COMMIT DROP`,
	);
	await tx.unsafe(`CREATE TEMP TABLE si_activities (${ACTIVITY_COLUMNS}) ON COMMIT DROP`);
	await insertJson(tx, "si_people", PEOPLE_COLUMNS, batch.people);
	await insertJson(
		tx,
		"si_sites (source_key, name, kind, address_line, postcode, post_office, municipality, longitude, latitude, placed_by)",
		SITE_COLUMNS,
		batch.sites,
	);
	await insertJson(tx, "si_activities", ACTIVITY_COLUMNS, batch.activities);
	await tx`ALTER TABLE si_people ADD PRIMARY KEY (national_id)`;
	await tx`ALTER TABLE si_sites ADD PRIMARY KEY (source_key)`;
	await tx`ALTER TABLE si_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE si_people, si_sites, si_activities`;

	const suppressed = await tx`
		DELETE FROM si_people r
		USING directory.suppressions s
		WHERE s.country = 'SI' AND s.id_scheme = ${SI_ID_SCHEME} AND s.national_id = r.national_id
	`;
	await tx`
		DELETE FROM si_activities a
		WHERE NOT EXISTS (SELECT 1 FROM si_people p WHERE p.national_id = a.national_id)
	`;
	await tx`
		DELETE FROM si_sites s
		WHERE NOT EXISTS (SELECT 1 FROM si_activities a WHERE a.site_key = s.source_key)
	`;
	await tx`
		UPDATE si_sites SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
		WHERE longitude IS NOT NULL AND latitude IS NOT NULL
	`;
	await tx`
		UPDATE si_sites s SET place_id = p.id
		FROM directory.places p
		WHERE p.country = 'SI' AND p.kind = 'commune' AND p.code = s.municipality
			AND p.removed_at IS NULL
	`;
	await tx`ANALYZE si_sites`;
	const [counts] = await tx<{ people: number; sites: number; located: number; placed: number }[]>`
		SELECT (SELECT count(*) FROM si_people)::integer AS people,
			count(*)::integer AS sites,
			count(location)::integer AS located,
			count(place_id)::integer AS placed
		FROM si_sites
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

/**
 * Upserts the staged practices. Every one is at its settlement's point (`city` precision: the
 * register's street or settlement, never the building), with the post office as its town line
 * (`commune_label`) and its municipality as its place.
 */
export async function mergeSiSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT s.*, p.centroid,
				md5(concat_ws('|', s.address_line, s.postcode, s.post_office, s.place_id,
					ST_AsText(s.location::geometry))) AS address_hash
			FROM si_sites s
			LEFT JOIN directory.places p ON p.id = s.place_id
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, name, address_line, postcode, commune_label, country_code,
			place_id, location, geo_precision, geo_source, address_hash, source_hash, source_seen_at
		)
		SELECT ${SI_SITE_SOURCE}, source_key, kind, name, address_line, postcode, post_office, 'SI',
			place_id, coalesce(location, centroid),
			CASE WHEN coalesce(location, centroid) IS NOT NULL THEN 'city' END,
			-- The register's street or settlement, else the municipality's seat: never the building.
			CASE WHEN coalesce(location, centroid) IS NOT NULL THEN 'centroid' END,
			address_hash,
			md5(concat_ws('|', kind, name, address_line, postcode, post_office, place_id, address_hash)),
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
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			removed_at = NULL,
			updated_at = now()
		WHERE s.source_hash IS DISTINCT FROM excluded.source_hash OR s.removed_at IS NOT NULL
		RETURNING s.id, (xmax = 0) AS inserted
	`;
	return { ids: rows.map((row) => row.id), ...split(rows) };
}

/** Upserts the staged doctors (`country = 'SI'`); a page's slug is set once, at creation. */
export async function mergeSiPractitioners(tx: TransactionSql) {
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, first_name, last_name, first_name_source,
			last_name_source, profession_code, primary_specialty_code, listing_slug, slug, source_hash,
			source_seen_at, missing_runs, status
		)
		SELECT 'SI', ${SI_ID_SCHEME}, r.national_id, r.first_name, r.last_name, r.first_name_source,
			r.last_name_source, r.profession_code, r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.first_name, r.last_name, r.first_name_source, r.last_name_source,
				r.profession_code, r.primary_specialty_code, r.listing_slug)),
			now(), 0, 'active'
		FROM si_people r
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
 * Upserts the activities (one per doctor, practice and ZZZS activity, with whether the doctor
 * takes new patients) and removes those of the lists loaded by the run (`sources`, the
 * activities' sources) that the lists no longer give: a list that failed keeps its rows.
 */
export async function mergeSiActivities(tx: TransactionSql, sources: readonly string[]) {
	await tx`
		CREATE TEMP TABLE run_si_activities ON COMMIT DROP AS
		SELECT a.source, a.source_key, p.id AS practitioner_id, s.id AS site_id, a.activity_code,
			a.acceptance, a.practice_kind
		FROM si_activities a
		JOIN directory.practitioners p ON p.country = 'SI' AND p.id_scheme = ${SI_ID_SCHEME}
			AND p.national_id = a.national_id
		LEFT JOIN directory.sites s ON s.source = ${SI_SITE_SOURCE} AND s.source_key = a.site_key
	`;
	await tx`ALTER TABLE run_si_activities ADD PRIMARY KEY (source, source_key)`;
	await tx`ANALYZE run_si_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, mode_code, sector_code, skill_type_code,
			skill_code, practice_kind, source_hash, source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, r.source, r.source_key, r.acceptance, r.activity_code,
			'ZZZS', r.activity_code, r.practice_kind,
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.activity_code, r.acceptance,
				r.practice_kind)),
			now()
		FROM run_si_activities r
		ON CONFLICT (source, source_key) DO UPDATE SET
			site_id = excluded.site_id,
			mode_code = excluded.mode_code,
			sector_code = excluded.sector_code,
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
		WHERE p.id = act.practitioner_id AND p.country = 'SI'
			AND act.source = ANY (${sources as string[]}::text[]) AND act.removed_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM run_si_activities r WHERE r.source = act.source AND r.source_key = act.source_key
			)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

/**
 * Absences of the lists loaded by the run (`sources`): a doctor no loaded list gives, and with no
 * practice left from a list the run did not load, is counted missing; missing twice in a row, the
 * page is removed (an owner-claimed page is kept and counted for review), as in France.
 */
export async function markSiMissing(tx: TransactionSql, sources: readonly string[]) {
	const list = sources as string[];
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.country = 'SI' AND p.missing_runs > 0
			AND EXISTS (SELECT 1 FROM si_people r WHERE r.national_id = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'SI' AND p.status = 'active' AND p.id_scheme = ${SI_ID_SCHEME}
			AND NOT EXISTS (SELECT 1 FROM si_people r WHERE r.national_id = p.national_id)
			AND NOT EXISTS (
				SELECT 1 FROM directory.activities a
				WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND a.source LIKE 'si-zzzs-%'
					AND NOT (a.source = ANY (${list}::text[]))
			)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE country = 'SI' AND status = 'active' AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE country = 'SI' AND status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}
