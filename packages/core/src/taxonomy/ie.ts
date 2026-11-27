/**
 * Irish taxonomy: the kinds of facility Ireland's open registers list
 * (docs/adr/0002-multi-country.md, "Ireland"), each its own English listing:
 * - pharmacies: the retail pharmacy businesses of the Pharmaceutical Society of Ireland's
 *   register (Pharmacy Act 2007), published monthly;
 * - nursing homes: HIQA's register of designated centres for older people (Health Act 2007),
 *   the residential care settings the Chief Inspector of Social Services registers;
 * - hospitals: public, voluntary and private hospitals of the HSE's Health Atlas layer (a March
 *   2020 snapshot), each with its kind (general/acute, community, maternity, private…);
 * - health centres: the HSE's health centres of the same layer set, where its primary care,
 *   public health nursing and community services see people.
 *
 * An Irish page is a facility, never a person: the registers of doctors, nurses and pharmacists
 * cannot be downloaded or republished, and the names the open lists carry of people (a
 * pharmacy's superintendent pharmacist, a nursing home's person in charge, a registered
 * provider who is an individual, the HSE's GP layer) are never read. A hospital's kind is shown
 * on its page; it is not a listing of its own.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug. Ireland reads the English catalog the UK's pages read, so its pharmacies' slug is
 * the singular `pharmacy`, not the UK's `pharmacies`: a listing slug always names one market
 * (tested).
 */

/** Retail pharmacy businesses registered by the PSI. */
export const IE_PHARMACY = "IE_PHARMACY";
/** Designated centres for older people registered by HIQA (nursing homes). */
export const IE_NURSING_HOME = "IE_NURSING_HOME";
/** Hospitals of the HSE's Health Atlas (public, voluntary and private). */
export const IE_HOSPITAL = "IE_HOSPITAL";
/** Health centres of the HSE's Health Atlas. */
export const IE_HEALTH_CENTRE = "IE_HEALTH_CENTRE";

/** Profession codes of the Irish lists (kinds of facility) and their URL slugs. */
export const IE_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[IE_PHARMACY]: { slug: "pharmacy", enabled: true },
	[IE_NURSING_HOME]: { slug: "nursing-homes", enabled: true },
	[IE_HOSPITAL]: { slug: "hospitals", enabled: true },
	[IE_HEALTH_CENTRE]: { slug: "health-centres", enabled: true },
};

export const IE_DEFAULT_PROFESSIONS = [
	IE_PHARMACY,
	IE_NURSING_HOME,
	IE_HOSPITAL,
	IE_HEALTH_CENTRE,
] as const;

/**
 * The kinds of hospital of the HSE's Health Atlas layer (`subcategory`), as a page names them,
 * keyed by the layer's own value. A kind the layer adds later is shown as it is written.
 */
export const IE_HOSPITAL_KINDS: Readonly<Record<string, string>> = {
	"General/Acute": "General and acute hospital",
	Community: "Community hospital",
	"Private General": "Private hospital",
	"Mixed Use": "Mixed-use hospital",
	Maternity: "Maternity hospital",
	Paediatric: "Children's hospital",
	Orthopaedic: "Orthopaedic hospital",
	Dental: "Dental hospital",
	"Continuing Care Service": "Continuing care",
	"Psycho-Geriatric": "Psychiatry of later life",
	Rehabilitation: "Rehabilitation hospital",
	"Opthalmic/ENT": "Eye and ear hospital",
	"Mental Health": "Mental health hospital",
	Cancer: "Cancer hospital",
};

/** True for a kind of the HSE's layer that is a private hospital (`Private General`). */
export function isPrivateIeHospitalKind(subcategory: string | null | undefined): boolean {
	return (subcategory ?? "").trim().toLowerCase().startsWith("private");
}

/** Listing slug of an Irish facility: its kind's (`pharmacy`, `hospitals`). The lists name no specialty. */
export function ieListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return IE_PROFESSIONS[professionCode]?.slug ?? null;
}

const IE_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(IE_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Irish listing slug. */
export function allIeListingSlugs(): Set<string> {
	return new Set(IE_LISTING_SLUGS);
}

/**
 * First URL segments of the Irish pages that can never be a listing slug: the English route
 * segments of the market (`/ie/facility/…`, `/ie/directory`) and the technical ones.
 */
export const IE_RESERVED_SEGMENTS = [
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

/** True when `slug` can be served as an Irish listing page. */
export function isIeListingSlug(slug: string): boolean {
	return !(IE_RESERVED_SEGMENTS as readonly string[]).includes(slug) && IE_LISTING_SLUGS.has(slug);
}

/** The profession code of an Irish listing slug (`pharmacy` → `IE_PHARMACY`). */
export function ieProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(IE_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
