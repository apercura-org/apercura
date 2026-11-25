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
import { slugify, slugifyDe } from "./slugify";

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

export type EstablishmentSegment = {
	/** FINESS number as stored (uppercase `2A`/`2B` for Corsica). */
	finess: string;
	/** Name part before the FINESS number, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of an establishment URL: `{name}-{finess}`, where a
 * FINESS number is two digits (or `2a`/`2b`) followed by seven digits. Returns
 * null for anything else, so malformed URLs never reach the database.
 */
export function parseEstablishmentSegment(segment: string): EstablishmentSegment | null {
	const match = /^(?:([a-z0-9-]*)-)?(\d{2}\d{7}|2[ab]\d{7})$/.exec(segment);
	if (!match) return null;
	return { finess: (match[2] ?? "").toUpperCase(), namePart: match[1] ?? "" };
}

/**
 * Austrian practitioner identifiers: the key each regional list gives a doctor,
 * and the letters that stand for the list in a page URL. Neither list publishes
 * a national number, so the scheme is the list (docs/data-import.md, "Austria").
 */
export const AT_ID_SCHEMES = {
	/** Vienna: the doctor's number in the Ärztekammer für Wien's practice links (praxisplan.at). */
	"AT-WIEN": "w",
	/** Styria: the doctor's number ("ARZTNR") in the Land Steiermark list. */
	"AT-STMK": "st",
	/**
	 * Salzburg doctors: the list gives no number, so the key is derived from the
	 * doctor's names (`atNameKey`, docs/data-import.md, "Austria").
	 */
	"AT-SBG": "sb",
	/** Salzburg dentists: derived from the names, like the doctors'. */
	"AT-SBGZ": "sz",
} as const;

export type AtIdScheme = keyof typeof AT_ID_SCHEMES;

const AT_SCHEME_OF_PREFIX = new Map<string, AtIdScheme>(
	Object.entries(AT_ID_SCHEMES).map(([scheme, prefix]) => [prefix, scheme as AtIdScheme]),
);

/** True for a source key of an Austrian list: 1 to 9 digits, no leading 0. */
export function isValidAtSourceId(value: string): boolean {
	return /^[1-9]\d{0,8}$/.test(value);
}

/**
 * Canonical path segment of an Austrian practitioner page:
 * `{vorname-nachname}-{list}{number}` (`maria-muster-w7983`, `hans-gruber-st45`),
 * umlauts spelled out (`jürgen` -> `juergen`).
 */
export function atPractitionerSlug(
	firstName: string,
	lastName: string,
	scheme: AtIdScheme,
	nationalId: string,
): string {
	const key = `${AT_ID_SCHEMES[scheme]}${nationalId}`;
	const name = slugifyDe(`${firstName} ${lastName}`);
	return name ? `${name}-${key}` : key;
}

export type AtPractitionerSegment = {
	idScheme: AtIdScheme;
	nationalId: string;
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of an Austrian practitioner URL. Returns null unless
 * it ends with a list letter and a valid number, so invalid URLs never reach
 * the database.
 */
export function parseAtPractitionerSegment(segment: string): AtPractitionerSegment | null {
	const match = /^(?:(.*)-)?([a-z]{1,2})([1-9]\d{0,8})$/.exec(segment);
	if (!match) return null;
	const idScheme = AT_SCHEME_OF_PREFIX.get(match[2] ?? "");
	if (!idScheme) return null;
	return { idScheme, nationalId: match[3] ?? "", namePart: match[1] ?? "" };
}
