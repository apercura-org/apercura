/**
 * Set-based merge of the staged Annuaire Santé data into the directory, in one
 * transaction (so the circuit breakers can roll everything back).
 *
 * Only import-owned columns are written. Every write is guarded by a row hash
 * (`IS DISTINCT FROM`), so a second run over the same files changes nothing.
 */
import { buildAccentDictionary, formatStreetText, restoreOwnNameAccents } from "@apercura/core";
import {
	FR_AMELI_SPECIALTY_SLUGS,
	FR_PROFESSIONS,
	FR_SPECIALTIES,
	listingSlugFor,
} from "@apercura/core/taxonomy";
import type { TransactionSql } from "./lib/db";

export type MergeContext = {
	runId: number;
	professions: string[];
	department: string | null;
};

type Returned = { id: number; inserted: boolean }[];

const split = (rows: Returned) => ({
	inserted: rows.filter((row) => row.inserted).length,
	updated: rows.filter((row) => !row.inserted).length,
});

/**
 * Directory tables the merge writes: analyzed once the merge and geocoding are
 * done, before the derived fields.
 */
export const MERGED_TABLES = [
	"directory.practitioners",
	"directory.activities",
	"directory.sites",
	"directory.practitioner_qualifications",
	"directory.places",
	"directory.taxonomy_listing_slugs",
	"directory.taxonomy_ameli_specialties",
] as const;

/**
 * Tables whose filtered columns the derived fields and Ameli matching rewrite
 * (`indexable`, `is_primary`, `primary_place_id`, `removed_at`): analyzed again
 * before the read models, which select on them.
 */
export const DERIVED_TABLES = [
	"directory.practitioners",
	"directory.activities",
	"directory.sites",
] as const;

/** Read models and outbox: analyzed before the guards and totals that read them. */
export const READ_MODEL_TABLES = [
	"directory.practitioner_pages",
	"directory.landing_pages",
	"directory.search_docs",
	"directory.invalidation_outbox",
] as const;

/**
 * Refreshes the planner statistics of tables the run has just written. The
 * whole merge is one transaction, so autovacuum never sees its rows: on a fresh
 * database the tables have no statistics at all, every `IS NULL` filter is
 * estimated at 0.5% and the planner picks nested loops that never finish at
 * national scale (#90). ANALYZE inside the transaction samples the
 * transaction's own rows; its statistics become visible to other sessions at
 * COMMIT and are rolled back with the run.
 */
export async function analyzeTables(tx: TransactionSql, tables: readonly string[]) {
	await tx.unsafe(`ANALYZE ${tables.join(", ")}`);
}

/** Rewrites the taxonomy mirror tables from `@apercura/core/taxonomy`. */
export async function syncTaxonomy(tx: TransactionSql): Promise<void> {
	const listing: { profession_code: string; specialty_code: string; listing_slug: string }[] = [];
	for (const code of Object.keys(FR_PROFESSIONS)) {
		const none = listingSlugFor(code, null);
		if (none) listing.push({ profession_code: code, specialty_code: "", listing_slug: none });
		for (const specialty of Object.keys(FR_SPECIALTIES)) {
			const slug = listingSlugFor(code, specialty);
			if (slug)
				listing.push({ profession_code: code, specialty_code: specialty, listing_slug: slug });
		}
	}
	const ameli = Object.entries(FR_AMELI_SPECIALTY_SLUGS).flatMap(([code, slugs]) =>
		slugs.map((slug) => ({ ameli_code: code, listing_slug: slug })),
	);
	await tx`TRUNCATE directory.taxonomy_listing_slugs, directory.taxonomy_ameli_specialties`;
	await tx`
		INSERT INTO directory.taxonomy_listing_slugs (profession_code, specialty_code, listing_slug)
		SELECT * FROM jsonb_to_recordset(${JSON.stringify(listing)}::text::jsonb)
			AS r (profession_code text, specialty_code text, listing_slug text)
	`;
	await tx`
		INSERT INTO directory.taxonomy_ameli_specialties (ameli_code, listing_slug)
		SELECT * FROM jsonb_to_recordset(${JSON.stringify(ameli)}::text::jsonb)
			AS r (ameli_code text, listing_slug text)
	`;
}

/**
 * Resolves the commune or arrondissement of every staged structure. The
 * department is always read from `places`, never cut from a code.
 */
export async function stageSites(
	tx: TransactionSql,
): Promise<{ structures: number; resolved: number }> {
	await tx`
		CREATE TEMP TABLE run_rpps ON COMMIT DROP AS
		SELECT DISTINCT rpps FROM directory.stg_ans_activities
	`;
	await tx`ALTER TABLE run_rpps ADD PRIMARY KEY (rpps)`;
	await tx`ANALYZE run_rpps`;
	await tx`
		CREATE TEMP TABLE run_sites ON COMMIT DROP AS
		SELECT DISTINCT ON (structure_id)
			structure_id, site_name, site_kind, sector_code, legal_name, trade_name, address_line,
			address_complement, distribution, postcode, commune_code, commune_label, country_code,
			phone, phone2, fax, email, siret, siren, finess_et, finess_ej, establishment_slug,
			NULL::integer AS place_id
		FROM directory.stg_ans_activities
		WHERE structure_id IS NOT NULL
		ORDER BY structure_id, line_no
	`;
	await tx`ALTER TABLE run_sites ADD PRIMARY KEY (structure_id)`;
	await tx`ANALYZE run_sites`;

	// 1. The published commune or arrondissement code.
	await tx`
		UPDATE run_sites rs SET place_id = p.id
		FROM directory.places p
		WHERE p.kind IN ('commune', 'arrondissement') AND p.code = rs.commune_code
			AND p.removed_at IS NULL
	`;
	// 2. A whole PLM city (75056, 69123, 13055): its arrondissement by postcode.
	await tx`
		UPDATE run_sites rs SET place_id = x.child_id
		FROM (
			SELECT rs.structure_id, min(c.id) AS child_id
			FROM run_sites rs
			JOIN directory.places c ON c.parent_id = rs.place_id AND c.kind = 'arrondissement'
				AND c.postcodes @> ARRAY[rs.postcode]
			WHERE rs.postcode IS NOT NULL
			GROUP BY rs.structure_id
			HAVING count(*) = 1
		) x
		WHERE x.structure_id = rs.structure_id
	`;
	// 3. No usable code: the only arrondissement, else the only commune, of the
	//    postcode; else the commune of the postcode with the same name.
	await tx`
		UPDATE run_sites rs SET place_id = x.place_id
		FROM (
			SELECT rs.structure_id,
				CASE
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 1
						THEN min(p.id) FILTER (WHERE p.kind = 'arrondissement')
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 0 AND count(*) = 1
						THEN min(p.id)
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 0
						AND count(*) FILTER (WHERE directory.match_key(p.name) = directory.match_key(rs.commune_label)) = 1
						THEN min(p.id) FILTER (WHERE directory.match_key(p.name) = directory.match_key(rs.commune_label))
				END AS place_id
			FROM run_sites rs
			JOIN directory.places p ON p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
				AND p.postcodes @> ARRAY[rs.postcode]
			WHERE rs.place_id IS NULL AND rs.postcode IS NOT NULL
			GROUP BY rs.structure_id
		) x
		WHERE x.structure_id = rs.structure_id AND x.place_id IS NOT NULL
	`;
	const [counts] = await tx<{ structures: number; resolved: number }[]>`
		SELECT count(*)::integer AS structures, count(place_id)::integer AS resolved FROM run_sites
	`;
	return counts ?? { structures: 0, resolved: 0 };
}

