import "server-only";

import { label } from "~/lib/practitioner-view";
import { getSql } from "../db";

/**
 * Search queries. Search is dynamic and never cached as a page: these run on
 * each request (`/recherche`, tRPC suggestions). Rankings are deterministic
 * (similarity, then name, then id; or distance, then id) and never paid.
 */

/*
 * Names match with the trigram operator `<%` (served by the GIN index on
 * `search_docs.name_norm`): word similarity at or above
 * `pg_trgm.word_similarity_threshold` (0.6 by default), which accepts
 * prefixes ("dubo" for "Dubois") but not distant spellings.
 */

export type PractitionerSuggestion = {
	id: number;
	slug: string;
	titleCode: string | null;
	civilityCode: string | null;
	firstName: string;
	lastName: string;
	listingSlug: string | null;
	placeName: string | null;
};

/** Indexable practitioners whose normalized name contains the query's words. */
export async function suggestPractitioners(
	query: string,
	limit = 6,
): Promise<PractitionerSuggestion[]> {
	return getSql()<PractitionerSuggestion[]>`
		WITH q AS (SELECT directory.text_norm(${query}) AS v)
		SELECT sd.practitioner_id AS id, sd.payload->>'slug' AS slug,
			sd.payload->>'titleCode' AS "titleCode", sd.payload->>'civilityCode' AS "civilityCode",
			sd.payload->>'firstName' AS "firstName", sd.payload->>'lastName' AS "lastName",
			sd.listing_slug AS "listingSlug", sd.payload->'site'->>'placeName' AS "placeName"
		FROM directory.search_docs sd, q
		WHERE sd.indexable AND q.v <% sd.name_norm
		ORDER BY word_similarity(q.v, sd.name_norm) DESC, sd.name_norm, sd.practitioner_id
		LIMIT ${limit}
	`;
}

export type PlaceSuggestion = {
	id: number;
	kind: "department" | "commune" | "arrondissement";
	code: string;
	name: string;
	slug: string;
	departmentCode: string | null;
	departmentName: string | null;
	departmentSlug: string | null;
	population: number | null;
};

const placeColumns = (alias: string) => `
	${alias}.id, ${alias}.kind, ${alias}.code, ${alias}.name, ${alias}.slug,
	${alias}.department_code AS "departmentCode", d.name AS "departmentName",
	d.slug AS "departmentSlug", ${alias}.population
`;

/**
 * Places for "Où ?": names starting with the query first, then by word
 * similarity, then by population, so the largest homonym comes first. A
 * leading number is also matched against postcodes.
 */
export async function suggestPlaces(query: string, limit = 8): Promise<PlaceSuggestion[]> {
	const sql = getSql();
	return sql<PlaceSuggestion[]>`
		WITH q AS (SELECT directory.text_norm(${query}) AS v)
		SELECT ${sql.unsafe(placeColumns("p"))}
		FROM directory.places p
		CROSS JOIN q
		LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
		WHERE p.kind IN ('commune', 'arrondissement', 'department') AND p.removed_at IS NULL
			AND (
				q.v <% directory.text_norm(p.name)
				OR (q.v ~ '^[0-9]{2,5}$' AND EXISTS (
					SELECT 1 FROM unnest(p.postcodes) AS pc WHERE pc LIKE q.v || '%'))
			)
		ORDER BY (directory.text_norm(p.name) LIKE q.v || '%') DESC,
			word_similarity(q.v, directory.text_norm(p.name)) DESC,
			p.population DESC NULLS LAST, p.id
		LIMIT ${limit}
	`;
}

/**
 * Places a "Où ?" text names exactly: a postcode, or a name (optionally
 * narrowed by a department code). Several rows mean homonyms.
 */
