/**
 * Italian taxonomy: the kinds of place the open data of the Ministry of Health lists
 * (docs/adr/0002-multi-country.md, "Italy"), each its own Italian listing:
 * - pharmacies open to the public, with their branches and dispensaries (the ministry's
 *   "Farmacie" dataset, from the drug traceability system);
 * - parapharmacies, the shops other than pharmacies allowed to sell non-prescription
 *   medicines (art. 5 of D.L. 223/2006, the "Parafarmacie" dataset);
 * - hospitals, public or assimilated (hospital trusts, directly run hospitals, IRCCS,
 *   university hospitals, classified hospitals), and the accredited private clinics (case di
 *   cura), from the ministry's yearly hospital bed counts per facility.
 *
 * An Italian page is a place, never a person: the lists name no health worker, and the
 * regional lists of family doctors are not imported. A pharmacy's type (ordinary, branch,
 * dispensary, seasonal dispensary) and a hospital's type and areas of inpatient care (acute,
 * rehabilitation, long-term) are shown on its page; none of them is a listing of its own.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Italian, without diacritics, and
 * never collide with another market's (tested), so a listing slug always names one market.
 */

/** Pharmacies open to the public, their branches and dispensaries. */
export const IT_PHARMACY = "IT_PHARMACY";
/** Parapharmacies (esercizi commerciali allowed to sell non-prescription medicines). */
export const IT_PARAPHARMACY = "IT_PARAPHARMACY";
/** Public and assimilated hospitals, IRCCS and university hospitals. */
export const IT_HOSPITAL = "IT_HOSPITAL";
/** Accredited private clinics (case di cura private accreditate). */
export const IT_CLINIC = "IT_CLINIC";

/** Profession codes of the Italian lists (kinds of place) and their URL slugs. */
export const IT_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[IT_PHARMACY]: { slug: "farmacie", enabled: true },
	[IT_PARAPHARMACY]: { slug: "parafarmacie", enabled: true },
	[IT_HOSPITAL]: { slug: "ospedali", enabled: true },
	[IT_CLINIC]: { slug: "case-di-cura", enabled: true },
};

export const IT_DEFAULT_PROFESSIONS = [
	IT_PHARMACY,
	IT_PARAPHARMACY,
	IT_HOSPITAL,
	IT_CLINIC,
] as const;

/**
 * The pharmacy types of the ministry's list (`codice_tipologia`), as its page names them.
 * Every one is a pharmacy's page: a branch (succursale) or a dispensary is where patients get
 * their medicines too.
 */
export const IT_PHARMACY_TYPES: Readonly<Record<string, string>> = {
	"1": "Farmacia ordinaria",
	"2": "Farmacia succursale",
	"3": "Dispensario farmaceutico",
	"4": "Dispensario stagionale",
};

/**
 * The kind of a hospital bed counts' row, from its facility type (`Codice tipo struttura`,
 * `Descrizione tipo struttura`): the accredited private clinics (`5.1`, "Casa di cura privata
 * accreditata") are case di cura; every other type (`0` hospital trusts, `1` directly run
 * hospitals, `2.x` university hospitals, `3.x` IRCCS, `4` classified hospitals, `8` qualified
 * institutes of a local health unit, `9` research bodies) is a hospital. Null when the row names
 * no type.
 */
export function itFacilityKindOf(typeCode: string, typeLabel: string): string | null {
	const code = typeCode.trim();
	const label = typeLabel.trim().toLowerCase();
	if (!code && !label) return null;
	return code.startsWith("5") || label.startsWith("casa di cura") ? IT_CLINIC : IT_HOSPITAL;
}

/** The areas of inpatient care of the bed counts (`Tipo di Disciplina`), as a page names them. */
export const IT_CARE_AREAS: Readonly<Record<string, string>> = {
	ACUTI: "Acuti",
	RIABILITAZIONE: "Riabilitazione",
	LUNGODEGENZA: "Lungodegenza",
};

/** Listing slug of an Italian place: its kind's (`farmacie`). The lists name no specialty. */
export function itListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return IT_PROFESSIONS[professionCode]?.slug ?? null;
}

const IT_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(IT_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Italian listing slug. */
export function allItListingSlugs(): Set<string> {
	return new Set(IT_LISTING_SLUGS);
}

/**
 * First URL segments of the Italian pages that can never be a listing slug: the Italian route
 * segments of the market (`/it/struttura/…`, `/it/elenco`) and the technical ones.
 */
export const IT_RESERVED_SEGMENTS = [
	"struttura",
	"organizzazione",
	"elenco",
	"cerca",
	"pro",
	"rdv",
	"api",
	"chi-siamo",
	"open-source",
	"dati",
	"accessibilita",
	"privacy",
	"note-legali",
	"condizioni",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as an Italian listing page. */
export function isItListingSlug(slug: string): boolean {
	return !(IT_RESERVED_SEGMENTS as readonly string[]).includes(slug) && IT_LISTING_SLUGS.has(slug);
}

/** The profession code of an Italian listing slug (`farmacie` → `IT_PHARMACY`). */
export function itProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(IT_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
