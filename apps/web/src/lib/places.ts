import { slugifyDe } from "@apercura/core";
import { AT_STATES, PRAGUE_CODE } from "@apercura/core/country";
import type { PlaceRef } from "~/server/queries/types";

/**
 * Cities whose page is their department's, by market: Paris (INSEE 75056, department 75),
 * Wien (Statistik Austria 90001, Bundesland 9) and Praha (RÚIAN 554782, district CZ0100). Their districts list under the
 * department page, and the city itself has no listing or hub page.
 */
export const CITY_IS_DEPARTMENT: Readonly<Record<string, string>> = {
	FR: "75056",
	AT: "90001",
	CZ: PRAGUE_CODE,
};

/** True for the city that is its own department page (Paris, Wien, Praha). */
export function isDepartmentCity(country: string, code: string): boolean {
	return CITY_IS_DEPARTMENT[country] === code;
}

/**
 * SQL condition excluding the department cities of every market for the place alias `p`
 * (a plain string, no parameters: the codes are constants).
 */
export const NOT_DEPARTMENT_CITY = (alias: string) =>
	Object.entries(CITY_IS_DEPARTMENT)
		.map(([country, code]) => `NOT (${alias}.country = '${country}' AND ${alias}.code = '${code}')`)
		.join(" AND ");

/**
 * Markets whose regions have listing and hub pages of their own (migration 0026): the United
 * Kingdom. France's regions group its departments on the directory page only.
 */
export const REGION_LISTING_MARKETS: ReadonlySet<string> = new Set(["GB"]);

/** Slugs of the Austrian Bundesländer (`wien`, `steiermark`, `niederoesterreich`…). */
export const AT_STATE_SLUGS: ReadonlySet<string> = new Set(
	Object.values(AT_STATES).map((name) => slugifyDe(name)),
);

/**
 * A department slug of the market, checked before any database access. France:
 * `{code}-{name}` (2 or 3 digits, or 2a/2b for Corsica). Austria: the slug of one of
 * the nine Bundesländer. The United Kingdom: the slug of a local authority or of a
 * region (England's regions and the other nations list in the same slot), never only
 * digits. Czechia: the slug of a district (okres, `brno-mesto`, `praha`).
 */
export function isDepartmentSlug(slug: string, country = "FR"): boolean {
	if (country === "AT") return AT_STATE_SLUGS.has(slug);
	if (country === "GB" || country === "CZ") return isPlaceSlug(slug);
	return /^(?:\d{2,3}|2[ab])-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** A commune or arrondissement slug: lowercase words, never only digits (those are page numbers). */
export function isPlaceSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/^\d+$/.test(slug);
}

/**
 * Name of a place with its department code, so homonyms read apart
 * ("Saint-Denis (974)", "Rhône (69)"). Arrondissements already say their city.
 * Austrian and UK places carry no code: nobody knows a Bundesland or Gemeinde by its
 * Statistik Austria number, nor a local authority by its ONS code, nor a Czech district or
 * municipality by its NUTS or RÚIAN code, and Vienna's and Prague's districts say their city
 * ("Wien-Alsergrund", "Praha 8").
 */
export function placeLabel(
	place: Pick<PlaceRef, "kind" | "code" | "name" | "departmentCode">,
	country = "FR",
): string {
	if (country !== "FR") return place.name;
	if (place.kind === "department") return `${place.name} (${place.code})`;
	if (place.kind === "arrondissement" || !place.departmentCode) return place.name;
	return `${place.name} (${place.departmentCode})`;
}