export async function matchPlaces(input: {
	where: string;
	postcode?: string;
	departmentHint?: string;
}): Promise<PlaceSuggestion[]> {
	const sql = getSql();
	const hint = input.departmentHint ?? null;
	if (input.postcode) {
		// The arrondissement of a Paris/Lyon/Marseille postcode, else its communes.
		return sql<PlaceSuggestion[]>`
			SELECT ${sql.unsafe(placeColumns("p"))}
			FROM directory.places p
			LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
			WHERE p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
				AND p.postcodes @> ARRAY[${input.postcode}]::text[]
				AND NOT (p.kind = 'commune' AND EXISTS (
					SELECT 1 FROM directory.places a
					WHERE a.parent_id = p.id AND a.kind = 'arrondissement'
						AND a.postcodes @> ARRAY[${input.postcode}]::text[]))
			ORDER BY p.population DESC NULLS LAST, p.id
			LIMIT 10
		`;
	}
	const rows = await sql<PlaceSuggestion[]>`
		SELECT ${sql.unsafe(placeColumns("p"))}
		FROM directory.places p
		LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
		WHERE p.kind IN ('commune', 'arrondissement', 'department') AND p.removed_at IS NULL
			AND directory.text_norm(p.name) = directory.text_norm(${input.where})
			AND (${hint}::text IS NULL OR p.department_code = ${hint}::text OR p.code = ${hint}::text)
		ORDER BY p.population DESC NULLS LAST, p.id
		LIMIT 10
	`;
	// "Paris" names both a commune and its department: keep the commune, whose
	// pages are the department's anyway.
	const communes = rows.filter((row) => row.kind !== "department");
	return communes.length > 0 ? communes : rows;
}

export type LandingTarget = { listingSlug: string; deptSlug: string; communeSlug?: string };

/**
 * The listing page of a listing slug in a place, when it exists. The Paris
 * commune's listings are its department pages.
 */
export async function landingTarget(
	listingSlug: string,
	place: PlaceSuggestion,
): Promise<LandingTarget | null> {
	if (!place.departmentSlug) return null;
	const sql = getSql();
	const isParis = place.kind === "commune" && place.code === "75056";
	let placeId = place.id;
	if (isParis || place.kind === "department") {
		const [department] = await sql<{ id: number }[]>`
			SELECT id FROM directory.places WHERE kind = 'department' AND code = ${place.departmentCode}
		`;
		if (!department) return null;
		placeId = department.id;
	}
	const [row] = await sql<{ key: string }[]>`
		SELECT key FROM directory.landing_pages WHERE key = ${`${listingSlug}:${placeId}`}
	`;
	if (!row) return null;
	return isParis || place.kind === "department"
		? { listingSlug, deptSlug: place.departmentSlug }
		: { listingSlug, deptSlug: place.departmentSlug, communeSlug: place.slug };
}

/** True when the France-wide hub of a listing slug exists. */
export async function listingHubExists(listingSlug: string): Promise<boolean> {
	const [row] = await getSql()<{ key: string }[]>`
		SELECT key FROM directory.landing_pages WHERE key = ${`${listingSlug}:fr`}
	`;
	return Boolean(row);
}

/** Canonical page slug of an RPPS number, when the practitioner has a public page. */
export async function practitionerSlugByRpps(rpps: string): Promise<string | null> {
	const [row] = await getSql()<{ slug: string }[]>`
		SELECT pg.slug
		FROM directory.practitioners p
		JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
		WHERE p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = ${rpps}
	`;
	return row?.slug ?? null;
}

export type SearchResult = PractitionerSuggestion & {
	practiceKind: string | null;
	/** The place shown is inside the searched place (always, when one was given). */
	inPlace: boolean;
	siteName: string | null;
	/** E.164 phone of the place shown, when the registry publishes one. */
	phone: string | null;
	/** `switchboard` when the number is shared by many practitioners. */
	phoneKind: string | null;
	/** Establishment page of the place shown (FINESS establishments only). */
	establishmentSlug: string | null;
	addressLine: string | null;
	postcode: string | null;
	lat: number | null;
	lon: number | null;
	/** Metres from the "near me" point, when searching near the visitor. */
	distance: number | null;
};

export const SEARCH_PAGE_SIZE = 20;

/**
 * One page of results. Filters combine: a name (trigram), a listing slug, a
 * place (any of the practitioner's places, its arrondissement's city or its
 * department). Ordered by distance near a point, else by name similarity,
 * else alphabetically. Returns one extra row to tell whether a next page exists.
 */
