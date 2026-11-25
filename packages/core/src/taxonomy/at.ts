/**
 * Austrian health taxonomy: the specialty labels ("Fach") of the regional
 * doctors lists (Vienna, Styria) mapped to German listing slugs.
 *
 * Derived by hand from the `FACH` values of the two open datasets and from the
 * Ärztinnen-/Ärzte-Ausbildungsordnung 2015 (ÄAO 2015), which names the
 * specialties ("Sonderfächer") the lists use. Earlier names of the same field
 * (ÄAO 1994/2006: "Lungenkrankheiten", "Unfallchirurgie", "Psychiatrie und
 * Neurologie") share the slug of their current specialty where patients would
 * look for one listing.
 *
 * A source label is turned into a specialty code by `atSpecialtyCodeOf`, which
 * drops the Styrian `AM - ` (Ärztin/Arzt für Allgemeinmedizin) and `FA - `
 * (Fachärztin/Facharzt) prefixes, spells `u.` out as `und` and compares the
 * label without case, accents or punctuation. Codes are the slug of the
 * canonical label, so they read in the data (`innere-medizin-und-kardiologie`).
 *
 * Labels are not stored here: they live in the i18n catalogs under
 * `taxonomy.*`, keyed by listing slug, like the French ones. Any label missing
 * from these tables is reported by the import (`unknownSpecialties`).
 *
 * Listing slugs are German and never collide with a French one (tested), so a
 * listing slug always names one market.
 */
import { slugifyDe } from "../slugify";

/** Doctors (Ärztinnen und Ärzte): the Vienna, Styria and Salzburg lists. */
export const AT_DOCTOR = "ARZT";

/** Dentists (Zahnärztinnen und Zahnärzte): the Salzburg dentists list. */
export const AT_DENTIST = "ZAHNARZT";

/** Profession codes of the Austrian sources and their URL slugs. */
export const AT_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	// The listing of doctors without a specialty in the lists ("Approbierte Ärztin/Approbierter
	// Arzt", "unbekannt"). Never `arzt`: that is the first segment of a practitioner page.
	[AT_DOCTOR]: { slug: "aerzte", enabled: true },
	[AT_DENTIST]: { slug: "zahnaerzte", enabled: true },
};

export const AT_DEFAULT_PROFESSIONS = [AT_DOCTOR, AT_DENTIST] as const;

/**
 * Canonical specialty codes and their listing slugs. Several codes share one
 * slug when they are the same field for a patient (old and new names, the
 * general and the family-medicine titles of general practice).
 */
