/**
 * Swiss taxonomy: the kinds of facility the Swiss market lists (docs/adr/0002-multi-country.md,
 * "Switzerland"), each its own listing:
 * - hospitals and clinics, from the Federal Office of Public Health's "Kennzahlen der Schweizer
 *   Spitäler" (one page per site), sorted by the Federal Statistical Office's hospital typology
 *   (`Typ`, K111–K235) and activity types (`Akt`: A acute care, P psychiatry, R rehabilitation,
 *   B birth centre), and from the cantons' own lists of hospitals where a canton publishes one
 *   (Bern, Geneva…);
 * - nursing homes, from the cantons that publish their list (Zürich, Geneva, Basel-Stadt, Jura…);
 * - pharmacies, from the cantons that publish their list (Geneva, Basel-Landschaft…).
 *
 * A Swiss page is a facility, never a person: no open register of health professionals may be
 * republished (MedReg, PsyReg and GesReg are consulted one by one; their bulk data needs an
 * agreement with the FOPH), and the lists' names of responsible pharmacists or directors are
 * never read.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. One slug per listing, in every language of the market
 * (France's pages keep their slugs under `/fr-en` too): German as Switzerland writes it, umlauts
 * spelled out, singular like France's. Slugs never collide with another market's (tested), so a
 * listing slug always names one market: Germany's and Austria's German slugs are plural
 * (`apotheken`), Switzerland's singular (`apotheke`).
 */

/** General hospitals: centre care (K111 university hospitals, K112) and basic care (K121–K123). */
export const CH_HOSPITAL = "CH_HOSPITAL";
/** Psychiatric clinics (K211, K212). */
export const CH_PSYCHIATRIC_CLINIC = "CH_PSYCHIATRIC_CLINIC";
/** Rehabilitation clinics (K221). */
export const CH_REHAB_CLINIC = "CH_REHAB_CLINIC";
/** Specialised clinics: surgery, gynaecology and neonatology, paediatrics, geriatrics, others (K231–K235). */
export const CH_SPECIALTY_CLINIC = "CH_SPECIALTY_CLINIC";
/** Birth centres (Geburtshäuser, maisons de naissance): the typology's activity type B alone. */
export const CH_BIRTH_CENTRE = "CH_BIRTH_CENTRE";
/** Nursing homes (Alters- und Pflegeheime, EMS, case per anziani), where a canton lists them. */
export const CH_NURSING_HOME = "CH_NURSING_HOME";
/** Public pharmacies, where a canton lists them. */
export const CH_PHARMACY = "CH_PHARMACY";

/** Profession codes of the Swiss facilities (kinds of facility) and their listing slugs. */
export const CH_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[CH_HOSPITAL]: { slug: "spital", enabled: true },
	[CH_PSYCHIATRIC_CLINIC]: { slug: "psychiatrische-klinik", enabled: true },
	[CH_REHAB_CLINIC]: { slug: "rehaklinik", enabled: true },
	[CH_SPECIALTY_CLINIC]: { slug: "spezialklinik", enabled: true },
	[CH_BIRTH_CENTRE]: { slug: "geburtshaus", enabled: true },
	[CH_NURSING_HOME]: { slug: "pflegeheim", enabled: true },
	[CH_PHARMACY]: { slug: "apotheke", enabled: true },
};

export const CH_DEFAULT_PROFESSIONS = [
	CH_HOSPITAL,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_SPECIALTY_CLINIC,
	CH_BIRTH_CENTRE,
	CH_NURSING_HOME,
	CH_PHARMACY,
] as const;

/** The hospital kinds: what the FOPH's figures and the cantons' hospital lists hold. */
export const CH_HOSPITAL_KINDS: readonly string[] = [
	CH_HOSPITAL,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_SPECIALTY_CLINIC,
	CH_BIRTH_CENTRE,
];

/**
 * The hospital typology of the Federal Statistical Office (`Typ` of the FOPH's figures), as the
 * figures name each type in German, French and Italian.
 */
