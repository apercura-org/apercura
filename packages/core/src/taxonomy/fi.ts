/**
 * Finnish taxonomy: the kinds of public health service location the Finnish market lists,
 * mapped to Finnish listing slugs (docs/adr/0002-multi-country.md, "Finland").
 *
 * A Finnish page is a service location (palvelupaikka) of the national Finnish Service Catalogue
 * (Suomi.fi-palvelutietovaranto, PTV) where a public organiser (a wellbeing services county, the
 * City of Helsinki, Åland, HUS) gives health care: a health centre, a hospital, an emergency
 * clinic, a dental clinic, a maternity and child health clinic, a mental health or substance
 * abuse service, a rehabilitation unit, a laboratory or imaging unit. A location is listed once,
 * under the kind its services say first (`fiLocationKind`); every service is shown on its page.
 * The catalogue's other locations (schools, libraries, social services, offices) are not
 * listed, nor school and student health care, which a pupil or student reaches through their
 * school.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Finnish, diacritics dropped, and
 * never collide with another market's (tested).
 */

/** Hospitals: central and university hospitals, regional and local hospitals, wards. */
export const FI_HOSPITAL = "FI_HOSPITAL";
/** Emergency clinics (päivystys): a hospital's joint emergency department or a health centre's. */
export const FI_EMERGENCY = "FI_EMERGENCY";
/** Health centres (terveysasemat, sote-keskukset): primary care by a doctor or a nurse. */
export const FI_HEALTH_CENTRE = "FI_HEALTH_CENTRE";
/** Dental clinics (hammashoitolat): public oral health care. */
export const FI_DENTAL = "FI_DENTAL";
/** Maternity and child health clinics (neuvolat), family planning clinics included. */
export const FI_CHILD_HEALTH = "FI_CHILD_HEALTH";
/** Mental health and substance abuse services for adults and young people. */
export const FI_MENTAL_HEALTH = "FI_MENTAL_HEALTH";
/** Rehabilitation: physiotherapy, occupational therapy, speech therapy, aids. */
export const FI_REHABILITATION = "FI_REHABILITATION";
/** Laboratories and imaging (sampling points, X-ray). */
export const FI_LABORATORY = "FI_LABORATORY";

/** Profession codes of the Finnish locations and their listing. */
export const FI_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[FI_HOSPITAL]: { slug: "sairaalat", enabled: true },
	[FI_EMERGENCY]: { slug: "paivystys", enabled: true },
	[FI_HEALTH_CENTRE]: { slug: "terveysasemat", enabled: true },
	[FI_DENTAL]: { slug: "hammashoitolat", enabled: true },
	[FI_CHILD_HEALTH]: { slug: "neuvolat", enabled: true },
	[FI_MENTAL_HEALTH]: { slug: "mielenterveys-ja-paihdepalvelut", enabled: true },
	[FI_REHABILITATION]: { slug: "kuntoutus", enabled: true },
	[FI_LABORATORY]: { slug: "laboratoriot-ja-kuvantaminen", enabled: true },
};

export const FI_DEFAULT_PROFESSIONS = Object.keys(FI_PROFESSIONS);

/**
 * The kind of a location in the singular, as its page and cards name it
 * (`taxonomy.profession.*`).
 */
export const FI_KIND_SLUGS: Readonly<Record<string, string>> = {
	[FI_HOSPITAL]: "sairaala",
	[FI_EMERGENCY]: "paivystyspiste",
	[FI_HEALTH_CENTRE]: "terveysasema",
	[FI_DENTAL]: "hammashoitola",
	[FI_CHILD_HEALTH]: "neuvola",
	[FI_MENTAL_HEALTH]: "mielenterveys-ja-paihdepalvelupiste",
	[FI_REHABILITATION]: "kuntoutusyksikko",
	[FI_LABORATORY]: "laboratorio-tai-kuvantamisyksikko",
};