/**
 * Restores the accents of the staged site names. The registry prints accented
 * letters inside the words of a place name as unaccented capitals ("Cabinet du
 * Dr HElEne Aelion") while the practitioner's own names are correctly accented
 * ("Hélène"), so the accented words of the staged first and last names and of
 * the commune names give them back ("Cabinet du Dr Hélène Aelion"). Words not
 * found keep the lowercased form of the parser ("Helene"). Runs on
 * `run_sites`, after {@link stageSites}.
 */
export async function restoreSiteNameAccents(tx: TransactionSql): Promise<{ restored: number }> {
	const names = await tx<{ name: string; weight: number }[]>`
		SELECT name, count(*)::integer AS weight FROM (
			SELECT DISTINCT rpps, first_name AS name FROM directory.stg_ans_activities
			UNION ALL
			SELECT DISTINCT rpps, last_name FROM directory.stg_ans_activities
			UNION ALL
			SELECT code, name FROM directory.places
			WHERE kind IN ('commune', 'arrondissement') AND removed_at IS NULL
		) n
		WHERE name ~ '[^ -~]'
		GROUP BY name
	`;
	const accents = buildAccentDictionary(names.map(({ name, weight }) => [name, weight] as const));
	// Only names with a capital after a lowercase letter or two capitals before one.
	const sites = await tx<{ structure_id: string; raw: string; site_name: string | null }[]>`
		SELECT structure_id, coalesce(trade_name, legal_name) AS raw, site_name
		FROM run_sites
		WHERE coalesce(trade_name, legal_name) ~ '[a-z][A-Z]|[A-Z]{2}[a-z]'
	`;
	const updates = sites.flatMap((site) => {
		const name = formatStreetText(site.raw, { accents }) || null;
		return name !== site.site_name ? [{ structure_id: site.structure_id, site_name: name }] : [];
	});
	if (updates.length === 0) return { restored: 0 };
	await tx`
		UPDATE run_sites rs SET site_name = u.site_name
		FROM jsonb_to_recordset(${JSON.stringify(updates)}::text::jsonb)
			AS u (structure_id text, site_name text)
		WHERE u.structure_id = rs.structure_id
	`;
	return { restored: updates.length };
}

/**
 * Restores the accents of the practitioners' own names in the staged site
 * names: the registry often writes the structure name without them ("Cabinet
 * du Dr Helene Aelion") on the very rows that give the practitioner's names
 * with them ("Hélène"). Only the names of the practitioners of that structure
 * count (`restoreOwnNameAccents`), so the change stays local to its rows. Runs
 * on `run_sites`, after {@link restoreSiteNameAccents}.
 */
export async function restoreOwnNameAccentsInSites(
	tx: TransactionSql,
): Promise<{ restored: number }> {
	// Sites whose name holds, without its accents, an accented word of one of their practitioners' names.
	const sites = await tx<{ structure_id: string; site_name: string; names: string[] }[]>`
		WITH site_keys AS (
			SELECT structure_id, site_name, ' ' || directory.match_key(site_name) || ' ' AS name_key
			FROM run_sites
			WHERE site_name IS NOT NULL
		),
		words AS (
			SELECT DISTINCT a.structure_id, w.word
			FROM directory.stg_ans_activities a
			CROSS JOIN LATERAL regexp_split_to_table(
				concat_ws(' ', a.first_name, a.last_name), '[[:space:]''’-]+'
			) AS w (word)
			WHERE a.structure_id IS NOT NULL
		)
		SELECT sk.structure_id, sk.site_name, array_agg(w.word) AS names
		FROM site_keys sk
		JOIN words w ON w.structure_id = sk.structure_id
		GROUP BY sk.structure_id, sk.site_name, sk.name_key
		HAVING bool_or(w.word ~ '[^ -~]' AND char_length(w.word) >= 3
			AND position(' ' || directory.match_key(w.word) || ' ' IN sk.name_key) > 0)
	`;
	const updates = sites.flatMap((site) => {
		const name = restoreOwnNameAccents(site.site_name, site.names);
		return name !== site.site_name ? [{ structure_id: site.structure_id, site_name: name }] : [];
	});
	if (updates.length === 0) return { restored: 0 };
	await tx`
		UPDATE run_sites rs SET site_name = u.site_name
		FROM jsonb_to_recordset(${JSON.stringify(updates)}::text::jsonb)
			AS u (structure_id text, site_name text)
		WHERE u.structure_id = rs.structure_id
	`;
	return { restored: updates.length };
}

/** Practitioners in scope: optional department filter, suppressions always excluded. */
export async function stageScope(tx: TransactionSql, ctx: MergeContext) {
	await tx`
		CREATE TEMP TABLE run_scope ON COMMIT DROP AS
		SELECT DISTINCT a.rpps
		FROM directory.stg_ans_activities a
		LEFT JOIN run_sites rs ON rs.structure_id = a.structure_id
		LEFT JOIN directory.places p ON p.id = rs.place_id
		WHERE (${ctx.department}::text IS NULL OR p.department_code = ${ctx.department}::text)
			AND NOT EXISTS (
				SELECT 1 FROM directory.suppressions s
				WHERE s.country = 'FR' AND s.id_scheme = 'RPPS' AND s.national_id = a.rpps
			)
	`;
	await tx`ALTER TABLE run_scope ADD PRIMARY KEY (rpps)`;
	await tx`ANALYZE run_scope`;
	const [row] = await tx<{ scope: number; suppressed: number }[]>`
		SELECT (SELECT count(*) FROM run_scope)::integer AS scope,
			(SELECT count(*) FROM run_rpps r JOIN directory.suppressions s
				ON s.country = 'FR' AND s.id_scheme = 'RPPS' AND s.national_id = r.rpps)::integer AS suppressed
	`;
	return row ?? { scope: 0, suppressed: 0 };
}