export const AT_SPECIALTIES: Readonly<Record<string, { slug: string }>> = {
	allgemeinmedizin: { slug: "allgemeinmedizin" },
	"allgemein-und-familienmedizin": { slug: "allgemeinmedizin" },
	"innere-medizin": { slug: "innere-medizin" },
	"innere-medizin-und-intensivmedizin": { slug: "innere-medizin" },
	"innere-medizin-und-kardiologie": { slug: "kardiologie" },
	"innere-medizin-und-pneumologie": { slug: "pneumologie" },
	lungenkrankheiten: { slug: "pneumologie" },
	"innere-medizin-und-gastroenterologie-und-hepatologie": { slug: "gastroenterologie" },
	"innere-medizin-und-endokrinologie-und-diabetologie": { slug: "endokrinologie" },
	"innere-medizin-und-haematologie-und-internistische-onkologie": {
		slug: "haematologie-und-onkologie",
	},
	"innere-medizin-und-angiologie": { slug: "angiologie" },
	"innere-medizin-und-infektiologie": { slug: "infektiologie" },
	"innere-medizin-und-rheumatologie": { slug: "rheumatologie" },
	"innere-medizin-und-nephrologie": { slug: "nephrologie" },
	"frauenheilkunde-und-geburtshilfe": { slug: "frauenheilkunde" },
	"allgemeinchirurgie-und-viszeralchirurgie": { slug: "chirurgie" },
	chirurgie: { slug: "chirurgie" },
	"allgemeinchirurgie-und-gefaesschirurgie": { slug: "gefaesschirurgie" },
	"orthopaedie-und-orthopaedische-chirurgie": { slug: "orthopaedie" },
	"orthopaedie-und-traumatologie": { slug: "orthopaedie" },
	unfallchirurgie: { slug: "unfallchirurgie" },
	"kinder-und-jugendheilkunde": { slug: "kinderheilkunde" },
	"kinder-und-jugendchirurgie": { slug: "kinderchirurgie" },
	"kinder-und-jugendpsychiatrie": { slug: "kinder-und-jugendpsychiatrie" },
	"kinder-und-jugendpsychiatrie-und-psychotherapeutische-medizin": {
		slug: "kinder-und-jugendpsychiatrie",
	},
	"haut-und-geschlechtskrankheiten": { slug: "dermatologie" },
	"augenheilkunde-und-optometrie": { slug: "augenheilkunde" },
	"psychiatrie-und-psychotherapeutische-medizin": { slug: "psychiatrie" },
	psychiatrie: { slug: "psychiatrie" },
	// The former combined specialty ("Nervenheilkunde"), listed under the field named first.
	"psychiatrie-und-neurologie": { slug: "psychiatrie" },
	"neurologie-und-psychiatrie": { slug: "neurologie" },
	neurologie: { slug: "neurologie" },
	"hals-nasen-und-ohrenheilkunde": { slug: "hals-nasen-ohrenheilkunde" },
	"hals-nasen-und-ohrenkrankheiten": { slug: "hals-nasen-ohrenheilkunde" },
	urologie: { slug: "urologie" },
	"plastische-rekonstruktive-und-aesthetische-chirurgie": { slug: "plastische-chirurgie" },
	"anaesthesiologie-und-intensivmedizin": { slug: "anaesthesiologie" },
	radiologie: { slug: "radiologie" },
	"physikalische-medizin-und-allgemeine-rehabilitation": { slug: "physikalische-medizin" },
	neurochirurgie: { slug: "neurochirurgie" },
	"medizinische-und-chemische-labordiagnostik": { slug: "labordiagnostik" },
	"mund-kiefer-und-gesichtschirurgie": { slug: "mund-kiefer-gesichtschirurgie" },
	nuklearmedizin: { slug: "nuklearmedizin" },
	"klinische-pathologie-und-molekularpathologie": { slug: "pathologie" },
	neuropathologie: { slug: "pathologie" },
	herzchirurgie: { slug: "herzchirurgie" },
	thoraxchirurgie: { slug: "thoraxchirurgie" },
	"strahlentherapie-radioonkologie": { slug: "strahlentherapie" },
	"klinische-mikrobiologie-und-hygiene": { slug: "mikrobiologie" },
	virologie: { slug: "mikrobiologie" },
	"medizinische-genetik": { slug: "medizinische-genetik" },
	arbeitsmedizin: { slug: "arbeitsmedizin" },
	"klinische-immunologie": { slug: "immunologie" },
	gerichtsmedizin: { slug: "gerichtsmedizin" },
	transfusionsmedizin: { slug: "transfusionsmedizin" },
	"spezifische-prophylaxe-und-tropenmedizin": { slug: "tropenmedizin" },
	physiologie: { slug: "physiologie" },
	"medizinische-leistungsphysiologie": { slug: "physiologie" },
	"pharmakologie-und-toxikologie": { slug: "pharmakologie" },
	anatomie: { slug: "anatomie" },
};

/**
 * Source labels that name no specialty: the doctor is listed under the
 * profession (`aerzte`). An "approbierte Ärztin" holds the licence to practise
 * from before the 2015 training reform, without a specialty title.
 */
const NO_SPECIALTY = new Set(["approbierte-r-aerzt-in", "approbierter-arzt", "unbekannt"]);

/** Spellings of the sources that are not the canonical label. */
const SPELLINGS: Readonly<Record<string, string>> = {
	"allgemein-medizin": "allgemeinmedizin",
	"allgemeinmedizin-und-familienmedizin": "allgemein-und-familienmedizin",
	"psychatrie-und-neurologie": "psychiatrie-und-neurologie",
	"plastische-aesthetische-und-rekonstruktive-chirurgie":
		"plastische-rekonstruktive-und-aesthetische-chirurgie",
	"allgemeine-chirurgie-und-viszeralchirurgie": "allgemeinchirurgie-und-viszeralchirurgie",
	"orthopaedie-und-traumalogie": "orthopaedie-und-traumatologie",
	"plastische-rekontruktive-und-aesthetische-chirurgie":
		"plastische-rekonstruktive-und-aesthetische-chirurgie",
};