/** Listing slug of a Finnish location: its kind's (no specialty decides a listing). */
export function fiListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return FI_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Finnish listing slug. */
export function allFiListingSlugs(): Set<string> {
	return new Set(Object.values(FI_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the Finnish labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allFiTaxonomySlugs(): Set<string> {
	return new Set([...allFiListingSlugs(), ...Object.values(FI_KIND_SLUGS)]);
}

const FI_LISTING_SLUGS: ReadonlySet<string> = allFiListingSlugs();

/**
 * First URL segments of the Finnish pages that can never be a listing slug: the Finnish route
 * segments of the market (`/fi/toimipiste/…`, `/fi/hakemisto`) and the technical ones.
 */
export const FI_RESERVED_SEGMENTS = [
	"toimipiste",
	"organisaatio",
	"hakemisto",
	"haku",
	"pro",
	"rdv",
	"api",
	"tietoa",
	"open-source",
	"aineisto",
	"saavutettavuus",
	"tietosuoja",
	"oikeudelliset-tiedot",
	"kayttoehdot",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Finnish listing page. */
export function isFiListingSlug(slug: string): boolean {
	return !(FI_RESERVED_SEGMENTS as readonly string[]).includes(slug) && FI_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`neuvolat` → `FI_CHILD_HEALTH`), if any. */
export function fiProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(FI_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a Finnish location's profession (`FI_DENTAL` → `hammashoitola`), if any. */
export function fiKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (FI_KIND_SLUGS[professionCode] ?? null) : null;
}

/**
 * The organisation types of the catalogue whose locations are listed: the wellbeing services
 * counties (`Region`), municipalities (Helsinki, Åland's), joint municipal authorities and other
 * regional bodies (`RegionalOrganization`, HUS), the State and public social and health care
 * units (`SotePublic`). Companies, associations and private units (`Company`, `Organization`,
 * `SotePrivate`) are not: the catalogue describes few of them, and a private practice may be
 * named after its owner.
 */
export const FI_PUBLIC_ORGANIZATION_TYPES: ReadonlySet<string> = new Set([
	"Region",
	"Municipality",
	"RegionalOrganization",
	"State",
	"SotePublic",
]);

/** A code of the health care class (`P5`, `P5.1` … `P5.20`; `P5.21`, food safety, is not care). */
export const FI_HEALTH_CLASS = /^P5(?:\.(?:[1-9]|1\d|20))?$/;

/** A health service given at a location: its classes (`P5.1`) and its name, in Finnish. */
export type FiService = { classes: readonly string[]; name: string | null };

/**
 * Words of a location's name that say it is no place a patient goes to for care, or a place the
 * market does not list: schools and student welfare (whose health care a pupil reaches through
 * the school), day care, home care and housing services, social services, offices and customer
 * service points, transport, occupational health, Kela's offices, supplies distribution.
 */
const NOT_LISTED =
	/koulu|skola|school|lukio|gymnasium|opisto|opiskeluhuol|opiskeluterveys|oppilashuol|elevv[åa]rd|studerandeh[äa]lso|p[äa]iv[äa]koti|daghem|varhaiskasvatus|kotihoito|hemv[åa]rd|kotisairaanhoi|kotisairaala|kotiin annettav|kotikuntoutus|ryhm[äa]koti|gruppboende|palvelukoti|hoivakoti|asumis|asuminen|boende|tukiasun|ty[öo]toiminta|ty[öo]paja|p[äa]iv[äa]toiminta|dagverksamhet|sosiaalipalvel|sosiaality[öo]|perhety[öo]|lastensuojelu|barnskydd|olka-|\bolka\b|asiakaspalvelu|asiointipiste|kunnanvirasto|kaupungintalo|virasto|obduktio|kappeli|lyhytaikaishoi|vammaispalvel|kirjasto|bibliotek|ik[äa]ihmisten|seniorikeskus|vanhusten|muistikoti|kuljetus|ty[öo]terveys|f[öo]retagsh[äa]lso|\bkela\b|tarvikejakelu|hoitotarvike|l[äa]hitori|neuvontapiste/i;

/** Words of a location's name, in Finnish or Swedish, that tell its kind, the most specific first. */
const NAME_KINDS: readonly [RegExp, string][] = [
	[/p[äa]ivystys|ensiapu|\bacuta\b|\bjour(?:en|mottagning)?\b|akutmottagning/i, FI_EMERGENCY],
	[/hammas|suun\s*terveyden|suunhoito|suun\s*hoito|tandv[åa]rd|tandklinik|munh[äa]lso/i, FI_DENTAL],
	[/neuvola|perhekeskus|perhesuunnittelu|ehk[äa]isy|r[åa]dgivning|familjecent/i, FI_CHILD_HEALTH],
	[
		/mielenterv|p[äa]ihde|korvaushoito|psykiatri|psykososiaal|a-klinikka|nuorisoasema|riippuvuus|mentalv[åa]rd|missbruk/i,
		FI_MENTAL_HEALTH,
	],
	[
		/laboratori|r[öo]ntgen|kuvantami|n[äa]ytteenotto|huslab|fimlab|nordlab|islab|bilddiagnost/i,
		FI_LABORATORY,
	],
	[
		/kuntoutu|fysioterap|apuv[äa]line|toimintaterap|puheterap|jalkaterap|terapiakeskus|rehabiliter|hj[äa]lpmedel/i,
		FI_REHABILITATION,
	],
	[/sairaala|sjukhus|osasto|poliklinik|avdelning/i, FI_HOSPITAL],
	[
		/terveysasema|terveyskeskus|sote-keskus|sotekeskus|sote-asema|hyvinvointikeskus|hyvinvointiasema|terveyspiste|terveystupa|h[äa]lsostation|h[äa]lsocentral|h[äa]lsov[åa]rdscentral|vastaanot|mottagning/i,
		FI_HEALTH_CENTRE,
	],
];

/**
 * The health care subclasses that tell a location's kind when its name does not, once the names
 * of schools, home care and housing services are set aside: not primary care (`P5.1`), which the
 * catalogue's organisers also give social services, home care and supplies distribution.
 */
const CLASS_KINDS: readonly [string, string][] = [
	["P5.5", FI_EMERGENCY],
	["P5.10", FI_DENTAL],
	["P5.2", FI_CHILD_HEALTH],
	["P5.4", FI_LABORATORY],
	["P5.6", FI_HOSPITAL],
	["P5.7", FI_MENTAL_HEALTH],
	["P5.13", FI_REHABILITATION],
];

/**
 * The kind of a service location: none when its name says it is not a place of care the market
 * lists (`NOT_LISTED`: a school, a home care team, an office), else from its name ("Hervannan
 * terveysasema", "Keskustan hammashoitola", "Hälsostationen i Jakobstad"), else from the classes
 * of the health services given there (specialised care at "Haavakeskus", a wound centre). Null
 * too for a location without a health service.
 */
export function fiLocationKind(
	names: readonly string[],
	services: readonly FiService[],
): string | null {
	const health = services.filter((service) =>
		service.classes.some((code) => FI_HEALTH_CLASS.test(code)),
	);
	if (health.length === 0) return null;
	if (names.some((name) => NOT_LISTED.test(name))) return null;
	for (const [pattern, kind] of NAME_KINDS) {
		if (names.some((name) => pattern.test(name))) return kind;
	}
	const classes = new Set(health.flatMap((service) => service.classes));
	for (const [code, kind] of CLASS_KINDS) if (classes.has(code)) return kind;
	return null;
}