export async function mergeSites(tx: TransactionSql) {
	const rows = await tx<Returned>`
		WITH src AS (
			SELECT rs.*,
				md5(concat_ws('|', rs.address_line, rs.postcode, rs.commune_code, rs.place_id)) AS address_hash
			FROM run_sites rs
			WHERE rs.structure_id IN (
				SELECT a.structure_id FROM directory.stg_ans_activities a
				JOIN run_scope USING (rpps)
				WHERE a.structure_id IS NOT NULL
			)
		)
		INSERT INTO directory.sites AS s (
			source, source_key, kind, sector_code, name, legal_name, trade_name, address_line,
			address_complement, distribution, postcode, commune_code, commune_label, country_code,
			place_id, address_hash, phone, phone2, fax, email, siret, siren, finess_et, finess_ej,
			source_hash, source_seen_at
		)
		SELECT 'ans', structure_id, site_kind, sector_code, site_name, legal_name, trade_name,
			address_line, address_complement, distribution, postcode, commune_code, commune_label,
			country_code, place_id, address_hash, phone, phone2, fax, email, siret, siren, finess_et,
			finess_ej,
			md5(concat_ws('|', site_kind, sector_code, site_name, legal_name, trade_name, address_line,
				address_complement, distribution, postcode, commune_code, commune_label, country_code,
				place_id, phone, phone2, fax, email, siret, siren, finess_et, finess_ej)),
			now()
		FROM src
		ON CONFLICT (source, source_key) DO UPDATE SET
			kind = excluded.kind,
			sector_code = excluded.sector_code,
			name = excluded.name,
			legal_name = excluded.legal_name,
			trade_name = excluded.trade_name,
			address_line = excluded.address_line,
			address_complement = excluded.address_complement,
			distribution = excluded.distribution,
			postcode = excluded.postcode,
			commune_code = excluded.commune_code,
			commune_label = excluded.commune_label,
			country_code = excluded.country_code,
			-- Same address: keep the place, which geocoding may have refined.
			place_id = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				THEN excluded.place_id ELSE coalesce(s.place_id, excluded.place_id) END,
			location = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				AND s.geo_source IS DISTINCT FROM 'finess' THEN NULL ELSE s.location END,
			geo_precision = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				AND s.geo_source IS DISTINCT FROM 'finess' THEN NULL ELSE s.geo_precision END,
			geo_source = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				AND s.geo_source IS DISTINCT FROM 'finess' THEN NULL ELSE s.geo_source END,
			-- A new address is labelled again by the geocoding step.
			geo_label = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				THEN NULL ELSE s.geo_label END,
			geo_address_line = CASE WHEN s.address_hash IS DISTINCT FROM excluded.address_hash
				THEN NULL ELSE s.geo_address_line END,
			address_hash = excluded.address_hash,
			phone = excluded.phone,
			phone2 = excluded.phone2,
			fax = excluded.fax,
			email = excluded.email,
			siret = excluded.siret,
			siren = excluded.siren,
			finess_et = excluded.finess_et,
			finess_ej = excluded.finess_ej,
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			removed_at = NULL,
			updated_at = now()
		WHERE s.source_hash IS DISTINCT FROM excluded.source_hash OR s.removed_at IS NOT NULL
		RETURNING s.id, (xmax = 0) AS inserted
	`;
	return { ids: rows.map((row) => row.id), ...split(rows) };
}

export async function mergePractitioners(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_people ON COMMIT DROP AS
		WITH person AS (
			SELECT DISTINCT ON (a.rpps)
				a.rpps, a.national_pp_id, a.civility_code, a.title_code, a.first_name, a.last_name,
				a.first_name_source, a.last_name_source, a.profession_code, a.category_code, a.slug
			FROM directory.stg_ans_activities a
			JOIN run_scope USING (rpps)
			ORDER BY a.rpps, a.profession_code, a.line_no
		),
		activity_specialty AS (
			SELECT DISTINCT ON (a.rpps) a.rpps, a.skill_code
			FROM directory.stg_ans_activities a
			JOIN person p ON p.rpps = a.rpps AND p.profession_code = a.profession_code
			WHERE a.skill_type_code = 'S' AND a.skill_code IS NOT NULL
			GROUP BY a.rpps, a.skill_code
			ORDER BY a.rpps, count(*) DESC, a.skill_code
		),
		registry_specialty AS (
			SELECT q.rpps, min(q.code) AS code
			FROM directory.stg_ans_qualifications q
			JOIN person p ON p.rpps = q.rpps
			WHERE q.source = 'savoir_faire' AND q.type_code = 'S'
			GROUP BY q.rpps
		)
		SELECT p.*,
			coalesce(s.skill_code, r.code) AS primary_specialty_code,
			coalesce(ls.listing_slug, ls0.listing_slug) AS listing_slug
		FROM person p
		LEFT JOIN activity_specialty s ON s.rpps = p.rpps
		LEFT JOIN registry_specialty r ON r.rpps = p.rpps
		LEFT JOIN directory.taxonomy_listing_slugs ls
			ON ls.profession_code = p.profession_code AND ls.specialty_code = coalesce(s.skill_code, r.code)
		LEFT JOIN directory.taxonomy_listing_slugs ls0
			ON ls0.profession_code = p.profession_code AND ls0.specialty_code = ''
	`;
	await tx`ALTER TABLE run_people ADD PRIMARY KEY (rpps)`;
	await tx`ANALYZE run_people`;
	const rows = await tx<Returned>`
		INSERT INTO directory.practitioners AS p (
			country, id_scheme, national_id, national_pp_id, civility_code, title_code, first_name,
			last_name, first_name_source, last_name_source, profession_code, category_code,
			primary_specialty_code, listing_slug, slug, source_hash, source_seen_at, missing_runs, status
		)
		SELECT 'FR', 'RPPS', r.rpps, r.national_pp_id, r.civility_code, r.title_code, r.first_name,
			r.last_name, r.first_name_source, r.last_name_source, r.profession_code, r.category_code,
			r.primary_specialty_code, r.listing_slug, r.slug,
			md5(concat_ws('|', r.national_pp_id, r.civility_code, r.title_code, r.first_name, r.last_name,
				r.first_name_source, r.last_name_source, r.profession_code, r.category_code,
				r.primary_specialty_code, r.listing_slug)),
			now(), 0, 'active'
		FROM run_people r
		ON CONFLICT (country, id_scheme, national_id) DO UPDATE SET
			national_pp_id = excluded.national_pp_id,
			civility_code = excluded.civility_code,
			title_code = excluded.title_code,
			first_name = excluded.first_name,
			last_name = excluded.last_name,
			first_name_source = excluded.first_name_source,
			last_name_source = excluded.last_name_source,
			profession_code = excluded.profession_code,
			category_code = excluded.category_code,
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
	const unknownSpecialties = await tx<{ code: string; count: number }[]>`
		SELECT r.primary_specialty_code AS code, count(*)::integer AS count
		FROM run_people r
		LEFT JOIN directory.taxonomy_listing_slugs ls
			ON ls.profession_code = r.profession_code AND ls.specialty_code = r.primary_specialty_code
		WHERE r.primary_specialty_code IS NOT NULL AND ls.listing_slug IS NULL
		GROUP BY 1
		ORDER BY 2 DESC
	`;
	return {
		...split(rows),
		unknownSpecialties: Object.fromEntries(unknownSpecialties.map((row) => [row.code, row.count])),
	};
}

