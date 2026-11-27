/**
 * Norwegian taxonomy: the kinds of establishment the Norwegian market lists, mapped to Norwegian
 * (Bokmål) listing slugs (docs/adr/0002-multi-country.md, "Norway").
 *
 * A Norwegian page is an establishment (underenhet) of the Brønnøysund Register Centre's Central
 * Coordinating Register for Legal Entities (Enhetsregisteret), told by the main industry code it
 * registered (Standard for næringsgruppering, SN2025, Statistics Norway's version of NACE):
 * somatic hospitals, psychiatric hospitals and specialised addiction treatment, general practice
 * (an emergency clinic, legevakt, by its name), specialist medical practice, dental practice,
 * nursing homes and pharmacies. An industry code is the unit's own declaration, not a licence:
 * the import keeps an establishment only when its name and owner read as a place of care
 * (`packages/etl/src/sources/no/filters.ts`).
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Norwegian, `ø` written `o`, and never
 * collide with another market's (tested). Where Norwegian writes the plural as the singular
 * (`sykehus`, `sykehjem`, `apotek`), the kind's slug is the definite form, a key only.
 */

/** Somatic hospitals (86.101): the health trusts' hospitals and private hospitals. */
export const NO_HOSPITAL = "NO_HOSPITAL";
/**
 * Psychiatric hospitals and specialised addiction treatment (86.102, 86.103, 86.104): district
 * psychiatric centres (DPS), child and adolescent psychiatry (BUP), addiction treatment (TSB).
 */
export const NO_MENTAL_HEALTH = "NO_MENTAL_HEALTH";
/** General practice (86.210): GP offices and medical centres (legekontor, legesenter). */
export const NO_GP = "NO_GP";
/** Emergency primary care (86.210, named legevakt): the municipalities' out-of-hours clinics. */
export const NO_EMERGENCY = "NO_EMERGENCY";
/** Specialist medical practice (86.221, 86.222): private specialists and outpatient centres. */
export const NO_SPECIALIST = "NO_SPECIALIST";
/** Dental practice (86.230): private dental clinics and the county public dental service. */
export const NO_DENTAL = "NO_DENTAL";
/** Nursing homes (87.102): sykehjem, most of them run by the municipalities. */
export const NO_NURSING_HOME = "NO_NURSING_HOME";
/** Pharmacies (47.730): community pharmacies and hospital pharmacies open to the public. */
export const NO_PHARMACY = "NO_PHARMACY";

/** Profession codes of the Norwegian establishments and their listing. */
export const NO_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[NO_HOSPITAL]: { slug: "sykehus", enabled: true },
	[NO_MENTAL_HEALTH]: { slug: "psykisk-helsevern", enabled: true },
	[NO_GP]: { slug: "legekontorer", enabled: true },
	[NO_EMERGENCY]: { slug: "legevakter", enabled: true },
	[NO_SPECIALIST]: { slug: "legespesialister", enabled: true },
	[NO_DENTAL]: { slug: "tannklinikker", enabled: true },
	[NO_NURSING_HOME]: { slug: "sykehjem", enabled: true },
	[NO_PHARMACY]: { slug: "apotek", enabled: true },
};

export const NO_DEFAULT_PROFESSIONS = Object.keys(NO_PROFESSIONS);

/**
 * The kind of an establishment in the singular, as its page and cards name it
 * (`taxonomy.profession.*`).
 */
export const NO_KIND_SLUGS: Readonly<Record<string, string>> = {
	[NO_HOSPITAL]: "sykehuset",
	[NO_MENTAL_HEALTH]: "psykisk-helsevern-institusjon",
	[NO_GP]: "legekontor",
	[NO_EMERGENCY]: "legevakt",
	[NO_SPECIALIST]: "spesialistpraksis",
	[NO_DENTAL]: "tannklinikk",
	[NO_NURSING_HOME]: "sykehjemmet",
	[NO_PHARMACY]: "apoteket",
};

/**
 * The industry codes (SN2025) the import reads, and the kind each lists as. General practice
 * (86.210) lists as emergency primary care when the establishment is named a legevakt.
 */
export const NO_INDUSTRY_KINDS: Readonly<Record<string, string>> = {
	"86.101": NO_HOSPITAL,
	"86.102": NO_MENTAL_HEALTH,
	"86.103": NO_MENTAL_HEALTH,
	"86.104": NO_MENTAL_HEALTH,
	"86.210": NO_GP,
	"86.221": NO_SPECIALIST,
	"86.222": NO_SPECIALIST,
	"86.230": NO_DENTAL,
	"87.102": NO_NURSING_HOME,
	"47.730": NO_PHARMACY,
};

/** An emergency clinic's name (`Valdres legevakt`, `Legevakten i Bergen`), not a dental one's. */
const EMERGENCY_NAME = /(?<!tann)legevakt/i;

/**
 * The kind of an establishment from its main industry code and its name, or null when the code
 * is not one the market lists.
 */
export function noKindOf(industryCode: string, name: string): string | null {
	const kind = NO_INDUSTRY_KINDS[industryCode] ?? null;
	if (kind === NO_GP && EMERGENCY_NAME.test(name)) return NO_EMERGENCY;
	return kind;
}

/** Listing slug of a Norwegian establishment: its kind's (no specialty decides a listing). */
export function noListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return NO_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Norwegian listing slug. */
export function allNoListingSlugs(): Set<string> {
	return new Set(Object.values(NO_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the Norwegian labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allNoTaxonomySlugs(): Set<string> {
	return new Set([...allNoListingSlugs(), ...Object.values(NO_KIND_SLUGS)]);
}

const NO_LISTING_SLUGS: ReadonlySet<string> = allNoListingSlugs();

/**
 * First URL segments of the Norwegian pages that can never be a listing slug: the Norwegian
 * route segments of the market (`/no/virksomhet/…`, `/no/katalog`) and the technical ones.
 */
export const NO_RESERVED_SEGMENTS = [
	"virksomhet",
	"organisasjon",
	"katalog",
	"sok",
	"pro",
	"rdv",
	"api",
	"om",
	"open-source",
	"data",
	"tilgjengelighet",
	"personvern",
	"juridisk",
	"vilkar",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Norwegian listing page. */
export function isNoListingSlug(slug: string): boolean {
	return !(NO_RESERVED_SEGMENTS as readonly string[]).includes(slug) && NO_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`apotek` → `NO_PHARMACY`), if any. */
export function noProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(NO_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a Norwegian establishment's profession (`NO_PHARMACY` → `apoteket`), if any. */
export function noKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (NO_KIND_SLUGS[professionCode] ?? null) : null;
}
