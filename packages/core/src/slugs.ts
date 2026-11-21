/**
 * URL slug rules for practitioners, places and establishments.
 *
 * - Practitioner: `/praticien/{prenom-nom}-{rpps}`. The page is found by the
 *   trailing RPPS (Luhn-checked before any database access); a wrong name part
 *   redirects to the canonical URL.
 * - Department: `{code}-{name}` (`69-rhone`, `2a-corse-du-sud`).
 * - Commune or arrondissement: `{name}`, unique within its department, with a
 *   `-{insee}` suffix on a collision. Stored once and never recomputed.
 * - Establishment: `{name}-{finess}`.
 */
import { isValidRpps } from "./rpps";
import { slugify } from "./slugify";

/** Builds the canonical path segment of a practitioner page. */
export function practitionerSlug(firstName: string, lastName: string, rpps: string): string {
	const name = slugify(`${firstName} ${lastName}`);
	return name ? `${name}-${rpps}` : rpps;
}

export type PractitionerSegment = {
	rpps: string;
	/** Name part before the RPPS, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a practitioner URL. Returns null unless it ends
 * with a Luhn-valid RPPS, so invalid URLs never reach the database.
 */
export function parsePractitionerSegment(segment: string): PractitionerSegment | null {
	const match = /^(?:(.*)-)?(\d{11})$/.exec(segment);
	if (!match) return null;
	const rpps = match[2] ?? "";
	if (!isValidRpps(rpps)) return null;
	return { rpps, namePart: match[1] ?? "" };
}

/** Department slug: `{code}-{name}`, lowercase (`2a-corse-du-sud`). */
export function departmentSlug(code: string, name: string): string {
	return slugify(`${code} ${name}`);
}

/** Region slug: the slugified name. */
export function regionSlug(name: string): string {
	return slugify(name);
}

/**
 * Picks the slug of a new commune or arrondissement: its slugified name, or
 * `{name}-{insee}` when that slug is already used in the department.
 */
export function communeSlug(name: string, insee: string, taken: ReadonlySet<string>): string {
	const base = slugify(name) || insee.toLowerCase();
	return taken.has(base) ? `${base}-${insee.toLowerCase()}` : base;
}

/** Establishment slug: `{name}-{finess}`. */
export function establishmentSlug(name: string, finess: string): string {
	const number = finess.toLowerCase();
	const base = slugify(name);
	return base ? `${base}-${number}` : number;
}
