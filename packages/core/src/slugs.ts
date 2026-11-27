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
import { slugify, slugifyDe, slugifyEl, slugifyNo, slugifyPl } from "./slugify";

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
 * Polish identifiers: RPWDL, the register of entities performing medical activity (Centrum
 * e-Zdrowia), gives every healthcare establishment (zakład leczniczy) a number (`ID ZOZ`), the
 * page's key. The operating entity's tax and statistical numbers (NIP, REGON), which for a sole
 * trader identify a person, are never used.
 */
export const PL_ID_SCHEME = "PL-RPWDL";

/** True for an RPWDL establishment number: 1 to 10 digits, no leading 0 (syntax only). */
export function isValidPlSourceId(value: string): boolean {
	return /^[1-9]\d{0,9}$/.test(value);
}

/**
 * Canonical path segment of a Polish establishment page: `{name}-{number}`
 * (`przychodnia-przykladowa-290629`), diacritics dropped (`ł` as `l`).
 */
export function plFacilitySlug(name: string, nationalId: string): string {
	const base = slugifyPl(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${nationalId}` : nationalId;
}

export type PlFacilitySegment = {
	idScheme: typeof PL_ID_SCHEME;
	nationalId: string;
	/** Name part before the number, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Polish establishment URL (`{name}-{number}`). Returns null
 * unless it ends with a valid RPWDL number, so invalid URLs never reach the database.
 */
export function parsePlFacilitySegment(segment: string): PlFacilitySegment | null {
	const match = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?([1-9]\d{0,9})$/.exec(segment);
	if (!match) return null;
	return { idScheme: PL_ID_SCHEME, nationalId: match[2] ?? "", namePart: match[1] ?? "" };
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

/**
 * Lithuanian identifiers: the State Accreditation Service for Health Care Activities (VASPVT)
 * numbers every licensed institution (`spi_id`) and gives each of its licensed activity
 * addresses a GUID. A page is an activity address: its key is the institution's number and the
 * Address Register's code of the address (`adreso_id`, permanent), `5271-12679435`; an activity
 * address without an address code takes the first eight hexadecimal digits of its GUID after a
 * `v` (`5271-v00141024`). The legal entity code (`ja_kodas`) is never used.
 */
export const LT_ID_SCHEME = "LT-VASPVT";

const LT_ID = /^[1-9]\d{0,6}-(?:[1-9]\d{0,9}|v[0-9a-f]{8})$/;

/** True for a Lithuanian page key (`5271-12679435`, `5271-v00141024`), syntax only. */
export function isValidLtSourceId(value: string): boolean {
	return LT_ID.test(value);
}

/**
 * Canonical path segment of a Lithuanian page: `{name}-{key}`
 * (`uab-pavyzdine-klinika-5271-12679435`), diacritics dropped.
 */
export function ltFacilitySlug(name: string, nationalId: string): string {
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${nationalId}` : nationalId;
}

export type LtFacilitySegment = {
	idScheme: typeof LT_ID_SCHEME;
	nationalId: string;
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Lithuanian page URL (`{name}-{key}`): the key is always its last
 * two parts. Returns null unless it ends with a valid key, so invalid URLs never reach the
 * database.
 */
export function parseLtFacilitySegment(segment: string): LtFacilitySegment | null {
	const match =
		/^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?([1-9]\d{0,6}-(?:[1-9]\d{0,9}|v[0-9a-f]{8}))$/.exec(segment);
	if (!match) return null;
	return { idScheme: LT_ID_SCHEME, nationalId: match[2] ?? "", namePart: match[1] ?? "" };
}

/**
 * German identifiers: one scheme per source, so a source that fails to import keeps its rows.
 * Neither the Destatis directory of hospitals and of prevention and rehabilitation clinics nor
 * the Länder's pharmacy lists publish a national number: the hospital directory's `KH_ID` is a
 * pseudonym drawn anew for every edition. A site's key is therefore derived from what it is
 * (its municipality, address and names, `packages/etl/src/sources/de`), ten hexadecimal digits; a pharmacy list's
 * key is the number the supervising authority gives the pharmacy where the list prints one. The
 * letters before the key name the source in a page URL (docs/data-import.md, "Germany").
 */
export const DE_ID_SCHEMES = {
	/** A hospital site of the Destatis directory (`Verzeichnis der Krankenhäuser`): derived key. */
	"DE-KHV": { prefix: "k", pattern: /^[0-9a-f]{10}$/ },
	/** A prevention or rehabilitation clinic of the Destatis directory: derived key. */
	"DE-RHV": { prefix: "r", pattern: /^[0-9a-f]{10}$/ },
	/** A pharmacy of Thuringia's list: the number of its file at the Landesamt (`Az_VIS`). */
	"DE-APO-TH": { prefix: "th", pattern: /^[1-9]\d{0,6}$/ },
	/** A pharmacy of Brandenburg's list: derived key (the list's feature ids are row numbers). */
	"DE-APO-BB": { prefix: "bb", pattern: /^[0-9a-f]{10}$/ },
} as const;

export type DeIdScheme = keyof typeof DE_ID_SCHEMES;

/** Schemes by prefix, the longest prefix first (`th` before any one-letter prefix). */
const DE_SCHEMES = (Object.keys(DE_ID_SCHEMES) as DeIdScheme[]).sort(
	(a, b) => DE_ID_SCHEMES[b].prefix.length - DE_ID_SCHEMES[a].prefix.length,
);

/** True when `value` is a key of the German scheme (syntax only: the site may not exist). */
export function isValidDeSourceId(scheme: string, value: string): boolean {
	const entry = DE_ID_SCHEMES[scheme as DeIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of a German site as its page URL ends (`k0a1b2c3d4e`, `th420`). */
export function deUrlKey(scheme: DeIdScheme, nationalId: string): string {
	return `${DE_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of a German facility page: `{name}-{key}`
 * (`klinikum-musterstadt-k0a1b2c3d4e`, `rosen-apotheke-am-markt-th420`), umlauts spelled out.
 */
export function deFacilitySlug(name: string, scheme: DeIdScheme, nationalId: string): string {
	const key = deUrlKey(scheme, nationalId);
	const base = slugifyDe(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type DeFacilityKey = { idScheme: DeIdScheme; nationalId: string };

/** Reads a German facility key as its page URL ends (`k0a1b2c3d4e`, `th420`). Null for anything else. */
export function parseDeKey(token: string): DeFacilityKey | null {
	for (const idScheme of DE_SCHEMES) {
		const { prefix, pattern } = DE_ID_SCHEMES[idScheme];
		if (!token.startsWith(prefix)) continue;
		const nationalId = token.slice(prefix.length);
		if (pattern.test(nationalId)) return { idScheme, nationalId };
	}
	return null;
}

export type DeFacilitySegment = DeFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a German facility URL (`{name}-{key}`). Returns null unless it
 * ends with a valid key, so invalid URLs never reach the database.
 */
export function parseDeFacilitySegment(segment: string): DeFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseDeKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Swiss identifiers: one scheme per list (a list that fails to import keeps its rows), since
 * Switzerland publishes no open national number of a health facility (the BUR/UID numbers
 * identify companies, and a sole trader's is the person's). Where a list numbers its rows, the
 * key is that number; where it does not (the FOPH's hospital figures name sites without a code),
 * the key is derived from what identifies the row in the list (its canton, name and postcode:
 * docs/data-import.md, "Switzerland"), nine digits. A page URL ends with the key after letters
 * naming the list (`kantonsspital-baden-h123456789`, `amavita-apotheke-binningen-blp7601001796874`), so two
 * lists' numbers never meet.
 */
export const CH_ID_SCHEMES = {
	/** Hospital sites of the FOPH's "Kennzahlen der Schweizer Spitäler": derived (nine digits). */
	"CH-BAG": { prefix: "h", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Bern, hospitals and clinics not in the FOPH's figures: derived. */
	"CH-BE-SPITAL": { prefix: "beh", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Bern, nursing homes (Alters- und Pflegeheime): derived. */
	"CH-BE-PH": { prefix: "bee", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Geneva (SITG), hospitals and clinics not in the FOPH's figures: derived. */
	"CH-GE-HOP": { prefix: "geh", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Geneva (SITG), nursing homes (EMS): the cantonal address id (`IDPADR`). */
	"CH-GE-EMS": { prefix: "gee", pattern: /^[1-9]\d{5,13}$/ },
	/** Canton of Geneva (SITG), pharmacies that vaccinate: derived. */
	"CH-GE-PHARM": { prefix: "gep", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Basel-Landschaft, pharmacies: the business's GLN (thirteen digits, `76…`). */
	"CH-BL-PHARM": { prefix: "blp", pattern: /^76\d{11}$/ },
	/** Canton of Basel-Landschaft, nursing homes: derived. */
	"CH-BL-PH": { prefix: "ble", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Basel-Stadt, hospitals and clinics not in the FOPH's figures: derived. */
	"CH-BS-SPITAL": { prefix: "bsh", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Basel-Stadt, nursing homes: derived. */
	"CH-BS-PH": { prefix: "bse", pattern: /^[1-9]\d{8}$/ },
	/** Canton of Zürich, nursing homes: the home's id (eight hexadecimal digits), as a number. */
	"CH-ZH-PH": { prefix: "zhe", pattern: /^[1-9]\d{0,9}$/ },
	/** Republic and Canton of Jura, care institutions not in the FOPH's figures: derived. */
	"CH-JU": { prefix: "ju", pattern: /^[1-9]\d{8}$/ },
} as const;

export type ChIdScheme = keyof typeof CH_ID_SCHEMES;

const CH_SCHEMES = Object.keys(CH_ID_SCHEMES) as ChIdScheme[];

/** True when `value` is a key of the Swiss scheme (syntax only: the facility may not exist). */
export function isValidChSourceId(scheme: string, value: string): boolean {
	const entry = CH_ID_SCHEMES[scheme as ChIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of a Swiss page as its URL ends (`h123456789`, `blp7601001796874`). */
export function chUrlKey(scheme: ChIdScheme, nationalId: string): string {
	return `${CH_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of a Swiss facility page: `{name}-{key}`
 * (`kantonsspital-baden-h123456789`), umlauts spelled out the German way (`zuerich`) and other
 * diacritics dropped (`geneve`), as Swiss URLs write them.
 */
export function chFacilitySlug(name: string, scheme: ChIdScheme, nationalId: string): string {
	const key = chUrlKey(scheme, nationalId);
	const base = slugifyDe(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type ChFacilityKey = { idScheme: ChIdScheme; nationalId: string };

/** Reads a Swiss key as its page URL ends (`h123456789`, `GEE930225001723`): the scheme and the key. */
export function parseChKey(token: string): ChFacilityKey | null {
	const match = /^([a-z]{1,3})(\d{1,14})$/.exec(token.toLowerCase());
	if (!match) return null;
	const [, prefix = "", nationalId = ""] = match;
	const idScheme = CH_SCHEMES.find((scheme) => CH_ID_SCHEMES[scheme].prefix === prefix);
	if (!idScheme || !CH_ID_SCHEMES[idScheme].pattern.test(nationalId)) return null;
	return { idScheme, nationalId };
}

export type ChFacilitySegment = ChFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Swiss page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseChFacilitySegment(segment: string): ChFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseChKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Estonian identifiers: one scheme per source, so a source that fails to import keeps its rows.
 * A healthcare provider of the Health Board's register (MEDRE, "Tervishoiuteenuse osutajate ning
 * tegevuslubade andmestik") is keyed by its first activity licence still in force, the
 * register's immutable licence designation (`L01909`: the letter L and five digits), which the
 * Advertising Act (§ 22(3)) has every page about a provider print anyway; the provider's
 * Business Register code is never used (a sole trader's names the person). A pharmacy of the
 * State Agency of Medicines' register is keyed by its place of business code (`Tegutsemiskoha
 * kood`, a number). A page URL ends with the key after letters naming the source
 * (`perearstikeskus-naide-l01909`, `naidise-apteek-ap457`), so the two kinds never meet.
 */
export const EE_ID_SCHEMES = {
	/** A healthcare provider: the digits of its first activity licence in force (`L01909`). */
	"EE-TTL": { prefix: "l", pattern: /^\d{5}$/ },
	/** A pharmacy: the State Agency of Medicines' place of business code (`457`). */
	"EE-APT": { prefix: "ap", pattern: /^[1-9]\d{0,6}$/ },
} as const;

export type EeIdScheme = keyof typeof EE_ID_SCHEMES;

/** Schemes by prefix, the longest prefix first (`ap` before any one-letter prefix). */
const EE_SCHEMES = (Object.keys(EE_ID_SCHEMES) as EeIdScheme[]).sort(
	(a, b) => EE_ID_SCHEMES[b].prefix.length - EE_ID_SCHEMES[a].prefix.length,
);

/** True when `value` is a key of the Estonian scheme (syntax only: the place may not exist). */
export function isValidEeSourceId(scheme: string, value: string): boolean {
	const entry = EE_ID_SCHEMES[scheme as EeIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of an Estonian page as its URL ends (`l01909`, `ap457`). */
export function eeUrlKey(scheme: EeIdScheme, nationalId: string): string {
	return `${EE_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * The activity licence number as the register writes it and a page prints it (`01909` →
 * `L01909`).
 */
export function eeLicenceNumber(nationalId: string): string {
	return `L${nationalId}`;
}

/**
 * Canonical path segment of an Estonian page: `{name}-{key}` (`perearstikeskus-naide-l01909`,
 * `naidise-apteek-ap457`), diacritics dropped (`õ`, `ä`, `ö`, `ü` → `o`, `a`, `o`, `u`).
 */
export function eeFacilitySlug(name: string, scheme: EeIdScheme, nationalId: string): string {
	const key = eeUrlKey(scheme, nationalId);
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type EeFacilityKey = { idScheme: EeIdScheme; nationalId: string };

/** Reads an Estonian key as its page URL ends (`l01909`, `ap457`). Null for anything else. */
export function parseEeKey(token: string): EeFacilityKey | null {
	const lower = token.toLowerCase();
	for (const idScheme of EE_SCHEMES) {
		const { prefix, pattern } = EE_ID_SCHEMES[idScheme];
		if (!lower.startsWith(prefix)) continue;
		const nationalId = lower.slice(prefix.length);
		if (pattern.test(nationalId)) return { idScheme, nationalId };
	}
	return null;
}

export type EeFacilitySegment = EeFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of an Estonian page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseEeFacilitySegment(segment: string): EeFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseEeKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Norwegian identifiers. A page is an establishment (underenhet) of the Brønnøysund Register
 * Centre's Central Coordinating Register for Legal Entities (Enhetsregisteret): a hospital, a
 * medical or dental practice, a nursing home or a pharmacy, keyed by its own organisation number
 * (nine digits, the last a modulus 11 check digit, `925781584`). The establishment's number is
 * never a person's: sole proprietorships (enkeltpersonforetak), named after their owner, are not
 * listed. A page URL ends with the number (`ahus-gardermoen-925781584`).
 */
export const NO_ID_SCHEMES = {
	/** An establishment of the Central Coordinating Register: its organisation number. */
	"NO-ORGNR": { prefix: "", pattern: /^[89]\d{8}$/ },
} as const;

export type NoIdScheme = keyof typeof NO_ID_SCHEMES;

/** The weights of the organisation number's check digit (modulus 11). */
const NO_ORGNR_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

/**
 * True when `value` is a Norwegian organisation number: nine digits, the first 8 or 9, and a
 * check digit that matches (syntax only: the unit may not exist).
 */
export function isValidNoOrgNumber(value: string): boolean {
	if (!NO_ID_SCHEMES["NO-ORGNR"].pattern.test(value)) return false;
	const sum = NO_ORGNR_WEIGHTS.reduce(
		(total, weight, index) => total + weight * Number(value[index]),
		0,
	);
	const remainder = sum % 11;
	const check = remainder === 0 ? 0 : 11 - remainder;
	return check !== 10 && check === Number(value[8]);
}

/** True when `value` is a key of the Norwegian scheme (syntax and check digit only). */
export function isValidNoSourceId(scheme: string, value: string): boolean {
	return scheme === "NO-ORGNR" && isValidNoOrgNumber(value);
}

/** The key of a Norwegian page as its URL ends (`925781584`). */
export function noUrlKey(_scheme: NoIdScheme, nationalId: string): string {
	return nationalId;
}

/** An organisation number the way Norway prints it, in groups of three (`925 781 584`). */
export function noOrgNumber(nationalId: string): string {
	return /^\d{9}$/.test(nationalId)
		? `${nationalId.slice(0, 3)} ${nationalId.slice(3, 6)} ${nationalId.slice(6)}`
		: nationalId;
}

/**
 * Canonical path segment of a Norwegian page: `{name}-{orgnr}` (`ahus-gardermoen-925781584`),
 * `ø` written `o`, `æ` `ae`, `å` `a`.
 */
export function noFacilitySlug(name: string, scheme: NoIdScheme, nationalId: string): string {
	const key = noUrlKey(scheme, nationalId);
	const base = slugifyNo(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type NoFacilityKey = { idScheme: NoIdScheme; nationalId: string };

/**
 * Reads a Norwegian key as its page URL ends or as typed (`925781584`, `925 781 584`). Null for
 * anything else, a wrong check digit included.
 */
export function parseNoKey(token: string): NoFacilityKey | null {
	const compact = token.replace(/\s+/g, "");
	return isValidNoOrgNumber(compact) ? { idScheme: "NO-ORGNR", nationalId: compact } : null;
}

export type NoFacilitySegment = NoFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Norwegian page URL (`{name}-{orgnr}`). Returns null unless it
 * ends with a valid organisation number, so invalid URLs never reach the database.
 */
export function parseNoFacilitySegment(segment: string): NoFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseNoKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Irish identifiers: one scheme per list (a list that fails to import keeps its rows). The
 * Pharmaceutical Society of Ireland numbers every retail pharmacy business it registers and HIQA
 * every designated centre for older people: those numbers are the keys. The HSE's Health Atlas
 * layers of hospitals and health centres (a March 2020 snapshot) number their rows only, so a
 * hospital's or health centre's key is derived from what identifies it in its layer (its county,
 * name and address: docs/data-import.md, "Ireland"), nine digits. A page URL ends with the key
 * after a letter naming the list (`example-pharmacy-p10000612`, `example-nursing-home-n738`), so
 * two lists' numbers never meet.
 */
export const IE_ID_SCHEMES = {
	/** Retail pharmacy businesses of the PSI's register: the registration number. */
	"IE-PSI": { prefix: "p", pattern: /^[1-9]\d{3,9}$/ },
	/** Designated centres for older people of HIQA's register: the centre's id (`Centre_ID`). */
	"IE-HIQA": { prefix: "n", pattern: /^[1-9]\d{0,7}$/ },
	/** Hospitals of the HSE's Health Atlas layer: derived (nine digits). */
	"IE-HSE-HOSP": { prefix: "h", pattern: /^[1-9]\d{8}$/ },
	/** Health centres of the HSE's Health Atlas layer: derived (nine digits). */
	"IE-HSE-HC": { prefix: "c", pattern: /^[1-9]\d{8}$/ },
} as const;

export type IeIdScheme = keyof typeof IE_ID_SCHEMES;

const IE_SCHEMES = Object.keys(IE_ID_SCHEMES) as IeIdScheme[];

/** True when `value` is a key of the Irish scheme (syntax only: the facility may not exist). */
export function isValidIeSourceId(scheme: string, value: string): boolean {
	const entry = IE_ID_SCHEMES[scheme as IeIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of an Irish page as its URL ends (`p10000612`, `n738`, `h123456789`). */
export function ieUrlKey(scheme: IeIdScheme, nationalId: string): string {
	return `${IE_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of an Irish facility page: `{name}-{key}`
 * (`example-pharmacy-p10000612`), the síneadh fada dropped (`dun-laoghaire`), as Irish URLs
 * write it.
 */
export function ieFacilitySlug(name: string, scheme: IeIdScheme, nationalId: string): string {
	const key = ieUrlKey(scheme, nationalId);
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type IeFacilityKey = { idScheme: IeIdScheme; nationalId: string };

/** Reads an Irish key as its page URL ends (`p10000612`, `N738`): the scheme and the key. */
export function parseIeKey(token: string): IeFacilityKey | null {
	const match = /^([a-z])(\d{1,10})$/.exec(token.toLowerCase());
	if (!match) return null;
	const [, prefix = "", nationalId = ""] = match;
	const idScheme = IE_SCHEMES.find((scheme) => IE_ID_SCHEMES[scheme].prefix === prefix);
	if (!idScheme || !IE_ID_SCHEMES[idScheme].pattern.test(nationalId)) return null;
	return { idScheme, nationalId };
}

export type IeFacilitySegment = IeFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of an Irish page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseIeFacilitySegment(segment: string): IeFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseIeKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Finnish identifiers. A service location (palvelupiste, "toimipiste") of the national Finnish
 * Service Catalogue (Suomi.fi-palvelutietovaranto, PTV, run by the Digital and Population Data
 * Services Agency) is keyed by its service channel id, the catalogue's permanent UUID of the
 * location, written as 32 lower-case hexadecimal digits without dashes
 * (`b18aa7f87eca4b97a8e8b438d2e29427`). A page URL ends with it after the location's name
 * (`lapuan-sosiaali-ja-terveyskeskus-b18aa7f87eca4b97a8e8b438d2e29427`). No business id is used:
 * every location belongs to a public organiser, never to a person.
 */
export const FI_ID_SCHEMES = {
	/** A service location of the Finnish Service Catalogue: its channel id, without dashes. */
	"FI-PTV": { prefix: "", pattern: /^[0-9a-f]{32}$/ },
} as const;

export type FiIdScheme = keyof typeof FI_ID_SCHEMES;

/** True when `value` is a key of the Finnish scheme (syntax only: the location may not exist). */
export function isValidFiSourceId(scheme: string, value: string): boolean {
	const entry = FI_ID_SCHEMES[scheme as FiIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/**
 * The key of a PTV service channel id as Apercura stores it and a page URL ends with it
 * (`B18AA7F8-7ECA-4B97-A8E8-B438D2E29427` → `b18aa7f87eca4b97a8e8b438d2e29427`); null when it is
 * not a UUID.
 */
export function fiPtvKey(channelId: string): string | null {
	const key = channelId.trim().toLowerCase().replace(/-/g, "");
	return FI_ID_SCHEMES["FI-PTV"].pattern.test(key) ? key : null;
}

/** A stored key in the catalogue's own UUID form (`b18aa7f8-7eca-4b97-a8e8-b438d2e29427`). */
export function fiPtvChannelId(key: string): string {
	return `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20)}`;
}

/**
 * Canonical path segment of a Finnish page: `{name}-{key}`
 * (`lapuan-sosiaali-ja-terveyskeskus-b18aa7f87eca4b97a8e8b438d2e29427`), diacritics dropped
 * (`ä`, `ö`, `å` → `a`, `o`, `a`).
 */
export function fiFacilitySlug(name: string, nationalId: string): string {
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${nationalId}` : nationalId;
}

export type FiFacilityKey = { idScheme: FiIdScheme; nationalId: string };

/** Reads a Finnish key as its page URL ends (32 hexadecimal digits). Null for anything else. */
export function parseFiKey(token: string): FiFacilityKey | null {
	const lower = token.toLowerCase();
	return FI_ID_SCHEMES["FI-PTV"].pattern.test(lower)
		? { idScheme: "FI-PTV", nationalId: lower }
		: null;
}

export type FiFacilitySegment = FiFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Finnish page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseFiFacilitySegment(segment: string): FiFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseFiKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Slovenian identifiers: the health insurer (ZZZS) numbers every doctor of its lists of personal
 * doctors (`Šifra zdravnika`), the page's key, printed in the URL after `si` so a Slovenian
 * page's segment never reads as another market's (`/si/zdravnik/miran-kolar-si7774`). The
 * providers' numbers (`Šifra izvajalca`) key their practices, never a page.
 */
export const SI_ID_SCHEME = "SI-ZZZS";

/** True for a ZZZS doctor number: 1 to 8 digits, no leading 0 (syntax only). */
export function isValidSiSourceId(value: string): boolean {
	return /^[1-9]\d{0,7}$/.test(value);
}

/** Slovenian letters that do not decompose into a base letter and a mark (`đ` → `d`). */
const SLOVENIAN_LETTERS: Record<string, string> = { đ: "d", Đ: "D" };

/**
 * {@link slugify} for Slovenian text: `č`, `š`, `ž`, `ć` lose their marks (`Škofja Loka` →
 * `skofja-loka`), and `đ`, which has none to lose, is written `d` (`Đurić` → `duric`).
 */
export function slugifySl(text: string): string {
	return slugify(text.replace(/[đĐ]/g, (char) => SLOVENIAN_LETTERS[char] ?? char));
}

/**
 * Canonical path segment of a Slovenian doctor's page: `{ime-priimek}-si{number}`
 * (`miran-kolar-si7774`), diacritics dropped.
 */
export function siPractitionerSlug(
	firstName: string,
	lastName: string,
	nationalId: string,
): string {
	const key = `si${nationalId}`;
	const name = slugifySl(`${firstName} ${lastName}`).slice(0, 80).replace(/-+$/, "");
	return name ? `${name}-${key}` : key;
}

export type SiPractitionerSegment = {
	idScheme: typeof SI_ID_SCHEME;
	nationalId: string;
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Slovenian doctor's URL (`{ime-priimek}-si{number}`). Returns null
 * unless it ends with `si` and a valid ZZZS number, so invalid URLs never reach the database.
 */
export function parseSiPractitionerSegment(segment: string): SiPractitionerSegment | null {
	const match = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?si([1-9]\d{0,7})$/.exec(segment);
	if (!match) return null;
	return { idScheme: SI_ID_SCHEME, nationalId: match[2] ?? "", namePart: match[1] ?? "" };
}

/**
 * Cypriot identifiers: one scheme per publisher, so a list that fails to import keeps its rows.
 * A private pharmacy of the Pharmaceutical Services' list is keyed by the list's registration
 * number (ΑΜ, `1197`); the list's other identifying columns, the pharmacist's name and home
 * telephone number, are never read. A state hospital or health centre of the Ministry of
 * Health's lists, which number none, is keyed by ten hexadecimal digits the import derives from
 * its kind and its name as the list writes it (`3fa9c01b2e`): a renamed facility gets a new page.
 * A page URL ends with the key after a letter naming the publisher
 * (`farmakeio-ermou-51g-larnaka-f1197`, `geniko-nosokomeio-lefkosias-m3fa9c01b2e`), so the two
 * kinds never meet.
 */
export const CY_ID_SCHEMES = {
	/** A private pharmacy: its registration number in the Pharmaceutical Services' list (`1197`). */
	"CY-FARM": { prefix: "f", pattern: /^[1-9]\d{0,5}$/ },
	/** A state hospital or health centre: a key derived from its kind and name (`3fa9c01b2e`). */
	"CY-MOH": { prefix: "m", pattern: /^[0-9a-f]{10}$/ },
} as const;

export type CyIdScheme = keyof typeof CY_ID_SCHEMES;

const CY_SCHEMES = Object.keys(CY_ID_SCHEMES) as CyIdScheme[];

/** True when `value` is a key of the Cypriot scheme (syntax only: the facility may not exist). */
export function isValidCySourceId(scheme: string, value: string): boolean {
	const entry = CY_ID_SCHEMES[scheme as CyIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of a Cypriot page as its URL ends (`f1197`, `m3fa9c01b2e`). */
export function cyUrlKey(scheme: CyIdScheme, nationalId: string): string {
	return `${CY_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of a Cypriot page: `{name}-{key}`, the Greek name transliterated as
 * ELOT 743 writes it (`farmakeio-ermou-51g-larnaka-f1197`).
 */
export function cyFacilitySlug(name: string, scheme: CyIdScheme, nationalId: string): string {
	const key = cyUrlKey(scheme, nationalId);
	const base = slugifyEl(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type CyFacilityKey = { idScheme: CyIdScheme; nationalId: string };

/** Reads a Cypriot key as its page URL ends (`f1197`, `m3fa9c01b2e`). Null for anything else. */
export function parseCyKey(token: string): CyFacilityKey | null {
	const lower = token.toLowerCase();
	for (const idScheme of CY_SCHEMES) {
		const { prefix, pattern } = CY_ID_SCHEMES[idScheme];
		if (!lower.startsWith(prefix)) continue;
		const nationalId = lower.slice(prefix.length);
		if (pattern.test(nationalId)) return { idScheme, nationalId };
	}
	return null;
}

export type CyFacilitySegment = CyFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Cypriot page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseCyFacilitySegment(segment: string): CyFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseCyKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Latvian identifiers: one scheme per list, so a list that fails to import keeps its rows. A GP
 * practice is keyed by the medical institution's code in the Register of Medical Institutions
 * (ārstniecības iestādes kods, nine digits, as the National Health Service's list of GPs prints
 * it, leading zeros kept); a hospital by the Ministry of the Interior's id of its line in the list
 * of medical institutions' addresses (a hospital's sites and branches are lines of their own, and
 * some lines carry no institution code); a pharmacy by the State Agency of Medicines' number of
 * the place (`object_initial_id`), which its licence renewals keep. One institution can be a GP
 * practice and a hospital at once (a hospital whose GPs see patients there): two lists, two
 * schemes, two pages. The letter before the key names the list in a page URL
 * (`ilzes-paraugas-gimenes-arsta-prakse-g010000006`), so two lists' numbers never meet
 * (docs/data-import.md, "Latvia").
 */
export const LV_ID_SCHEMES = {
	/** A GP practice of the National Health Service's list: the institution's code. */
	"LV-GP": { prefix: "g", pattern: /^\d{9}$/ },
	/** A hospital of the Ministry of the Interior's list of institutions' addresses: its line's id. */
	"LV-SLIM": { prefix: "s", pattern: /^[1-9]\d{0,8}$/ },
	/** A pharmacy or pharmacy branch of the State Agency of Medicines' register: its number. */
	"LV-APT": { prefix: "a", pattern: /^[1-9]\d{0,8}$/ },
} as const;

export type LvIdScheme = keyof typeof LV_ID_SCHEMES;

const LV_SCHEMES = Object.keys(LV_ID_SCHEMES) as LvIdScheme[];

/** True when `value` is a key of the Latvian scheme (syntax only: the place may not exist). */
export function isValidLvSourceId(scheme: string, value: string): boolean {
	const entry = LV_ID_SCHEMES[scheme as LvIdScheme];
	return entry ? entry.pattern.test(value) : false;
}

/** The key of a Latvian page as its URL ends (`g010000006`, `a324`). */
export function lvUrlKey(scheme: LvIdScheme, nationalId: string): string {
	return `${LV_ID_SCHEMES[scheme].prefix}${nationalId}`;
}

/**
 * Canonical path segment of a Latvian page: `{name}-{key}`
 * (`ilzes-paraugas-gimenes-arsta-prakse-g010000006`, `paraugu-aptieka-a324`), Latvian
 * diacritics dropped (`ģ` → `g`, `ā` → `a`), as Latvian URLs write them.
 */
export function lvFacilitySlug(name: string, scheme: LvIdScheme, nationalId: string): string {
	const key = lvUrlKey(scheme, nationalId);
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type LvFacilityKey = { idScheme: LvIdScheme; nationalId: string };

/** Reads a Latvian key as its page URL ends (`g010000006`, `s8958`, `a324`). */
export function parseLvKey(token: string): LvFacilityKey | null {
	const match = /^([a-z])(\d{1,9})$/.exec(token.toLowerCase());
	if (!match) return null;
	const [, prefix = "", nationalId = ""] = match;
	const idScheme = LV_SCHEMES.find((scheme) => LV_ID_SCHEMES[scheme].prefix === prefix);
	if (!idScheme || !LV_ID_SCHEMES[idScheme].pattern.test(nationalId)) return null;
	return { idScheme, nationalId };
}

export type LvFacilitySegment = LvFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Latvian page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseLvFacilitySegment(segment: string): LvFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const key = parseLvKey(dash < 0 ? segment : segment.slice(dash + 1));
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}

/**
 * Swedish identifiers. A page is a facility of one of the Swedish lists, never a person:
 * - a pharmacy of the Swedish Medical Products Agency's register of licensed pharmacies
 *   (Läkemedelsverket, "Apotek med tillstånd"), keyed by its GLN (Global Location Number, GS1:
 *   thirteen digits, the last a modulus 10 check digit, `7312446003969`), which the register
 *   gives every licensed pharmacy;
 * - a health centre of a region's open list (Västra Götalandsregionen's "Vårdcentraler i Vårdval
 *   vårdcentral"), keyed by its HSA-id, the national directory's id of the care unit: `SE`, the
 *   ten-digit organisation number of the body that registered it, a dash and the unit's own part
 *   (`SE2321000131-E000000007600`).
 * A page URL ends with the key, a letter naming its list and the id without punctuation
 * (`apotek-hjartat-ica-maxi-olofstrom-a7312446000272`, `alepraktiken-v2321000131e000000007600`).
 */
export const SE_ID_SCHEMES = {
	/** A licensed pharmacy of Läkemedelsverket's register: its GLN. */
	"SE-GLN": { prefix: "a", pattern: /^\d{13}$/ },
	/** A care unit of the HSA directory listed by a region: its HSA-id. */
	"SE-HSA": { prefix: "v", pattern: /^SE\d{10}-[0-9A-Z]{1,24}$/ },
} as const;

export type SeIdScheme = keyof typeof SE_ID_SCHEMES;

/** True when `value` is a GLN: thirteen digits whose GS1 check digit matches (syntax only). */
export function isValidGln(value: string): boolean {
	if (!SE_ID_SCHEMES["SE-GLN"].pattern.test(value)) return false;
	let sum = 0;
	for (let index = 0; index < 12; index++) {
		sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
	}
	return (10 - (sum % 10)) % 10 === Number(value[12]);
}

/**
 * True when `value` is a Swedish organisation number (ten digits, `2321000131`) of a legal
 * person: a Luhn check digit and a third digit of 2 or more, which no personal identity number
 * has (its third and fourth digits are a month). A sole trader's number is the trader's personal
 * identity number and is refused.
 */
export function isValidSeLegalPersonNumber(value: string): boolean {
	if (!/^\d{10}$/.test(value) || Number(value[2]) < 2) return false;
	let sum = 0;
	for (let index = 0; index < 10; index++) {
		let digit = Number(value[index]) * (index % 2 === 0 ? 2 : 1);
		if (digit > 9) digit -= 9;
		sum += digit;
	}
	return sum % 10 === 0;
}

/** True when `value` is a key of the Swedish schemes (syntax and check digits only). */
export function isValidSeSourceId(scheme: string, value: string): boolean {
	if (scheme === "SE-GLN") return isValidGln(value);
	if (scheme === "SE-HSA") {
		return SE_ID_SCHEMES["SE-HSA"].pattern.test(value) && /^SE\d{10}/.test(value);
	}
	return false;
}

/** The key of a Swedish page as its URL ends (`a7312446003969`, `v2321000131e000000007600`). */
export function seUrlKey(scheme: SeIdScheme, nationalId: string): string {
	const { prefix } = SE_ID_SCHEMES[scheme];
	return scheme === "SE-HSA"
		? `${prefix}${nationalId.slice(2).replace("-", "").toLowerCase()}`
		: `${prefix}${nationalId}`;
}

/**
 * Canonical path segment of a Swedish facility page: `{name}-{key}`
 * (`apoteket-hjartat-a7312446003969`), `å`, `ä` written `a` and `ö` `o`, as Swedish URLs write
 * them.
 */
export function seFacilitySlug(name: string, scheme: SeIdScheme, nationalId: string): string {
	const key = seUrlKey(scheme, nationalId);
	const base = slugify(name).slice(0, 80).replace(/-+$/, "");
	return base ? `${base}-${key}` : key;
}

export type SeFacilityKey = { idScheme: SeIdScheme; nationalId: string };

/**
 * Reads a Swedish key as its page URL ends (`a7312446003969`, `V2321000131E000000007600`), or a
 * GLN or an HSA-id as typed (`7312446003969`, `SE2321000131-E000000007600`). Null for anything
 * else, a wrong GLN check digit included.
 */
export function parseSeKey(token: string): SeFacilityKey | null {
	const compact = token.replace(/\s+/g, "");
	const hsa = /^SE(\d{10})-([0-9A-Z]{1,24})$/i.exec(compact);
	if (hsa) return { idScheme: "SE-HSA", nationalId: `SE${hsa[1]}-${(hsa[2] ?? "").toUpperCase()}` };
	if (isValidGln(compact)) return { idScheme: "SE-GLN", nationalId: compact };
	const lower = compact.toLowerCase();
	const gln = /^a(\d{13})$/.exec(lower);
	if (gln) return gln[1] && isValidGln(gln[1]) ? { idScheme: "SE-GLN", nationalId: gln[1] } : null;
	const unit = /^v(\d{10})([0-9a-z]{1,24})$/.exec(lower);
	if (unit) {
		return { idScheme: "SE-HSA", nationalId: `SE${unit[1]}-${(unit[2] ?? "").toUpperCase()}` };
	}
	return null;
}

export type SeFacilitySegment = SeFacilityKey & {
	/** Name part before the key, possibly empty. */
	namePart: string;
};

/**
 * Parses the last segment of a Swedish page URL (`{name}-{key}`). Returns null unless it ends
 * with a valid key, so invalid URLs never reach the database.
 */
export function parseSeFacilitySegment(segment: string): SeFacilitySegment | null {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) return null;
	const dash = segment.lastIndexOf("-");
	const token = dash < 0 ? segment : segment.slice(dash + 1);
	if (!/^[av]/.test(token)) return null;
	const key = parseSeKey(token);
	if (!key) return null;
	return { ...key, namePart: dash < 0 ? "" : segment.slice(0, dash) };
}
