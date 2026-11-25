/**
 * United Kingdom taxonomy: the kinds of NHS practices the open organisation data
 * lists (docs/adr/0002-multi-country.md, "United Kingdom"). The UK pages list
 * practices, not people: GP practices, dental practices and community
 * pharmacies, each from the open data of the nation that runs them (NHS England's
 * Organisation Data Service for England and Wales, Public Health Scotland, the
 * Business Services Organisation in Northern Ireland). Individual clinicians are
 * not open data (the GMC register needs a licence), so there is no specialty.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`,
 * keyed by listing slug, like the French and Austrian ones. Listing slugs are
 * English and never collide with a French or Austrian one (tested), so a listing
 * slug always names one market.
 */

/** GP practices (general practice surgeries, NHS GP contracts). */
export const GB_GP_PRACTICE = "GB_GP";

/** Dental practices providing NHS dentistry. */
export const GB_DENTAL_PRACTICE = "GB_DENTAL";

/** Community pharmacies on the NHS pharmaceutical lists. */
export const GB_PHARMACY = "GB_PHARMACY";

/** Profession codes of the UK sources (kinds of practice) and their URL slugs. */
export const GB_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[GB_GP_PRACTICE]: { slug: "gp-practices", enabled: true },
	[GB_DENTAL_PRACTICE]: { slug: "dental-practices", enabled: true },
	[GB_PHARMACY]: { slug: "pharmacies", enabled: true },
};

export const GB_DEFAULT_PROFESSIONS = [GB_GP_PRACTICE, GB_DENTAL_PRACTICE, GB_PHARMACY] as const;

/** Listing slug of a UK practice: its kind's (`gp-practices`). The sources name no specialty. */
export function gbListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return GB_PROFESSIONS[professionCode]?.slug ?? null;
}

const GB_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(GB_PROFESSIONS).map((profession) => profession.slug),
);

/** Every UK listing slug. */
export function allGbListingSlugs(): Set<string> {
	return new Set(GB_LISTING_SLUGS);
}

/**
 * First URL segments of the UK pages that can never be a listing slug: the English
 * route segments of the app (`/gb/practice/…`, `/gb/directory`) and the technical
 * ones.
 */
export const GB_RESERVED_SEGMENTS = [
	"practice",
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

/** True when `slug` can be served as a UK listing page. */
export function isGbListingSlug(slug: string): boolean {
	return !(GB_RESERVED_SEGMENTS as readonly string[]).includes(slug) && GB_LISTING_SLUGS.has(slug);
}

/** The profession code of a UK listing slug (`gp-practices` -> `GB_GP`). */
export function gbProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(GB_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
