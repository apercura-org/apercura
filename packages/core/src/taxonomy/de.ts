/**
 * German taxonomy: the kinds of facility the German market lists, mapped to German listing slugs
 * (docs/adr/0002-multi-country.md, "Germany").
 *
 * A German page is a facility: a hospital site or a prevention or rehabilitation clinic of the
 * statistical offices' directory (Destatis, "Verzeichnis der Krankenhäuser und Vorsorge- oder
 * Rehabilitationseinrichtungen"), or a pharmacy of a Land that publishes its pharmacies as open
 * data. Its kind is its profession code (`DE_HOSPITAL`, `DE_PHARMACY`…). A hospital whose every
 * department (Fachabteilung, the § 301 SGB V codes of the directory: `2900` Allgemeine
 * Psychiatrie) is psychiatric or psychosomatic lists with the psychiatric hospitals, one whose
 * every department is a children's one with the children's hospitals, any other with the
 * hospitals; a site the directory gives no department (a day clinic, an outpatient clinic) is
 * told by its name. Every department is shown on the page.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are German, umlauts spelled out, and never
 * collide with another market's (tested), Austria's German ones included.
 */

/** Hospitals (the directory's general and specialised hospitals, university hospitals included). */
export const DE_HOSPITAL = "DE_HOSPITAL";
/** Hospitals for psychiatry, psychosomatics and psychotherapy, their day and outpatient clinics. */
export const DE_PSYCHIATRIC_HOSPITAL = "DE_PSYCHIATRIC_HOSPITAL";
/** Children's hospitals (paediatrics, neonatology, paediatric cardiology and surgery). */
export const DE_CHILDRENS_HOSPITAL = "DE_CHILDRENS_HOSPITAL";
/** Prevention and rehabilitation clinics (Vorsorge- oder Rehabilitationseinrichtungen). */
export const DE_REHAB_CLINIC = "DE_REHAB_CLINIC";
/** Public pharmacies (öffentliche Apotheken), main pharmacies and branches. */
export const DE_PHARMACY = "DE_PHARMACY";

/** Profession codes of the German facilities and their listing. */
export const DE_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[DE_HOSPITAL]: { slug: "krankenhaeuser", enabled: true },
	[DE_PSYCHIATRIC_HOSPITAL]: { slug: "psychiatrische-kliniken", enabled: true },
	[DE_CHILDRENS_HOSPITAL]: { slug: "kinderkliniken", enabled: true },
	[DE_REHAB_CLINIC]: { slug: "reha-kliniken", enabled: true },
	[DE_PHARMACY]: { slug: "apotheken", enabled: true },
};

export const DE_DEFAULT_PROFESSIONS = Object.keys(DE_PROFESSIONS);

/**
 * The kind of a facility in the singular, as its page and cards name it
 * (`taxonomy.profession.*`).
 */
export const DE_KIND_SLUGS: Readonly<Record<string, string>> = {
	[DE_HOSPITAL]: "krankenhaus",
	[DE_PSYCHIATRIC_HOSPITAL]: "psychiatrische-klinik",
	[DE_CHILDRENS_HOSPITAL]: "kinderklinik",
	[DE_REHAB_CLINIC]: "reha-klinik",
	[DE_PHARMACY]: "apotheke",
};

/** Psychiatric and psychosomatic departments: `29xx`, `30xx` (children and adolescents), `31xx`. */
const PSYCHIATRIC_DEPARTMENT = /^(?:29|30|31)\d{2}$/;

/** Children's departments: paediatrics (`10xx`), paediatric cardiology, neonatology, paediatric surgery. */
const CHILDRENS_DEPARTMENT = /^(?:1[0-3]\d{2}|3610)$/;

/** A site name that says psychiatry or psychosomatics (`Psychiatrische Institutsambulanz`, `KJP`). */
const PSYCHIATRIC_NAME =
	/psychiatr|psychosomat|psychotherap|seelische gesundheit|nervenklinik|suchtmedizin|suchtkrank|\bKJP\b|\bPIA\b|institutsambulanz/i;

/** A site name that says children's hospital. */
const CHILDRENS_NAME =
	/kinderklinik|kinderkrankenhaus|kinderhospital|kinderspital|klinik für kinder|kinder- und jugendmedizin|kinderzentrum|perinatalzentrum|neonatolog/i;

/**
 * The kind of a hospital site: psychiatric when every department is psychiatric or
 * psychosomatic, a children's hospital when every one is a children's department, else a
 * hospital; a site without departments is told by its names (the hospital's and the site's).
 */
export function deHospitalKind(departments: readonly string[], names: string): string {
	if (departments.length > 0) {
		if (departments.every((code) => PSYCHIATRIC_DEPARTMENT.test(code))) {
			return DE_PSYCHIATRIC_HOSPITAL;
		}
		if (departments.every((code) => CHILDRENS_DEPARTMENT.test(code))) return DE_CHILDRENS_HOSPITAL;
		return DE_HOSPITAL;
	}
	if (PSYCHIATRIC_NAME.test(names)) return DE_PSYCHIATRIC_HOSPITAL;
	if (CHILDRENS_NAME.test(names)) return DE_CHILDRENS_HOSPITAL;
	return DE_HOSPITAL;
}

/** Listing slug of a German facility: its kind's (no specialty decides a listing). */
export function deListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return DE_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every German listing slug. */
export function allDeListingSlugs(): Set<string> {
	return new Set(Object.values(DE_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the German labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allDeTaxonomySlugs(): Set<string> {
	return new Set([...allDeListingSlugs(), ...Object.values(DE_KIND_SLUGS)]);
}

const DE_LISTING_SLUGS: ReadonlySet<string> = allDeListingSlugs();

/**
 * First URL segments of the German pages that can never be a listing slug: the German route
 * segments of the market (`/de/einrichtung/…`, `/de/verzeichnis`) and the technical ones.
 */
export const DE_RESERVED_SEGMENTS = [
	"einrichtung",
	"organisation",
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

/** True when `slug` can be served as a German listing page. */
export function isDeListingSlug(slug: string): boolean {
	return !(DE_RESERVED_SEGMENTS as readonly string[]).includes(slug) && DE_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`apotheken` → `DE_PHARMACY`), if any. */
export function deProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(DE_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a German facility's profession (`DE_PHARMACY` → `apotheke`), if any. */
export function deKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (DE_KIND_SLUGS[professionCode] ?? null) : null;
}