export const CH_HOSPITAL_TYPES: Readonly<Record<string, { de: string; fr: string; it: string }>> = {
	K111: {
		de: "Universitätsspital",
		fr: "Hôpital universitaire",
		it: "Ospedale universitario",
	},
	K112: {
		de: "Allgemeinspital, Zentrumsversorgung",
		fr: "Hôpital de soins généraux, prise en charge centralisée",
		it: "Ospedale per cure generali, presa a carico centralizzata",
	},
	K121: {
		de: "Allgemeinspital, Grundversorgung",
		fr: "Hôpital de soins généraux, soins de base",
		it: "Ospedale per cure generali, cure di base",
	},
	K122: {
		de: "Allgemeinspital, Grundversorgung",
		fr: "Hôpital de soins généraux, soins de base",
		it: "Ospedale per cure generali, cure di base",
	},
	K123: {
		de: "Allgemeinspital, Grundversorgung",
		fr: "Hôpital de soins généraux, soins de base",
		it: "Ospedale per cure generali, cure di base",
	},
	K211: {
		de: "Psychiatrische Klinik",
		fr: "Clinique psychiatrique",
		it: "Clinica psichiatrica",
	},
	K212: {
		de: "Psychiatrische Klinik",
		fr: "Clinique psychiatrique",
		it: "Clinica psichiatrica",
	},
	K221: {
		de: "Rehabilitationsklinik",
		fr: "Clinique de réadaptation",
		it: "Clinica di riabilitazione",
	},
	K231: {
		de: "Spezialklinik: Chirurgie",
		fr: "Clinique spécialisée : chirurgie",
		it: "Clinica specializzata: chirurgia",
	},
	K232: {
		de: "Spezialklinik: Gynäkologie / Neonatologie",
		fr: "Clinique spécialisée : gynécologie / néonatologie",
		it: "Clinica specializzata: ginecologia / neonatologia",
	},
	K233: {
		de: "Spezialklinik: Pädiatrie",
		fr: "Clinique spécialisée : pédiatrie",
		it: "Clinica specializzata: pediatria",
	},
	K234: {
		de: "Spezialklinik: Geriatrie",
		fr: "Clinique spécialisée : gériatrie",
		it: "Clinica specializzata: geriatria",
	},
	K235: {
		de: "Spezialklinik",
		fr: "Clinique spécialisée",
		it: "Clinica specializzata",
	},
};

/**
 * The kind of a hospital of the FOPH's figures, from its type (`K112`) and its activity types
 * (`A, P`: acute care, psychiatry, rehabilitation, birth centre): a birth centre is a hospital
 * whose only activity is `B`; otherwise the type's family decides (K1 general hospitals, K21
 * psychiatric, K22 rehabilitation, K23 specialised clinics). Null when the type is unknown.
 */
export function chHospitalKindOf(type: string, activities = ""): string | null {
	const code = type.trim().toUpperCase();
	const acts = activities
		.split(/[\s,]+/)
		.map((act) => act.trim().toUpperCase())
		.filter(Boolean);
	if (!CH_HOSPITAL_TYPES[code]) {
		return acts.length === 1 && acts[0] === "B" ? CH_BIRTH_CENTRE : null;
	}
	if (acts.length === 1 && acts[0] === "B") return CH_BIRTH_CENTRE;
	if (code.startsWith("K1")) return CH_HOSPITAL;
	if (code.startsWith("K21")) return CH_PSYCHIATRIC_CLINIC;
	if (code.startsWith("K22")) return CH_REHAB_CLINIC;
	return CH_SPECIALTY_CLINIC;
}

/** Listing slug of a Swiss facility: its kind's (`spital`). The lists name no specialty. */
export function chListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return CH_PROFESSIONS[professionCode]?.slug ?? null;
}

const CH_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(CH_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Swiss listing slug. */
export function allChListingSlugs(): Set<string> {
	return new Set(CH_LISTING_SLUGS);
}

/**
 * First URL segments of the Swiss pages that can never be a listing slug: the route segments of
 * the market's three languages (`/ch/einrichtung/…`, `/ch-fr/etablissement/…`,
 * `/ch-it/struttura/…`) and the technical ones.
 */
export const CH_RESERVED_SEGMENTS = [
	// German (/ch)
	"einrichtung",
	"organisation",
	"verzeichnis",
	"suche",
	"ueber-uns",
	"daten",
	"barrierefreiheit",
	"datenschutz",
	"impressum",
	"nutzungsbedingungen",
	// French (/ch-fr)
	"etablissement",
	"annuaire",
	"recherche",
	"a-propos",
	"donnees",
	"accessibilite",
	"confidentialite",
	"mentions-legales",
	"conditions",
	"praticien",
	// Italian (/ch-it)
	"struttura",
	"organizzazione",
	"elenco",
	"cerca",
	"chi-siamo",
	"dati",
	"accessibilita",
	"privacy",
	"note-legali",
	"condizioni",
	// Every language
	"pro",
	"rdv",
	"api",
	"open-source",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Swiss listing page. */
export function isChListingSlug(slug: string): boolean {
	return !(CH_RESERVED_SEGMENTS as readonly string[]).includes(slug) && CH_LISTING_SLUGS.has(slug);
}

/** The profession code of a Swiss listing slug (`apotheke` → `CH_PHARMACY`). */
export function chProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(CH_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