export async function mergeActivities(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_activities ON COMMIT DROP AS
		SELECT DISTINCT ON (a.activity_key)
			a.activity_key, p.id AS practitioner_id, s.id AS site_id, a.mode_code, a.role_code,
			a.sector_code, a.genre_code, a.skill_type_code, a.skill_code, a.registration_authority,
			a.practice_kind
		FROM directory.stg_ans_activities a
		JOIN run_scope USING (rpps)
		JOIN directory.practitioners p
			ON p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = a.rpps
		LEFT JOIN directory.sites s ON s.source = 'ans' AND s.source_key = a.structure_id
		WHERE a.activity_key IS NOT NULL
		ORDER BY a.activity_key, a.line_no
	`;
	await tx`ALTER TABLE run_activities ADD PRIMARY KEY (activity_key)`;
	await tx`ANALYZE run_activities`;
	const rows = await tx<Returned>`
		INSERT INTO directory.activities AS act (
			practitioner_id, site_id, source, source_key, mode_code, role_code, sector_code, genre_code,
			skill_type_code, skill_code, registration_authority, practice_kind, source_hash,
			source_seen_at
		)
		SELECT r.practitioner_id, r.site_id, 'ans', r.activity_key, r.mode_code, r.role_code,
			r.sector_code, r.genre_code, r.skill_type_code, r.skill_code, r.registration_authority,
			r.practice_kind,
			md5(concat_ws('|', r.practitioner_id, r.site_id, r.mode_code, r.role_code, r.sector_code,
				r.genre_code, r.skill_type_code, r.skill_code, r.registration_authority, r.practice_kind)),
			now()
		FROM run_activities r
		ON CONFLICT (source, source_key) DO UPDATE SET
			site_id = excluded.site_id,
			mode_code = excluded.mode_code,
			role_code = excluded.role_code,
			sector_code = excluded.sector_code,
			genre_code = excluded.genre_code,
			skill_type_code = excluded.skill_type_code,
			skill_code = excluded.skill_code,
			registration_authority = excluded.registration_authority,
			practice_kind = excluded.practice_kind,
			source_hash = excluded.source_hash,
			source_seen_at = excluded.source_seen_at,
			removed_at = NULL,
			updated_at = now()
		WHERE act.source_hash IS DISTINCT FROM excluded.source_hash OR act.removed_at IS NOT NULL
		RETURNING act.id, (xmax = 0) AS inserted
	`;
	await tx`
		CREATE TEMP TABLE run_scope_ids ON COMMIT DROP AS
		SELECT p.id FROM directory.practitioners p
		JOIN run_scope s ON p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = s.rpps
	`;
	await tx`ALTER TABLE run_scope_ids ADD PRIMARY KEY (id)`;
	await tx`ANALYZE run_scope_ids`;
	const removed = await tx<{ id: number }[]>`
		UPDATE directory.activities act SET removed_at = now(), updated_at = now()
		WHERE act.practitioner_id IN (SELECT id FROM run_scope_ids)
			AND act.source = 'ans' AND act.removed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM run_activities r WHERE r.activity_key = act.source_key)
		RETURNING act.id
	`;
	return { ...split(rows), removed: removed.length };
}

export async function mergeQualifications(tx: TransactionSql) {
	await tx`
		CREATE TEMP TABLE run_quals ON COMMIT DROP AS
		SELECT DISTINCT ON (practitioner_id, source, type_code, code)
			practitioner_id, source, type_code, code, label
		FROM (
			SELECT p.id AS practitioner_id, q.source, q.type_code, q.code, q.label
			FROM directory.stg_ans_qualifications q
			JOIN run_scope USING (rpps)
			JOIN directory.practitioners p
				ON p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = q.rpps
			UNION ALL
			SELECT p.id, 'savoir_faire', a.skill_type_code, a.skill_code, a.skill_label
			FROM directory.stg_ans_activities a
			JOIN run_scope USING (rpps)
			JOIN directory.practitioners p
				ON p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = a.rpps
			WHERE a.skill_type_code IS NOT NULL AND a.skill_code IS NOT NULL
		) x
		ORDER BY practitioner_id, source, type_code, code, label
	`;
	await tx`ANALYZE run_quals`;
	await tx`
		CREATE TEMP TABLE run_qual_changes ON COMMIT DROP AS
		SELECT p.id AS practitioner_id, h.hash
		FROM directory.practitioners p
		JOIN run_scope_ids s ON s.id = p.id
		LEFT JOIN (
			SELECT practitioner_id,
				md5(string_agg(concat_ws('|', source, type_code, code, label), ',' ORDER BY source, type_code, code)) AS hash
			FROM run_quals
			GROUP BY practitioner_id
		) h ON h.practitioner_id = p.id
		WHERE p.qualifications_hash IS DISTINCT FROM h.hash
	`;
	await tx`ANALYZE run_qual_changes`;
	await tx`
		DELETE FROM directory.practitioner_qualifications q
		USING run_qual_changes c
		WHERE q.practitioner_id = c.practitioner_id
	`;
	const inserted = await tx`
		INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
		SELECT q.practitioner_id, q.source, q.type_code, q.code, q.label
		FROM run_quals q
		JOIN run_qual_changes c ON c.practitioner_id = q.practitioner_id
	`;
	const changed = await tx`
		UPDATE directory.practitioners p SET qualifications_hash = c.hash, updated_at = now()
		FROM run_qual_changes c
		WHERE p.id = c.practitioner_id
	`;
	return { practitionersChanged: changed.count, rows: inserted.count };
}

/** Absence handling: removed after two consecutive runs without the person. */
export async function markMissing(tx: TransactionSql, ctx: MergeContext) {
	await tx`
		UPDATE directory.practitioners p SET missing_runs = 0, updated_at = now()
		WHERE p.missing_runs > 0 AND p.country = 'FR' AND p.id_scheme = 'RPPS'
			AND EXISTS (SELECT 1 FROM run_rpps r WHERE r.rpps = p.national_id)
	`;
	const missing = await tx`
		UPDATE directory.practitioners p SET missing_runs = p.missing_runs + 1, updated_at = now()
		WHERE p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.status = 'active'
			AND p.profession_code = ANY (${ctx.professions}::text[])
			AND NOT EXISTS (SELECT 1 FROM run_rpps r WHERE r.rpps = p.national_id)
	`;
	const removed = await tx`
		UPDATE directory.practitioners SET status = 'removed', removed_at = now(), indexable = false,
			updated_at = now()
		WHERE status = 'active' AND missing_runs >= 2 AND claim_status = 'unclaimed'
	`;
	const [review] = await tx<{ count: number }[]>`
		SELECT count(*)::integer AS count FROM directory.practitioners
		WHERE status = 'active' AND missing_runs >= 2 AND claim_status <> 'unclaimed'
	`;
	return {
		missing: missing.count,
		removed: removed.count,
		claimedNeedingReview: review?.count ?? 0,
	};
}

export type SuppressionPurge = {
	deleted: number;
	kept: number;
	sites: number;
	objects: number;
	tags: string[];
};

/**
 * Suppressions (GDPR objections) always win, on every run. Their lines never reach staging
 * (`SuppressedLines`); what is still stored about a suppressed practitioner (a suppression added
 * by hand, or confirmed while this run was loading, or a row no longer held by an agenda or an
 * owner) is deleted by the same function as the app's (migration 0023), and its cache tags are
 * queued. A row whose suppression was withdrawn is active again: the merge refills it.
 */
export async function applySuppressions(tx: TransactionSql, runId: number) {
	const [row] = await tx<{ purge: SuppressionPurge }[]>`
		SELECT directory.purge_suppressed_practitioners(NULL) AS purge
	`;
	const purge = row?.purge ?? { deleted: 0, kept: 0, sites: 0, objects: 0, tags: [] };
	const [queued] = purge.tags.length
		? await tx<{ tags: number }[]>`
				SELECT directory.enqueue_tags(${runId}, ${purge.tags}::text[]) AS tags
			`
		: [];
	const lifted = await tx`
		UPDATE directory.practitioners p SET status = 'active', updated_at = now()
		WHERE p.status = 'suppressed' AND NOT EXISTS (
			SELECT 1 FROM directory.suppressions s
			WHERE s.country = p.country AND s.id_scheme = p.id_scheme AND s.national_id = p.national_id
		)
	`;
	return {
		deleted: purge.deleted,
		kept: purge.kept,
		sites: purge.sites,
		objects: purge.objects,
		tags: queued?.tags ?? 0,
		lifted: lifted.count,
	};
}

/** FINESS+ enrichment: official name, category and WGS84 coordinates of open establishments. */
export async function enrichFromFiness(tx: TransactionSql) {
	const [{ staged } = { staged: 0 }] = await tx<{ staged: number }[]>`
		SELECT count(*)::integer AS staged FROM directory.stg_finess
	`;
	if (staged === 0) return { staged, updated: 0, closed: 0, slugs: 0, skipped: true };
	await tx`
		CREATE TEMP TABLE run_finess ON COMMIT DROP AS
		SELECT DISTINCT ON (finess_et) * FROM directory.stg_finess ORDER BY finess_et
	`;
	await tx`ALTER TABLE run_finess ADD PRIMARY KEY (finess_et)`;
	await tx`ANALYZE run_finess`;
	const updated = await tx<{ id: number }[]>`
		UPDATE directory.sites s SET
			finess_name = f.name,
			finess_category_code = f.category_code,
			location = CASE WHEN f.latitude IS NULL THEN s.location ELSE
				ST_SetSRID(ST_MakePoint(f.longitude::float8, f.latitude::float8), 4326)::geography END,
			geo_precision = CASE WHEN f.latitude IS NULL THEN s.geo_precision ELSE 'address' END,
			geo_source = CASE WHEN f.latitude IS NULL THEN s.geo_source ELSE 'finess' END,
			updated_at = now()
		FROM run_finess f
		WHERE s.finess_et = f.finess_et AND s.source = 'ans' AND s.removed_at IS NULL
			AND (
				s.finess_name IS DISTINCT FROM f.name
				OR s.finess_category_code IS DISTINCT FROM f.category_code
				OR (f.latitude IS NOT NULL AND (
					s.geo_source IS DISTINCT FROM 'finess'
					OR round(ST_Y(s.location::geometry)::numeric, 6) IS DISTINCT FROM round(f.latitude::numeric, 6)
					OR round(ST_X(s.location::geometry)::numeric, 6) IS DISTINCT FROM round(f.longitude::numeric, 6)
				))
			)
		RETURNING s.id
	`;
	const closed = await tx<{ id: number }[]>`
		UPDATE directory.sites s SET
			finess_name = NULL,
			finess_category_code = NULL,
			location = CASE WHEN s.geo_source = 'finess' THEN NULL ELSE s.location END,
			geo_precision = CASE WHEN s.geo_source = 'finess' THEN NULL ELSE s.geo_precision END,
			geo_source = CASE WHEN s.geo_source = 'finess' THEN NULL ELSE s.geo_source END,
			updated_at = now()
		WHERE s.source = 'ans' AND s.finess_et IS NOT NULL
			AND (s.finess_name IS NOT NULL OR s.geo_source = 'finess')
			AND NOT EXISTS (SELECT 1 FROM run_finess f WHERE f.finess_et = s.finess_et)
		RETURNING s.id
	`;
	const slugs = await tx`
		WITH candidates AS (
			SELECT DISTINCT ON (s.finess_et) s.id, coalesce(f.slug, rs.establishment_slug) AS slug
			FROM directory.sites s
			LEFT JOIN run_finess f ON f.finess_et = s.finess_et
			LEFT JOIN run_sites rs ON rs.structure_id = s.source_key
			WHERE s.source = 'ans' AND s.finess_et IS NOT NULL AND s.slug IS NULL AND s.removed_at IS NULL
				AND NOT EXISTS (SELECT 1 FROM directory.sites o WHERE o.finess_et = s.finess_et AND o.slug IS NOT NULL)
			ORDER BY s.finess_et, s.id
		)
		UPDATE directory.sites s SET slug = c.slug, updated_at = now()
		FROM candidates c
		WHERE s.id = c.id AND c.slug IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM directory.sites o WHERE o.slug = c.slug)
	`;
	return {
		staged,
		updated: updated.length,
		closed: closed.length,
		slugs: slugs.count,
		skipped: false,
		ids: [...updated.map((row) => row.id), ...closed.map((row) => row.id)],
	};
}

export type GeocodeCandidate = {
	id: number;
	addressLine: string | null;
	postcode: string | null;
	placeCode: string | null;
	/** Codes a geocoder result may land in (the place, its arrondissements, or the postcode's communes). */
	allowedCodes: string[];
	hasCentroid: boolean;
	/** Has coordinates already: only its label is refreshed. */
	located: boolean;
	geoLabel: string | null;
	geoAddressLine: string | null;
};

/**
 * Every registry site in the directory: those without coordinates (new or
 * moved, and not located by FINESS) to locate, and all of them to label with
 * the geocoder's street name (see `siteLabel`).
 */
export async function sitesToGeocode(tx: TransactionSql): Promise<GeocodeCandidate[]> {
	return tx<GeocodeCandidate[]>`
		SELECT s.id, s.address_line AS "addressLine", s.postcode, p.code AS "placeCode",
			(s.location IS NOT NULL) AS located, s.geo_label AS "geoLabel",
			s.geo_address_line AS "geoAddressLine",
			CASE
				WHEN s.location IS NOT NULL THEN '{}'
				WHEN p.id IS NOT NULL THEN
					ARRAY[p.code] || coalesce((SELECT array_agg(c.code) FROM directory.places c
						WHERE c.parent_id = p.id AND c.kind = 'arrondissement'), '{}')
				WHEN s.postcode IS NOT NULL THEN
					coalesce((SELECT array_agg(c.code) FROM directory.places c
						WHERE c.kind IN ('commune', 'arrondissement') AND c.postcodes @> ARRAY[s.postcode]), '{}')
				ELSE '{}'
			END AS "allowedCodes",
			(p.centroid IS NOT NULL) AS "hasCentroid"
		FROM directory.sites s
		LEFT JOIN directory.places p ON p.id = s.place_id
		WHERE s.source = 'ans' AND s.removed_at IS NULL
		ORDER BY s.id
	`;
}

export type SiteLabelUpdate = {
	id: number;
	geoLabel: string | null;
	geoAddressLine: string | null;
};

/** Writes the geocoder labels of sites, set-based; returns the sites that changed. */
export async function applySiteLabels(tx: TransactionSql, labels: SiteLabelUpdate[]) {
	if (labels.length === 0) return [];
	const rows = await tx<{ id: number }[]>`
		UPDATE directory.sites s SET
			geo_label = l.geo_label,
			geo_address_line = l.geo_address_line,
			updated_at = now()
		FROM unnest(
			${labels.map((l) => l.id)}::integer[],
			${labels.map((l) => l.geoLabel)}::text[],
			${labels.map((l) => l.geoAddressLine)}::text[]
		) AS l (id, geo_label, geo_address_line)
		WHERE s.id = l.id AND (s.geo_label IS DISTINCT FROM l.geo_label
			OR s.geo_address_line IS DISTINCT FROM l.geo_address_line)
		RETURNING s.id
	`;
	return rows.map((row) => row.id);
}

export type SiteLocation = {
	id: number;
	latitude: number | null;
	longitude: number | null;
	precision: string;
	source: "geocoder" | "centroid";
	placeCode: string | null;
};

/** Writes geocoder results (or the commune centroid) to sites, set-based. */
export async function applySiteLocations(tx: TransactionSql, locations: SiteLocation[]) {
	if (locations.length === 0) return { geocoded: 0, centroid: 0, placesRefined: 0 };
	const located = await tx<{ source: string; refined: boolean }[]>`
		WITH input AS (
			SELECT * FROM unnest(
				${locations.map((l) => l.id)}::integer[],
				${locations.map((l) => l.latitude)}::float8[],
				${locations.map((l) => l.longitude)}::float8[],
				${locations.map((l) => l.precision)}::text[],
				${locations.map((l) => l.source)}::text[],
				${locations.map((l) => l.placeCode)}::text[]
			) AS t (id, latitude, longitude, precision, source, place_code)
		),
		resolved AS (
			SELECT i.*, coalesce(np.id, s.place_id) AS place_id, (np.id IS NOT NULL AND np.id <> s.place_id) OR
				(np.id IS NOT NULL AND s.place_id IS NULL) AS refined
			FROM input i
			JOIN directory.sites s ON s.id = i.id
			LEFT JOIN directory.places np ON np.kind IN ('commune', 'arrondissement') AND np.code = i.place_code
				AND np.removed_at IS NULL
		)
		UPDATE directory.sites s SET
			location = CASE WHEN r.source = 'centroid' THEN p.centroid ELSE
				ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography END,
			geo_precision = r.precision,
			geo_source = r.source,
			place_id = r.place_id,
			updated_at = now()
		FROM resolved r
		LEFT JOIN directory.places p ON p.id = r.place_id
		WHERE s.id = r.id AND (r.source <> 'centroid' OR p.centroid IS NOT NULL)
		RETURNING r.source, r.refined
	`;
	return {
		geocoded: located.filter((row) => row.source === "geocoder").length,
		centroid: located.filter((row) => row.source === "centroid").length,
		placesRefined: located.filter((row) => row.refined).length,
	};
}

/**
 * Ameli matches from `ameli_candidates` (practitioner_id, group_id) and
 * `ameli_groups`. Unique both ways: each group matches one practitioner, and
 * every group a practitioner matches is unique to them and carries the same
 * values. Hash aggregates and joins only (no correlated subquery), so it stays
 * linear at national scale.
 */
export const AMELI_MATCHES_QUERY = `
	WITH shared_groups AS (
		SELECT group_id FROM ameli_candidates
		GROUP BY group_id
		HAVING count(DISTINCT practitioner_id) > 1
	)
	SELECT c.practitioner_id,
		min(g.billing_sector) AS billing_sector, min(g.optam) AS optam,
		bool_or(g.carte_vitale) AS carte_vitale, bool_or(g.apcv) AS apcv
	FROM ameli_candidates c
	JOIN ameli_groups g ON g.group_id = c.group_id
	LEFT JOIN shared_groups sg ON sg.group_id = c.group_id
	GROUP BY c.practitioner_id
	HAVING bool_and(sg.group_id IS NULL)
		AND count(DISTINCT (coalesce(g.billing_sector, ''), coalesce(g.optam, ''), g.carte_vitale, g.apcv)) = 1