/** Result of reading one source label. */
export type AtSpecialtyLabel =
	/** A known specialty. */
	| { kind: "specialty"; code: string }
	/** A doctor without a specialty title (listed under the profession). */
	| { kind: "none" }
	/** A label the tables do not know (reported by the import, listed under the profession). */
	| { kind: "unknown"; key: string };

/**
 * Reads a `FACH` value of the Vienna or Styria list. The `(ÄAO 1989)` and
 * similar training-regulation notes are dropped: they date the title, they do
 * not change the field.
 */
export function atSpecialtyCodeOf(raw: string | null | undefined): AtSpecialtyLabel {
	const text = (raw ?? "")
		.replace(/^\s*(?:AM|FA)\s*-\s*/i, "")
		.replace(/\((?:ÄAO|AAO)[^()]{0,40}\)/gi, "")
		.replace(/\bu\.\s*/g, "und ")
		.trim();
	const key = slugifyDe(text);
	if (key === "" || NO_SPECIALTY.has(key)) return { kind: "none" };
	const code = SPELLINGS[key] ?? key;
	return AT_SPECIALTIES[code] ? { kind: "specialty", code } : { kind: "unknown", key };
}

/** Specialty codes of general practice: a doctor with another specialty is listed under it. */
const GENERAL_PRACTICE = new Set(["allgemeinmedizin", "allgemein-und-familienmedizin"]);

/** True for the general-practice titles (Allgemeinmedizin, Allgemein- und Familienmedizin). */
export function isGeneralPractice(code: string | null | undefined): boolean {
	return !!code && GENERAL_PRACTICE.has(code);
}

/**
 * Listing slug of an Austrian doctor: the slug of the specialty, else the
 * profession's (`aerzte`).
 */
export function atListingSlugFor(
	professionCode: string,
	specialtyCode: string | null | undefined,
): string | null {
	const profession = AT_PROFESSIONS[professionCode];
	if (!profession) return null;
	if (specialtyCode && professionCode === AT_DOCTOR) {
		const specialty = AT_SPECIALTIES[specialtyCode];
		if (specialty) return specialty.slug;
	}
	return profession.slug;
}

/** Every Austrian listing slug. */
export function allAtListingSlugs(): Set<string> {
	const slugs = new Set<string>();
	for (const profession of Object.values(AT_PROFESSIONS)) slugs.add(profession.slug);
	for (const specialty of Object.values(AT_SPECIALTIES)) slugs.add(specialty.slug);
	return slugs;
}

const AT_LISTING_SLUGS: ReadonlySet<string> = allAtListingSlugs();

/**
 * First URL segments of the Austrian pages that can never be a listing slug:
 * the German route segments of the app (`/at/arzt/…`, `/at/verzeichnis`) and
 * the technical ones.
 */
export const AT_RESERVED_SEGMENTS = [
	"arzt",
	"einrichtung",
	"verzeichnis",
	"suche",
	"pro",
	"rdv",
	"api",
	"ueber-uns",
	"open-source",
	"daten",
	"barrierefreiheit",
	"datenschutz",
	"impressum",
	"nutzungsbedingungen",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as an Austrian listing page. */
export function isAtListingSlug(slug: string): boolean {
	return !(AT_RESERVED_SEGMENTS as readonly string[]).includes(slug) && AT_LISTING_SLUGS.has(slug);
}

/**
 * Picks the primary specialty of a doctor among the specialties of their
 * rows: a specialty other than general practice first (a specialist who is
 * also a general practitioner is looked for as the specialist), then the one
 * with the most rows (practice locations), then the code. Null when no row
 * names a known specialty.
 */
export function primaryAtSpecialty(codes: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const code of codes) if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
	const ranked = [...counts.entries()].sort(
		([a, countA], [b, countB]) =>
			Number(isGeneralPractice(a)) - Number(isGeneralPractice(b)) ||
			countB - countA ||
			(a < b ? -1 : a > b ? 1 : 0),
	);
	return ranked[0]?.[0] ?? null;
}
