import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { CITY_IS_DEPARTMENT, isDepartmentCity, REGION_LISTING_MARKETS } from "~/lib/places";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import type { PlaceRef } from "./types";

/** Insee code of Paris: its city page is the department page. */
export const PARIS_CODE = CITY_IS_DEPARTMENT.FR;

export type PlaceResolution =
	| { kind: "found"; department: PlaceRef; place: PlaceRef | null; isCity: boolean }
	/** A former slug, a merged commune or the Paris city: 308 to these slugs. */
	| { kind: "moved"; departmentSlug: string; placeSlug: string | null }
	| { kind: "not_found" };

const PLACE_COLUMNS = `id, kind, code, name, slug, department_code AS "departmentCode"`;

/**
 * Resolves `/{dept}[/{commune}]` slugs to the places of one market (`FR`,
 * `AT`, `GB`; in the UK the first slug may also name a region). Slugs are stored once and never recomputed: renamed places answer
 * through their aliases, merged communes through their successor, and the
 * Paris and Wien cities through their department.
 */
export async function resolvePlace(
	country: string,
	departmentSlug: string,
	placeSlug: string | null,
): Promise<PlaceResolution> {
	"use cache";
	cacheLife("weeks");
	cacheTag(cacheTags.coarse.place);
	const sql = getSql();

	// The UK lists by region too (England's regions and the other nations): a region's slug
	// takes the department's slot, and has no commune below it (its places are authorities).
	const kinds = REGION_LISTING_MARKETS.has(country) ? ["department", "region"] : ["department"];
	let [department] = await sql<PlaceRef[]>`
		SELECT ${sql.unsafe(PLACE_COLUMNS)} FROM directory.places
		WHERE country = ${country} AND kind = ANY (${kinds}::text[]) AND slug = ${departmentSlug}
			AND removed_at IS NULL
	`;
	let moved = false;
	if (!department) {
		[department] = await sql<PlaceRef[]>`
			SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode"
			FROM directory.place_slug_aliases a
			JOIN directory.places p ON p.id = a.place_id AND p.kind = ANY (${kinds}::text[])
			WHERE a.country = ${country} AND a.department_code IS NULL AND a.slug = ${departmentSlug}
		`;
		if (!department) return { kind: "not_found" };
		moved = true;
	}
	cacheTag(cacheTags.place(department.id));
	if (department.kind === "region" && placeSlug !== null) return { kind: "not_found" };

	if (placeSlug === null) {
		return moved
			? { kind: "moved", departmentSlug: department.slug, placeSlug: null }
			: { kind: "found", department, place: null, isCity: false };
	}

	type Row = PlaceRef & { successorSlug: string | null; removed: boolean };
	let [place] = await sql<Row[]>`
		SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
			s.slug AS "successorSlug", p.removed_at IS NOT NULL AS removed
		FROM directory.places p
		LEFT JOIN directory.places s ON s.id = p.successor_id
		WHERE p.country = ${country} AND p.kind IN ('commune', 'arrondissement')
			AND p.department_code = ${department.code} AND p.slug = ${placeSlug}
	`;
	if (!place) {
		[place] = await sql<Row[]>`
			SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
				NULL AS "successorSlug", p.removed_at IS NOT NULL AS removed
			FROM directory.place_slug_aliases a
			JOIN directory.places p ON p.id = a.place_id AND p.kind IN ('commune', 'arrondissement')
			WHERE a.country = ${country} AND a.department_code = ${department.code}
				AND a.slug = ${placeSlug}
		`;
		if (!place) return { kind: "not_found" };
		moved = true;
	}
	cacheTag(cacheTags.place(place.id));
	if (isDepartmentCity(country, place.code)) {
		return { kind: "moved", departmentSlug: department.slug, placeSlug: null };
	}
	if (place.successorSlug) {
		return { kind: "moved", departmentSlug: department.slug, placeSlug: place.successorSlug };
	}
	if (place.removed) return { kind: "not_found" };
	if (moved) return { kind: "moved", departmentSlug: department.slug, placeSlug: place.slug };

	const [children] = await sql<{ n: number }[]>`
		SELECT count(*)::integer AS n FROM directory.places
		WHERE parent_id = ${place.id} AND kind = 'arrondissement'
	`;
	const { successorSlug: _successor, removed: _removed, ...ref } = place;
	return { kind: "found", department, place: ref, isCity: (children?.n ?? 0) > 0 };
}
