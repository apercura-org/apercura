/**
 * Kinds of care shared by the markets: the listing that lists one kind in each market, so a
 * search typed on one market's pages ("dentiste" on `/fr`) leads to the same kind of care in
 * another market's ("dental-practices" in Bristol, "zubni-lekar" in Brno, "dentistas" in Madrid,
 * "farmacie" for "pharmacie" in Roma).
 *
 * Each market names its listings in its own slugs and its own cut of the field: the UK lists
 * practices (one listing for every kind of dentistry), Austria one listing for dentists,
 * France and Czechia an orthodontist listing of their own. A kind a market does not list is
 * absent from its column. Several kinds may lead to one listing of a market (orthodontics and
 * dentistry both lead to the UK's dental practices); read back, a listing names the first kind
 * of the table that leads to it.
 *
 * Every slug is a listing slug of its market (tested).
 */

/** The open markets (ISO 3166-1 alpha-2), as `SEARCH_ALIASES` keys them. */
export type CareMarket = "FR" | "AT" | "GB" | "CZ" | "ES" | "IT";

export const CARE_KINDS = {
	"general-practice": {
		FR: "medecin-generaliste",
		AT: "allgemeinmedizin",
		GB: "gp-practices",
		CZ: "prakticky-lekar",
		ES: "centros-de-salud",
	},
	dentistry: {
		FR: "chirurgien-dentiste",
		AT: "zahnaerzte",
		GB: "dental-practices",
		CZ: "zubni-lekar",
		ES: "dentistas",
	},
	orthodontics: {
		FR: "orthodontiste",
		AT: "zahnaerzte",
		GB: "dental-practices",
		CZ: "ortodontista",
		ES: "dentistas",
	},
	pharmacy: { FR: "pharmacien", GB: "pharmacies", CZ: "lekarna", ES: "farmacias", IT: "farmacie" },
	hospital: { ES: "hospitales", IT: "ospedali" },
	paediatrics: { FR: "pediatre", AT: "kinderheilkunde", CZ: "detsky-lekar", ES: "pediatras" },
	gynaecology: { FR: "gynecologue", AT: "frauenheilkunde", CZ: "gynekolog", ES: "ginecologos" },
	obstetrics: {
		FR: "gynecologue-obstetricien",
		AT: "frauenheilkunde",
		CZ: "gynekolog",
		ES: "ginecologos",
	},
	midwifery: { FR: "sage-femme", CZ: "porodni-asistentka", ES: "matronas" },
	"home-nursing": { FR: "infirmier", CZ: "domaci-pece", ES: "enfermeria" },
	physiotherapy: { FR: "masseur-kinesitherapeute", CZ: "fyzioterapeut", ES: "fisioterapeutas" },
	psychology: { FR: "psychologue", CZ: "psycholog", ES: "psicologos" },
	"speech-therapy": { FR: "orthophoniste", CZ: "logoped", ES: "logopedas" },
	ophthalmology: {
		FR: "ophtalmologue",
		AT: "augenheilkunde",
		CZ: "ocni-lekar",
		ES: "oftalmologos",
	},
	"ear-nose-throat": {
		FR: "orl",
		AT: "hals-nasen-ohrenheilkunde",
		CZ: "usni-nosni-krcni",
		ES: "otorrinos",
	},
	dermatology: { FR: "dermatologue", AT: "dermatologie", CZ: "dermatolog", ES: "dermatologos" },
	cardiology: { FR: "cardiologue", AT: "kardiologie", CZ: "kardiolog", ES: "cardiologos" },
	pneumology: { FR: "pneumologue", AT: "pneumologie", CZ: "pneumolog", ES: "neumologos" },
	gastroenterology: {
		FR: "gastro-enterologue",
		AT: "gastroenterologie",
		CZ: "gastroenterolog",
		ES: "digestologos",
	},
	endocrinology: {
		FR: "endocrinologue",
		AT: "endokrinologie",
		CZ: "endokrinolog",
		ES: "endocrinos",
	},
	oncology: { FR: "oncologue", AT: "haematologie-und-onkologie", CZ: "onkolog", ES: "oncologos" },
	haematology: { FR: "hematologue", AT: "haematologie-und-onkologie", ES: "hematologos" },
	rheumatology: { FR: "rhumatologue", AT: "rheumatologie", CZ: "revmatolog", ES: "reumatologos" },
	nephrology: { FR: "nephrologue", AT: "nephrologie", CZ: "nefrolog", ES: "nefrologos" },
	angiology: {
		FR: "medecin-vasculaire",
		AT: "angiologie",
		CZ: "angiolog",
		ES: "cirujanos-vasculares",
	},
	infectiology: { FR: "infectiologue", AT: "infektiologie" },
	"internal-medicine": {
		FR: "interniste",
		AT: "innere-medizin",
		CZ: "internista",
		ES: "internistas",
	},
	allergology: { FR: "allergologue", CZ: "alergolog", ES: "alergologos" },
	urology: { FR: "urologue", AT: "urologie", CZ: "urolog", ES: "urologos" },
	neurology: { FR: "neurologue", AT: "neurologie", CZ: "neurolog", ES: "neurologos" },
	psychiatry: { FR: "psychiatre", AT: "psychiatrie", CZ: "psychiatr", ES: "psiquiatras" },
	"child-psychiatry": {
		FR: "pedopsychiatre",
		AT: "kinder-und-jugendpsychiatrie",
		CZ: "detsky-psychiatr",
		ES: "psiquiatras",
	},
	orthopaedics: {
		FR: "chirurgien-orthopediste",
		AT: "orthopaedie",
		CZ: "ortoped",
		ES: "traumatologos",
	},
	"trauma-surgery": { FR: "chirurgien-orthopediste", AT: "unfallchirurgie", ES: "traumatologos" },
	"general-surgery": { FR: "chirurgien-general", AT: "chirurgie", CZ: "chirurg", ES: "cirujanos" },
	"visceral-surgery": {
		FR: "chirurgien-visceral",
		AT: "chirurgie",
		CZ: "chirurg",
		ES: "cirujanos",
	},
	"plastic-surgery": {
		FR: "chirurgien-plasticien",
		AT: "plastische-chirurgie",
		CZ: "plasticky-chirurg",
		ES: "cirujanos-plasticos",
	},
	"vascular-surgery": {
		FR: "chirurgien-vasculaire",
		AT: "gefaesschirurgie",
		CZ: "cevni-chirurg",
		ES: "cirujanos-vasculares",
	},
	neurosurgery: {
		FR: "neurochirurgien",
		AT: "neurochirurgie",
		CZ: "neurochirurg",
		ES: "neurocirujanos",
	},
	"thoracic-surgery": {
		FR: "chirurgien-thoracique-et-cardiovasculaire",
		AT: "thoraxchirurgie",
		ES: "cirujanos",
	},
	"cardiac-surgery": {
		FR: "chirurgien-thoracique-et-cardiovasculaire",
		AT: "herzchirurgie",
		ES: "cirujanos",
	},
	"paediatric-surgery": { FR: "chirurgien-pediatrique", AT: "kinderchirurgie" },
	"maxillofacial-surgery": {
		FR: "chirurgien-maxillo-facial",
		AT: "mund-kiefer-gesichtschirurgie",
		ES: "cirujanos-maxilofaciales",
	},
	anaesthesiology: {
		FR: "anesthesiste-reanimateur",
		AT: "anaesthesiologie",
		CZ: "anesteziolog",
		ES: "anestesiologos",
	},
	radiology: { FR: "radiologue", AT: "radiologie", CZ: "radiolog", ES: "radiologos" },
	"nuclear-medicine": { FR: "medecin-nucleaire", AT: "nuklearmedizin" },
	radiotherapy: { FR: "radiotherapeute", AT: "strahlentherapie" },
	pathology: { FR: "anatomopathologiste", AT: "pathologie" },
	"laboratory-medicine": { FR: "biologiste-medical", AT: "labordiagnostik" },
	genetics: { FR: "geneticien", AT: "medizinische-genetik", CZ: "genetik", ES: "geneticistas" },
	rehabilitation: {
		FR: "medecin-reeducateur",
		AT: "physikalische-medizin",
		CZ: "rehabilitacni-lekar",
		ES: "medicos-rehabilitadores",
	},
	"occupational-medicine": {
		FR: "medecin-du-travail",
		AT: "arbeitsmedizin",
		ES: "medicos-del-trabajo",
	},
	"forensic-medicine": { FR: "medecin-legiste", AT: "gerichtsmedizin" },
	geriatrics: { FR: "geriatre", ES: "geriatras" },
	podiatry: { FR: "pedicure-podologue", ES: "podologos" },
	dietetics: { FR: "dieteticien", ES: "nutricionistas" },
	"occupational-therapy": { FR: "ergotherapeute", ES: "terapeutas-ocupacionales" },
} as const satisfies Readonly<Record<string, Readonly<Partial<Record<CareMarket, string>>>>>;

/** A kind of care shared by the markets (`general-practice`, `dentistry`…). */
export type CareKind = keyof typeof CARE_KINDS;

const KINDS = Object.entries(CARE_KINDS) as [CareKind, Partial<Record<CareMarket, string>>][];

/** The kind of care a listing of a market lists (`dental-practices` in GB → `dentistry`), or null. */
export function careKindOfListing(slug: string, market: CareMarket): CareKind | null {
	return KINDS.find(([, listings]) => listings[market] === slug)?.[0] ?? null;
}

/** The listing of a market that lists a kind of care, or null when the market has none. */
export function listingOfCareKind(kind: CareKind, market: CareMarket): string | null {
	return (CARE_KINDS[kind] as Partial<Record<CareMarket, string>>)[market] ?? null;
}

/**
 * The listing of `to` that lists what a listing of `from` lists (`chirurgien-dentiste` in FR →
 * `dental-practices` in GB), or null when `to` does not list that kind of care.
 */
export function equivalentListing(slug: string, from: CareMarket, to: CareMarket): string | null {
	if (from === to) return slug;
	const kind = careKindOfListing(slug, from);
	return kind ? listingOfCareKind(kind, to) : null;
}
