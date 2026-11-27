/**
 * Swedish taxonomy: the kinds of facility the Swedish market lists, mapped to Swedish listing
 * slugs (docs/adr/0002-multi-country.md, "Sweden").
 *
 * Sweden has no open national list of hospitals, clinics or health professionals (the IVO
 * register of care providers, the HSA directory and HOSP are not open data). The market lists
 * what is open:
 * - every licensed community pharmacy (öppenvårdsapotek) of the Swedish Medical Products
 *   Agency's register (Läkemedelsverket, "Apotek med tillstånd", CC BY 4.0), national;
 * - the health centres (vårdcentraler) of the regions that publish them under an open licence:
 *   Västra Götalandsregionen's "Vårdcentraler i Vårdval vårdcentral" (CC0 1.0) today, the
 *   other twenty regions as they open theirs.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Swedish, `å`, `ä` written `a` and `ö`
 * `o`, and never collide with another market's (tested): Norway's pharmacies are `apotek`, so
 * Sweden's listing is the definite plural, `apoteken`, and a pharmacy's kind the register's own
 * word, `oppenvardsapotek`.
 */

/** Licensed community pharmacies (öppenvårdsapotek) of Läkemedelsverket's register. */
export const SE_PHARMACY = "SE_PHARMACY";
/** Health centres (vårdcentraler) of a region's primary care choice scheme (vårdval). */
export const SE_HEALTH_CENTRE = "SE_HEALTH_CENTRE";

/** Profession codes of the Swedish facilities and their listing. */
export const SE_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[SE_HEALTH_CENTRE]: { slug: "vardcentraler", enabled: true },
	[SE_PHARMACY]: { slug: "apoteken", enabled: true },
};

export const SE_DEFAULT_PROFESSIONS = Object.keys(SE_PROFESSIONS);

/**
 * The kind of a facility in the singular, as its page and cards name it
 * (`taxonomy.profession.*`).
 */
export const SE_KIND_SLUGS: Readonly<Record<string, string>> = {
	[SE_HEALTH_CENTRE]: "vardcentral",
	[SE_PHARMACY]: "oppenvardsapotek",
};

/** Listing slug of a Swedish facility: its kind's (no specialty decides a listing). */
export function seListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return SE_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Swedish listing slug. */
export function allSeListingSlugs(): Set<string> {
	return new Set(Object.values(SE_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the Swedish labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allSeTaxonomySlugs(): Set<string> {
	return new Set([...allSeListingSlugs(), ...Object.values(SE_KIND_SLUGS)]);
}

const SE_LISTING_SLUGS: ReadonlySet<string> = allSeListingSlugs();

/**
 * First URL segments of the Swedish pages that can never be a listing slug: the Swedish route
 * segments of the market (`/se/verksamhet/…`, `/se/katalog`) and the technical ones.
 */
export const SE_RESERVED_SEGMENTS = [
	"verksamhet",
	"organisation",
	"katalog",
	"sok",
	"pro",
	"rdv",
	"api",
	"om",
	"open-source",
	"data",
	"tillganglighet",
	"integritet",
	"juridisk-information",
	"villkor",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Swedish listing page. */
export function isSeListingSlug(slug: string): boolean {
	return !(SE_RESERVED_SEGMENTS as readonly string[]).includes(slug) && SE_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`apoteken` → `SE_PHARMACY`), if any. */
export function seProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(SE_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a Swedish facility's profession (`SE_PHARMACY` → `oppenvardsapotek`), if any. */
export function seKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (SE_KIND_SLUGS[professionCode] ?? null) : null;
}
