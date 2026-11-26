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

/**
 * United Kingdom identifiers: one scheme per open list (a list that fails to import keeps its
 * rows), and the shape of the key each list gives a practice. NHS England's Organisation Data
 * Service (England and Wales) codes are national and printed as they are (`A81001` for a GP
 * practice, `V00003` for a dental practice, `FM474` for a pharmacy); the Scottish and
 * Northern Irish lists number their practices, so their key carries letters naming the list
 * (`sg10002`). Northern Ireland's dental list gives no number: its key is derived from the
 * address (docs/data-import.md, "United Kingdom").
 */
export const GB_ID_SCHEMES = {
	/** England and Wales GP practices: the ODS code (`A81001`, a letter and 5 digits). */
	"GB-ODS-GP": { prefix: "", pattern: /^[A-UW-Z]\d{5}$/ },
	/** England and Wales dental practices: the ODS code (`V00003`, `V012345`). */
	"GB-ODS-DENT": { prefix: "", pattern: /^V\d{5,6}$/ },
	/** England and Wales pharmacies: the ODS code (`FM474`, `FA123`). */
	"GB-ODS-PHARM": { prefix: "", pattern: /^F[A-Z][A-Z\d]\d{2}$/ },
	/** Scotland GP practices: Public Health Scotland's practice code (5 digits). */
	"GB-PHS-GP": { prefix: "sg", pattern: /^\d{1,6}$/ },
	/** Scotland dental practices: Public Health Scotland's dental practice code. */
	"GB-PHS-DENT": { prefix: "sd", pattern: /^\d{1,6}$/ },
	/** Scotland pharmacies: Public Health Scotland's dispenser code. */
	"GB-PHS-PHARM": { prefix: "sp", pattern: /^\d{1,6}$/ },
	/** Northern Ireland GP practices: the Business Services Organisation's practice number. */
	"GB-BSO-GP": { prefix: "ng", pattern: /^\d{1,6}$/ },
	/** Northern Ireland dental surgeries: 10 hex digits derived from the address (no number published). */
	"GB-BSO-DENT": { prefix: "nd", pattern: /^[0-9a-f]{10}$/ },
} as const;

export type GbIdScheme = keyof typeof GB_ID_SCHEMES;

const GB_SCHEMES = Object.keys(GB_ID_SCHEMES) as GbIdScheme[];

