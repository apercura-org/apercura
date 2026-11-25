import { slugifyDe } from "@apercura/core";
import { AT_STATES } from "@apercura/core/country";
import type { PlaceRef } from "~/server/queries/types";

/**
 * Cities whose page is their department's, by market: Paris (INSEE 75056, department 75)
 * and Wien (Statistik Austria 90001, Bundesland 9). Their districts list under the
 * department page, and the city itself has no listing or hub page.
 */
export const CITY_IS_DEPARTMENT: Readonly<Record<string, string>> = {
	FR: "75056",
	AT: "90001",
};

/** True for the city that is its own department page (Paris, Wien). */
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

/** Slugs of the Austrian Bundesländer (`wien`, `steiermark`, `niederoesterreich`…). */
export const AT_STATE_SLUGS: ReadonlySet<string> = new Set(
	Object.values(AT_STATES).map((name) => slugifyDe(name)),
);

/**
 * A department slug of the market, checked before any database access. France:
 * `{code}-{name}` (2 or 3 digits, or 2a/2b for Corsica). Austria: the slug of one of
 * the nine Bundesländer.
 */
export function isDepartmentSlug(slug: string, country = "FR"): boolean {
	if (country === "AT") return AT_STATE_SLUGS.has(slug);
	return /^(?:\d{2,3}|2[ab])-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** A commune or arrondissement slug: lowercase words, never only digits (those are page numbers). */
export function isPlaceSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/^\d+$/.test(slug);
}

/**
 * Name of a place with its department code, so homonyms read apart
 * ("Saint-Denis (974)", "Rhône (69)"). Arrondissements already say their city.
 * Austrian places carry no code: nobody knows a Bundesland or Gemeinde by its
 * Statistik Austria number, and Vienna's districts say their city ("Wien-Alsergrund").
 */
export function placeLabel(
	place: Pick<PlaceRef, "kind" | "code" | "name" | "departmentCode">,
	country = "FR",
): string {
	if (country === "AT") return place.name;
	if (place.kind === "department") return `${place.name} (${place.code})`;
	if (place.kind === "arrondissement" || !place.departmentCode) return place.name;
	return `${place.name} (${place.departmentCode})`;
}
