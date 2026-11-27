/**
 * Latvian taxonomy: the kinds of place the Latvian market lists, mapped to Latvian listing slugs
 * (docs/adr/0002-multi-country.md, "Latvia").
 *
 * A Latvian page is a place of care: a GP practice of the National Health Service's quarterly
 * list (Nacionālais veselības dienests, "Ģimenes ārsta praksē reģistrēto pacientu skaits"), at the
 * address the Ministry of the Interior's list of medical institutions gives it; a hospital of that
 * list; or a pharmacy or pharmacy branch of the State Agency of Medicines' register. Its kind is
 * its profession code (`LV_GP_PRACTICE`, `LV_HOSPITAL`, `LV_PHARMACY`). The lists name no
 * specialty.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by listing
 * slug (`taxonomy.listing.aptiekas` "Aptiekas", `taxonomy.profession.aptiekas` "Aptieka", the
 * kind in the singular), like the UK's and Italy's. Listing slugs are Latvian without diacritics,
 * and never collide with another market's (tested).
 */

/** GP practices (ģimenes ārstu prakses) contracted by the National Health Service. */
export const LV_GP_PRACTICE = "LV_GP_PRACTICE";
/** Hospitals and their branches (slimnīcas) of the Ministry of the Interior's list. */
export const LV_HOSPITAL = "LV_HOSPITAL";
/** General pharmacies and pharmacy branches (vispārēja tipa aptiekas un to filiāles). */
export const LV_PHARMACY = "LV_PHARMACY";

/** Profession codes of the Latvian places and their listing. */
export const LV_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[LV_GP_PRACTICE]: { slug: "gimenes-arstu-prakses", enabled: true },
	[LV_HOSPITAL]: { slug: "slimnicas", enabled: true },
	[LV_PHARMACY]: { slug: "aptiekas", enabled: true },
};

export const LV_DEFAULT_PROFESSIONS = Object.keys(LV_PROFESSIONS);

/** Listing slug of a Latvian place: its kind's (the lists name no specialty). */
export function lvListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return LV_PROFESSIONS[professionCode]?.slug ?? null;
}

const LV_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(LV_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Latvian listing slug. */
export function allLvListingSlugs(): Set<string> {
	return new Set(LV_LISTING_SLUGS);
}

/**
 * First URL segments of the Latvian pages that can never be a listing slug: the Latvian route
 * segments of the market (`/lv/iestade/…`, `/lv/katalogs`) and the technical ones.
 */
export const LV_RESERVED_SEGMENTS = [
	"iestade",
	"organizacija",
	"katalogs",
	"meklet",
	"par-projektu",
	"dati",
	"pieklustamiba",
	"privatums",
	"juridiska-informacija",
	"lietosanas-noteikumi",
	"pro",
	"rdv",
	"api",
	"open-source",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Latvian listing page. */
export function isLvListingSlug(slug: string): boolean {
	return !(LV_RESERVED_SEGMENTS as readonly string[]).includes(slug) && LV_LISTING_SLUGS.has(slug);
}

/** The profession code of a Latvian listing slug (`aptiekas` → `LV_PHARMACY`). */
export function lvProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(LV_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
