/**
 * Cypriot taxonomy: the kinds of facility the Cypriot market lists, mapped to Greek listing
 * slugs written in Latin letters (docs/adr/0002-multi-country.md, "Cyprus").
 *
 * A Cypriot page is a facility of one of the Ministry of Health's open lists on data.gov.cy:
 * a state hospital ("Κατάλογος Κρατικών Νοσοκομείων Κύπρου"), a state health centre ("Κατάλογος
 * Κρατικών Κέντρων Υγείας Κύπρου") or a private pharmacy (the Pharmaceutical Services' "Κατάλογος
 * Ιδιωτικών Φαρμακείων"). The list a facility comes from is its kind: no field of the lists is
 * read to tell one kind from another.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are the Greek words transliterated as
 * ELOT 743 writes them (`nosokomeia`, `kentra-ygeias`, `farmakeia`) and never collide with
 * another market's (tested). A kind's slug is the singular (`farmakeio`), a key only.
 */

/** The state hospitals of the Ministry of Health's list (general, rural and district hospitals). */
export const CY_HOSPITAL = "CY_HOSPITAL";
/** The state health centres (Κέντρα Υγείας) of the Ministry of Health's list: primary care. */
export const CY_HEALTH_CENTRE = "CY_HEALTH_CENTRE";
/** The private pharmacies of the Pharmaceutical Services' list. */
export const CY_PHARMACY = "CY_PHARMACY";

/** Profession codes of the Cypriot facilities and their listing. */
export const CY_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[CY_HOSPITAL]: { slug: "nosokomeia", enabled: true },
	[CY_HEALTH_CENTRE]: { slug: "kentra-ygeias", enabled: true },
	[CY_PHARMACY]: { slug: "farmakeia", enabled: true },
};

export const CY_DEFAULT_PROFESSIONS = Object.keys(CY_PROFESSIONS);

/** The kind of a facility in the singular, as its page and cards name it (`taxonomy.profession.*`). */
export const CY_KIND_SLUGS: Readonly<Record<string, string>> = {
	[CY_HOSPITAL]: "nosokomeio",
	[CY_HEALTH_CENTRE]: "kentro-ygeias",
	[CY_PHARMACY]: "farmakeio",
};

/** Listing slug of a Cypriot facility: its kind's (no specialty decides a listing). */
export function cyListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return CY_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Cypriot listing slug. */
export function allCyListingSlugs(): Set<string> {
	return new Set(Object.values(CY_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the Cypriot labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allCyTaxonomySlugs(): Set<string> {
	return new Set([...allCyListingSlugs(), ...Object.values(CY_KIND_SLUGS)]);
}

const CY_LISTING_SLUGS: ReadonlySet<string> = allCyListingSlugs();

/**
 * First URL segments of the Cypriot pages that can never be a listing slug: the Greek route
 * segments of the market (`/cy/monada/…`, `/cy/katalogos`) and the technical ones.
 */
export const CY_RESERVED_SEGMENTS = [
	"monada",
	"foreas",
	"katalogos",
	"anazitisi",
	"pro",
	"rdv",
	"api",
	"schetika",
	"open-source",
	"dedomena",
	"prosvasimotita",
	"aporrito",
	"nomiki-dilosi",
	"oroi-chrisis",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Cypriot listing page. */
export function isCyListingSlug(slug: string): boolean {
	return !(CY_RESERVED_SEGMENTS as readonly string[]).includes(slug) && CY_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`farmakeia` → `CY_PHARMACY`), if any. */
export function cyProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(CY_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a Cypriot facility's profession (`CY_PHARMACY` → `farmakeio`), if any. */
export function cyKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (CY_KIND_SLUGS[professionCode] ?? null) : null;
}