`;

/** Builds the `ameli_matches` temp table (see `AMELI_MATCHES_QUERY`). */
export async function buildAmeliMatches(tx: TransactionSql) {
	await tx.unsafe(`CREATE TEMP TABLE ameli_matches ON COMMIT DROP AS ${AMELI_MATCHES_QUERY}`);
	await tx`ALTER TABLE ameli_matches ADD PRIMARY KEY (practitioner_id)`;
	await tx`ANALYZE ameli_matches`;
}

/** Strict Ameli matching: unique 1:1 on names + commune + compatible specialty. */
export async function matchAmeli(tx: TransactionSql) {
	const [{ staged } = { staged: 0 }] = await tx<{ staged: number }[]>`
		SELECT count(*)::integer AS staged FROM directory.stg_ameli
	`;
	if (staged === 0)
		return {
			staged,
			resolvedRows: 0,
			groups: 0,
			matched: 0,
			updated: 0,
			cleared: 0,
			skipped: true,
		};
	await tx`
		CREATE TEMP TABLE run_ameli ON COMMIT DROP AS
		SELECT a.line_no,
			directory.match_key(a.last_name) AS last_key,
			directory.match_key(a.first_name) AS first_key,
			a.specialty_code, a.postcode,
			directory.match_key(regexp_replace(coalesce(a.city, ''), '\\s+CEDEX.*$', '', 'i')) AS city_key,
			(a.carte_vitale = 'true') AS carte_vitale,
			(a.apcv = 'true') AS apcv,
			a.billing_sector,
			CASE a.option_code WHEN '3' THEN 'optam' WHEN '4' THEN 'optam_aco' END AS optam,
			NULL::integer AS place_id
		FROM directory.stg_ameli a
	`;
	await tx`ALTER TABLE run_ameli ADD PRIMARY KEY (line_no)`;
	await tx`ANALYZE run_ameli`;
	await tx`
		UPDATE run_ameli ra SET place_id = x.place_id
		FROM (
			SELECT ra.line_no,
				CASE
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 1
						THEN min(p.id) FILTER (WHERE p.kind = 'arrondissement')
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 0 AND count(*) = 1
						THEN min(p.id)
					WHEN count(*) FILTER (WHERE p.kind = 'arrondissement') = 0
						AND count(*) FILTER (WHERE directory.match_key(p.name) = ra.city_key) = 1
						THEN min(p.id) FILTER (WHERE directory.match_key(p.name) = ra.city_key)
				END AS place_id
			FROM run_ameli ra
			JOIN directory.places p ON p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
				AND p.postcodes @> ARRAY[ra.postcode]
			GROUP BY ra.line_no
		) x
		WHERE x.line_no = ra.line_no AND x.place_id IS NOT NULL
	`;
	// One group per (names, commune, specialty); groups whose rows disagree are dropped.
	await tx`
		CREATE TEMP TABLE ameli_groups ON COMMIT DROP AS
		SELECT row_number() OVER (ORDER BY last_key, first_key, place_id, specialty_code) AS group_id,
			last_key, first_key, place_id, specialty_code,
			min(billing_sector) AS billing_sector, min(optam) AS optam,
			bool_or(carte_vitale) AS carte_vitale, bool_or(apcv) AS apcv
		FROM run_ameli
		WHERE place_id IS NOT NULL AND last_key <> '' AND first_key <> ''
		GROUP BY last_key, first_key, place_id, specialty_code
		HAVING count(DISTINCT (coalesce(billing_sector, ''), coalesce(optam, ''), carte_vitale, apcv)) = 1
	`;
	await tx`ALTER TABLE ameli_groups ADD PRIMARY KEY (group_id)`;
	await tx`CREATE INDEX ON ameli_groups (last_key, first_key, place_id)`;
	await tx`ANALYZE ameli_groups`;
	await tx`
		CREATE TEMP TABLE ameli_people ON COMMIT DROP AS
		SELECT DISTINCT p.id AS practitioner_id, p.listing_slug,
			directory.match_key(p.last_name_source) AS last_key,
			directory.match_key(p.first_name_source) AS first_key,
			s.place_id
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
		WHERE p.status = 'active' AND p.listing_slug IS NOT NULL
	`;
	await tx`CREATE INDEX ON ameli_people (last_key, first_key, place_id)`;
	await tx`ANALYZE ameli_people`;
	await tx`
		CREATE TEMP TABLE ameli_candidates ON COMMIT DROP AS
		SELECT DISTINCT ap.practitioner_id, g.group_id
		FROM ameli_people ap
		JOIN ameli_groups g ON g.last_key = ap.last_key AND g.first_key = ap.first_key
			AND g.place_id = ap.place_id
		JOIN directory.taxonomy_ameli_specialties t
			ON t.ameli_code = g.specialty_code AND t.listing_slug = ap.listing_slug
	`;
	await tx`ANALYZE ameli_candidates`;
	await buildAmeliMatches(tx);
	const updated = await tx`
		UPDATE directory.practitioners p SET
			billing_sector = m.billing_sector,
			optam = m.optam,
			carte_vitale = m.carte_vitale,
			apcv = m.apcv,
			ameli_matched_at = now(),
			updated_at = now()
		FROM ameli_matches m
		WHERE p.id = m.practitioner_id AND (
			p.ameli_matched_at IS NULL
			OR p.billing_sector IS DISTINCT FROM m.billing_sector
			OR p.optam IS DISTINCT FROM m.optam
			OR p.carte_vitale IS DISTINCT FROM m.carte_vitale
			OR p.apcv IS DISTINCT FROM m.apcv
		)
	`;
	const cleared = await tx`
		UPDATE directory.practitioners p SET
			billing_sector = NULL, optam = NULL, carte_vitale = NULL, apcv = NULL,
			ameli_matched_at = NULL, updated_at = now()
		WHERE p.ameli_matched_at IS NOT NULL
			AND NOT EXISTS (SELECT 1 FROM ameli_matches m WHERE m.practitioner_id = p.id)
	`;
	const [counts] = await tx<{ resolved: number; groups: number; matched: number }[]>`
		SELECT (SELECT count(*) FROM run_ameli WHERE place_id IS NOT NULL)::integer AS resolved,
			(SELECT count(*) FROM ameli_groups)::integer AS groups,
			(SELECT count(*) FROM ameli_matches)::integer AS matched
	`;
	return {
		staged,
		resolvedRows: counts?.resolved ?? 0,
		groups: counts?.groups ?? 0,
		matched: counts?.matched ?? 0,
		updated: updated.count,
		cleared: cleared.count,
		skipped: false,
	};
}

/** Primary activity, primary place, switchboard phones, orphan sites and `indexable`. */
export async function recomputeDerived(tx: TransactionSql, ctx: MergeContext) {
	await tx`
		WITH ranked AS (
			SELECT a.id, row_number() OVER (
				PARTITION BY a.practitioner_id
				-- A place attached to a commune first: the primary place gives the page its
				-- commune (breadcrumb, ring of neighbours, title), and an office without one
				-- must not hide a hospital that has one.
				ORDER BY (a.site_id IS NULL), (s.place_id IS NULL OR s.removed_at IS NOT NULL),
					CASE a.practice_kind WHEN 'office' THEN 0 WHEN 'health_center' THEN 1
						WHEN 'hospital' THEN 2 WHEN 'locum' THEN 3 ELSE 4 END,
					(a.mode_code = 'L') DESC NULLS LAST,
					a.id
			) AS rank
			FROM directory.activities a
			LEFT JOIN directory.sites s ON s.id = a.site_id
			WHERE a.removed_at IS NULL AND NOT a.hidden
		)
		UPDATE directory.activities a SET is_primary = (r.rank = 1), updated_at = now()
		FROM ranked r
		WHERE a.id = r.id AND a.is_primary IS DISTINCT FROM (r.rank = 1)
	`;
	await tx`
		UPDATE directory.activities SET is_primary = false, updated_at = now()
		WHERE is_primary AND (removed_at IS NOT NULL OR hidden)
	`;
	// Joins only, no per-practitioner subquery (#90). At most one primary
	// activity per practitioner remains after the two statements above.
	await tx`
		WITH primary_site AS (
			SELECT DISTINCT ON (a.practitioner_id) a.practitioner_id, s.place_id
			FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			WHERE a.is_primary
			ORDER BY a.practitioner_id, a.id
		),
		primary_place AS (
			SELECT p.id, ps.place_id
			FROM directory.practitioners p
			LEFT JOIN primary_site ps ON ps.practitioner_id = p.id
		)
		UPDATE directory.practitioners p SET primary_place_id = pp.place_id, updated_at = now()
		FROM primary_place pp
		WHERE p.id = pp.id AND p.primary_place_id IS DISTINCT FROM pp.place_id
	`;
	const removedSites = await tx<{ id: number }[]>`
		UPDATE directory.sites s SET removed_at = now(), updated_at = now()
		WHERE s.source = 'ans' AND s.removed_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM directory.activities a WHERE a.site_id = s.id AND a.removed_at IS NULL)
		RETURNING s.id
	`;
	await tx`
		WITH counts AS (
			SELECT s.phone, count(DISTINCT a.practitioner_id) AS practitioners
			FROM directory.sites s
			JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL
			WHERE s.phone IS NOT NULL AND s.removed_at IS NULL
			GROUP BY s.phone
		)
		UPDATE directory.sites s
		SET phone_kind = CASE WHEN c.practitioners >= 10 THEN 'switchboard' ELSE 'direct' END,
			updated_at = now()
		FROM counts c
		WHERE s.phone = c.phone
			AND s.phone_kind IS DISTINCT FROM (CASE WHEN c.practitioners >= 10 THEN 'switchboard' ELSE 'direct' END)
	`;
	// Joins only: subqueries in a select list stay per-row subplans (#90).
	const indexable = await tx`
		WITH placed AS (
			SELECT DISTINCT a.practitioner_id
			FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
			WHERE a.removed_at IS NULL AND NOT a.hidden
				AND a.practice_kind IN ('office', 'health_center', 'hospital')
		),
		computed AS (
			SELECT p.id, (
				p.status = 'active'
				-- Withheld by the app while a removal request is checked: stays hidden.
				AND p.withheld_at IS NULL
				AND p.profession_code = ANY (${ctx.professions}::text[])
				-- Not suppressed (at most one row: suppressions are unique per national id).
				AND x.national_id IS NULL
				-- At least one patient-facing place in a commune.
				AND pl.practitioner_id IS NOT NULL
			) AS indexable
			FROM directory.practitioners p
			LEFT JOIN directory.suppressions x
				ON x.country = p.country AND x.id_scheme = p.id_scheme AND x.national_id = p.national_id
			LEFT JOIN placed pl ON pl.practitioner_id = p.id
		)
		UPDATE directory.practitioners p SET indexable = c.indexable, updated_at = now()
		FROM computed c
		WHERE p.id = c.id AND p.indexable IS DISTINCT FROM c.indexable
	`;
	return { removedSites: removedSites.map((row) => row.id), indexableChanged: indexable.count };
}

export async function enqueueSiteTags(tx: TransactionSql, runId: number, ids: number[]) {
	if (ids.length === 0) return 0;
	const [row] = await tx<{ tags: number }[]>`
		SELECT directory.enqueue_tags(${runId}, array_agg(DISTINCT 'site:' || id)) AS tags
		FROM unnest(${ids}::integer[]) AS id
	`;
	return row?.tags ?? 0;
}

export type PageRefresh = {
	total: number;
	indexable: number;
	previousTotal: number;
	previousIndexable: number;
	inserted: number;
	updated: number;
	deleted: number;
	unpublished: number;
	tags: number;
};

export async function refreshReadModels(tx: TransactionSql, runId: number) {
	const [pages] = await tx<{ result: PageRefresh }[]>`
		SELECT directory.refresh_practitioner_pages(${runId}) AS result
	`;
	const [landing] = await tx<{ result: Record<string, number> }[]>`
		SELECT directory.refresh_landing_pages(${runId}) AS result
	`;
	const [search] = await tx<{ result: Record<string, number> }[]>`
		SELECT directory.refresh_search_docs() AS result
	`;
	if (!pages || !landing || !search) throw new Error("Read model refresh returned nothing");
	return { pages: pages.result, landing: landing.result, search: search.result };
}

/**
 * Indexable practitioners listed on no listing page (see `checkOrphans`): no
 * landing page for their listing slug in the commune of any of their
 * patient-facing places. Call after refreshing the read models.
 *
 * Set-based: the practitioners that are listed somewhere come from one join,
 * then an anti-join keeps the others. A correlated `NOT EXISTS` whose join
 * condition reads `p.listing_slug` cannot be pulled up into an anti-join and
 * ran as a subplan per practitioner, with a scan of `landing_pages` inside
 * (#90).
 */
export const ORPHANED_PAGES_QUERY = `
	WITH listed AS (
		SELECT DISTINCT p.id
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			AND NOT a.hidden AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
		JOIN directory.landing_pages lp ON lp.listing_slug = p.listing_slug
			AND lp.place_id = s.place_id
		WHERE p.indexable
	)
	SELECT count(*)::integer AS count, (array_agg(p.slug ORDER BY p.id))[1:10] AS examples
	FROM directory.practitioners p
	LEFT JOIN listed l ON l.id = p.id
	WHERE p.indexable AND l.id IS NULL
`;

export async function orphanedPages(
	tx: TransactionSql,
): Promise<{ count: number; examples: string[] }> {
	const [row] =
		await tx.unsafe<{ count: number; examples: string[] | null }[]>(ORPHANED_PAGES_QUERY);
	return { count: row?.count ?? 0, examples: row?.examples ?? [] };
}

/** A few pages this run would unpublish, for the blocked-run summary (call before refreshing). */
export async function unpublishedExamples(tx: TransactionSql): Promise<string[]> {
	const rows = await tx<{ slug: string }[]>`
		SELECT p.slug FROM directory.practitioner_pages pg
		JOIN directory.practitioners p ON p.id = pg.practitioner_id
		WHERE pg.indexable AND (NOT p.indexable OR p.status <> 'active')
		ORDER BY pg.practitioner_id
		LIMIT 10
	`;
	return rows.map((row) => row.slug);
}