export async function searchPractitioners(input: {
	name?: string;
	listingSlug?: string;
	placeId?: number;
	near?: { lat: number; lon: number };
	page: number;
}): Promise<{ results: SearchResult[]; hasNext: boolean }> {
	const sql = getSql();
	const name = input.name?.trim() || null;
	const listingSlug = input.listingSlug ?? null;
	const placeId = input.placeId ?? null;
	const point = input.near
		? sql`ST_SetSRID(ST_MakePoint(${input.near.lon}, ${input.near.lat}), 4326)::geography`
		: null;
	const order = point
		? sql`sd.location <-> ${point}, sd.practitioner_id`
		: name
			? sql`word_similarity(directory.text_norm(${name}), sd.name_norm) DESC, sd.name_norm, sd.practitioner_id`
			: sql`sd.name_norm, sd.practitioner_id`;
	const offset = (input.page - 1) * SEARCH_PAGE_SIZE;
	const rows = await sql<SearchResult[]>`
		SELECT sd.practitioner_id AS id, sd.payload->>'slug' AS slug,
			sd.payload->>'titleCode' AS "titleCode", sd.payload->>'civilityCode' AS "civilityCode",
			sd.payload->>'firstName' AS "firstName", sd.payload->>'lastName' AS "lastName",
			sd.listing_slug AS "listingSlug",
			shown.place_name AS "placeName", shown.practice_kind AS "practiceKind",
			coalesce(local.found, false) AS "inPlace",
			shown.name AS "siteName", shown.address_line AS "addressLine", shown.postcode,
			shown.phone, shown.phone_kind AS "phoneKind", shown.slug AS "establishmentSlug",
			ST_Y(coalesce(shown.location, sd.location)::geometry) AS lat,
			ST_X(coalesce(shown.location, sd.location)::geometry) AS lon,
			${point ? sql`ST_Distance(sd.location, ${point})` : sql`NULL::float8`} AS distance
		FROM directory.search_docs sd
		-- With a place, the practitioner's place of practice there.
		LEFT JOIN LATERAL (
			SELECT true AS found, s.id AS site_id, a.practice_kind
			FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			JOIN directory.places pl ON pl.id = s.place_id
			JOIN directory.places target ON target.id = ${placeId}
			WHERE a.practitioner_id = sd.practitioner_id AND a.removed_at IS NULL AND NOT a.hidden
				AND a.practice_kind IN ('office', 'health_center', 'hospital', 'locum')
				AND (pl.id = target.id OR pl.parent_id = target.id
					OR (target.kind = 'department' AND pl.department_code = target.code))
			ORDER BY a.is_primary DESC, a.id
			LIMIT 1
		) local ON true
		-- The place printed: that one, else the primary place of the read model.
		LEFT JOIN LATERAL (
			SELECT s.name, s.address_line, s.postcode, pl.name AS place_name, s.phone,
				s.phone_kind, s.slug, s.location,
				coalesce(local.practice_kind, sd.payload->'site'->>'practiceKind') AS practice_kind
			FROM directory.sites s
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE s.id = coalesce(local.site_id, (sd.payload->'site'->>'id')::integer)
		) shown ON true
		WHERE sd.indexable
			${name ? sql`AND directory.text_norm(${name}) <% sd.name_norm` : sql``}
			${listingSlug ? sql`AND sd.listing_slug = ${listingSlug}` : sql``}
			${placeId ? sql`AND sd.place_ids @> ARRAY[${placeId}]::integer[] AND local.found` : sql``}
			${point ? sql`AND sd.location IS NOT NULL` : sql``}
		ORDER BY ${order}
		LIMIT ${SEARCH_PAGE_SIZE + 1} OFFSET ${offset}
	`;
	return {
		results: rows.slice(0, SEARCH_PAGE_SIZE).map((row) => ({
			...row,
			siteName: label(row.siteName),
			addressLine: label(row.addressLine),
			lat: row.lat === null ? null : Number(row.lat),
			lon: row.lon === null ? null : Number(row.lon),
			distance: row.distance === null ? null : Number(row.distance),
		})),
		hasNext: rows.length > SEARCH_PAGE_SIZE,
	};
}
