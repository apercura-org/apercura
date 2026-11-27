/**
 * Maltese taxonomy: the one kind of facility Malta's open data lists
 * (docs/adr/0002-multi-country.md, "Malta"):
 * - community pharmacies: the pharmacies the Medicines Authority licenses to serve the public
 *   (its register's types "Community Pharmacies" and "Community and Medical Oxygen Pharmacy"),
 *   in Malta and Gozo.
 *
 * The register also lists hospital in-patient pharmacies, the pharmacies of government
 * entities (health centres, the Armed Forces, Sedqa), medical-oxygen dispensaries and a
 * parenteral-nutrition dispensary: none serves the public at a counter, so none is listed
 * (docs/data-requests/mt.md). No open list of Malta's hospitals, health centres or practices
 * was found, and the Medical Council's registers of doctors and dentists are not republished
 * without its written confirmation: a Maltese page is a pharmacy, never a person.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug. Malta reads the English catalog the UK's and Ireland's pages read, so its slug
 * is `community-pharmacies`, not the UK's `pharmacies` nor Ireland's `pharmacy`: a listing slug
 * always names one market (tested).
 */

/** Community pharmacies licensed by the Medicines Authority. */
export const MT_PHARMACY = "MT_PHARMACY";

/** The register's types of pharmacy that serve the public, as it writes them. */
export const MT_COMMUNITY_TYPES: readonly string[] = [
	"Community Pharmacies",
	"Community and Medical Oxygen Pharmacy",
];

/** Profession codes of the Maltese list (kinds of facility) and their URL slugs. */
export const MT_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[MT_PHARMACY]: { slug: "community-pharmacies", enabled: true },
};

export const MT_DEFAULT_PROFESSIONS = [MT_PHARMACY] as const;

/** Listing slug of a Maltese facility: its kind's (`community-pharmacies`). The list names no specialty. */
export function mtListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return MT_PROFESSIONS[professionCode]?.slug ?? null;
}

const MT_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(MT_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Maltese listing slug. */
export function allMtListingSlugs(): Set<string> {
	return new Set(MT_LISTING_SLUGS);
}

/**
 * First URL segments of the Maltese pages that can never be a listing slug: the English route
 * segments of the market (`/mt/facility/…`, `/mt/directory`) and the technical ones.
 */
export const MT_RESERVED_SEGMENTS = [
	"facility",
	"establishment",
	"directory",
	"search",
	"pro",
	"rdv",
	"api",
	"about",
	"open-source",
	"data",
	"accessibility",
	"privacy",
	"legal-notice",
	"terms",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Maltese listing page. */
export function isMtListingSlug(slug: string): boolean {
	return !(MT_RESERVED_SEGMENTS as readonly string[]).includes(slug) && MT_LISTING_SLUGS.has(slug);
}

/** The profession code of a Maltese listing slug (`community-pharmacies` → `MT_PHARMACY`). */
export function mtProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(MT_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