/** True when `value` is a key of the UK scheme (syntax only: the practice may not exist). */
export function isValidGbSourceId(scheme: string, value: string): boolean {
	const entry = GB_ID_SCHEMES[scheme as GbIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of a UK practice as its page URL ends (`a81001`, `sg10002`, `nd0a1b2c3d4e`). */
export function gbUrlKey(scheme: GbIdScheme, nationalId: string): string {
	return `${GB_ID_SCHEMES[scheme].prefix}${nationalId}`.toLowerCase();
}

/**
 * Canonical path segment of a UK practice page: `{practice-name}-{key}`
 * (`the-densham-surgery-a81001`, `muirhead-medical-centre-sg10002`).
 */
export function gbPracticeSlug(name: string, scheme: GbIdScheme, nationalId: string): string {
	const key = gbUrlKey(scheme, nationalId);
	const base = slugify(name);
	return base ? `${base}-${key}` : key;
}

export type GbPracticeKey = {
	idScheme: GbIdScheme;
	nationalId: string;
};

/**
 * Reads a UK practice key as its page URL ends (`a81001`, `sg10002`): the scheme
 * and the identifier as stored. Null for anything else.
 */
export function parseGbKey(token: string): GbPracticeKey | null {
	const lower = token.toLowerCase();
	for (const idScheme of GB_SCHEMES) {
		const { prefix, pattern } = GB_ID_SCHEMES[idScheme];
		if (prefix ? !lower.startsWith(prefix) : /^(sg|sd|sp|ng|nd)/.test(lower)) continue;
		const rest = lower.slice(prefix.length);
		const nationalId = prefix ? rest : rest.toUpperCase();
		if (pattern.test(nationalId)) return { idScheme, nationalId };
	}
	return null;
}

export type GbPracticeSegment = GbPracticeKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a UK practice URL (`{practice-name}-{key}`). Returns
 * null unless it ends with a valid key, so invalid URLs never reach the database.
 */
export function parseGbPracticeSegment(segment: string): GbPracticeSegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseGbKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Czech identifiers: the National Register of Healthcare Providers (NRPZS) gives every
 * healthcare facility (zdravotnické zařízení) a unique number (`ZZ_ID`), the page's key. The
 * provider's company number (IČO), which for a sole trader names a person, is not used.
 */
export const CZ_ID_SCHEME = "CZ-NRPZS";

/** True for an NRPZS facility number: 1 to 9 digits, no leading 0 (syntax only). */
export function isValidCzSourceId(value: string): boolean {
	return /^[1-9]\d{0,8}$/.test(value);
}

/**
 * Canonical path segment of a Czech facility page: `{facility-name}-{number}`
 * (`mudr-hana-bohackova-39781`, `lekarna-u-ceske-koruny-54227`), diacritics dropped.
 */
export function czFacilitySlug(name: string, nationalId: string): string {
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${nationalId}` : nationalId;
}

export type CzFacilitySegment = {
	idScheme: typeof CZ_ID_SCHEME;
	nationalId: string;
	/** Name part before the number, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Czech facility URL (`{facility-name}-{number}`). Returns null
 * unless it ends with a valid NRPZS number, so invalid URLs never reach the database.
 */
export function parseCzFacilitySegment(segment: string): CzFacilitySegment | null {
	const match = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?([1-9]\d{0,8})$/.exec(segment);
	if (!match) return null;
	return { idScheme: CZ_ID_SCHEME, nationalId: match[2] ?? "", namePart: match[1] ?? "" };
}

/**
 * Spanish identifiers: the General Register of health centres, services and establishments
 * (REGCESS, Ministerio de Sanidad) gives every authorised centre its normalised centre code
 * (`CCN`, Código de Centro Normalizado), ten digits that begin with the code of the autonomous
 * community (`1003000254`), the page's key. The regional code and the owner's tax number are
 * never used.
 */
export const ES_ID_SCHEME = "ES-REGCESS";

/** True for a REGCESS centre code: ten digits, the first two an autonomous community (`01`–`19`). */
export function isValidEsSourceId(value: string): boolean {
	return /^(?:0[1-9]|1\d)\d{8}$/.test(value);
}

/**
 * Canonical path segment of a Spanish centre page: `{centre-name}-{ccn}`
 * (`clinica-dental-sonrisa-1003000254`, `farmacia-ana-maria-1106002194`), diacritics dropped.
 */
export function esCentreSlug(name: string, nationalId: string): string {
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${nationalId}` : nationalId;
}

export type EsCentreSegment = {
	idScheme: typeof ES_ID_SCHEME;
	nationalId: string;
	/** Name part before the code, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Spanish centre URL (`{centre-name}-{ccn}`). Returns null unless
 * it ends with a valid REGCESS centre code, so invalid URLs never reach the database.
 */
export function parseEsCentreSegment(segment: string): EsCentreSegment | null {
	const match = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?((?:0[1-9]|1\d)\d{8})$/.exec(segment);
	if (!match) return null;
	return { idScheme: ES_ID_SCHEME, nationalId: match[2] ?? "", namePart: match[1] ?? "" };
}

/**
 * Italian identifiers: one scheme per list of the Ministry of Health (a list that fails to
 * import keeps its rows), each the ministry's own code of the place, never the owner's VAT
 * number (which for a sole trader identifies the person). The pharmacies' list gives every
 * pharmacy a ministerial identification code (`cod_farmacia`, a number); the parapharmacies'
 * list a six-digit logistic-site code (`codice_identificativo_sito`, `002112`); the hospital
 * bed counts the facility code of the HSP.11 model (`Codice struttura`, the region's three
 * digits then three, `010030`). A page URL ends with the code after a letter naming the list
 * (`farmacia-san-carlo-f12345`, `parafarmacia-eurosan-p002113`,
 * `ospedali-riuniti-pinerolo-s010030`), so the three kinds of code never meet.
 */
export const IT_ID_SCHEMES = {
	/** Pharmacies, dispensaries and branches: the ministerial pharmacy code (`12345`). */
	"IT-FARM": { prefix: "f", pattern: /^(?:0|[1-9]\d{0,7})$/ },
	/** Parapharmacies: the ministry's logistic-site code, six digits (`002112`). */
	"IT-PFARM": { prefix: "p", pattern: /^\d{6}$/ },
	/** Hospitals and accredited private clinics: the HSP.11 facility code (`010030`). */
	"IT-HSP": { prefix: "s", pattern: /^\d{6}$/ },
} as const;

export type ItIdScheme = keyof typeof IT_ID_SCHEMES;

const IT_SCHEMES = Object.keys(IT_ID_SCHEMES) as ItIdScheme[];

/** True when `value` is a code of the Italian scheme (syntax only: the place may not exist). */
export function isValidItSourceId(scheme: string, value: string): boolean {
	const entry = IT_ID_SCHEMES[scheme as ItIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of an Italian page as its URL ends (`f12345`, `p002112`, `s010030`). */
export function itUrlKey(scheme: ItIdScheme, nationalId: string): string {
	return `${IT_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of an Italian page: `{name}-{key}` (`farmacia-san-carlo-f12345`),
 * diacritics dropped.
 */
export function itPlaceSlug(name: string, scheme: ItIdScheme, nationalId: string): string {
	const key = itUrlKey(scheme, nationalId);
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type ItPlaceKey = { idScheme: ItIdScheme; nationalId: string };

/** Reads an Italian key as its page URL ends (`f12345`, `P002112`): the scheme and the code. */
export function parseItKey(token: string): ItPlaceKey | null {
	const lower = token.toLowerCase();
	for (const idScheme of IT_SCHEMES) {
		const { prefix, pattern } = IT_ID_SCHEMES[idScheme];
		if (!lower.startsWith(prefix)) continue;
		const nationalId = lower.slice(prefix.length);
		if (pattern.test(nationalId)) return { idScheme, nationalId };
	}
	return null;
}

export type ItPlaceSegment = ItPlaceKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of an Italian page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseItPlaceSegment(segment: string): ItPlaceSegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseItKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}
