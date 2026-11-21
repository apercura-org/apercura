import type { PlaceRef } from "~/server/queries/types";

/** `{code}-{name}`: 2 or 3 digits, or 2a/2b for Corsica. Checked before any database access. */
export function isDepartmentSlug(slug: string): boolean {
	return /^(?:\d{2,3}|2[ab])-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** A commune or arrondissement slug: lowercase words, never only digits (those are page numbers). */
export function isPlaceSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/^\d+$/.test(slug);
}

/**
 * Name of a place with its department code, so homonyms read apart
 * ("Saint-Denis (974)", "Rhône (69)"). Arrondissements already say their city.
 */
export function placeLabel(
	place: Pick<PlaceRef, "kind" | "code" | "name" | "departmentCode">,
): string {
	if (place.kind === "department") return `${place.name} (${place.code})`;
	if (place.kind === "arrondissement" || !place.departmentCode) return place.name;
	return `${place.name} (${place.departmentCode})`;
}
