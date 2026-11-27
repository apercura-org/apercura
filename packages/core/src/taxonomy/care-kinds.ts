/**
 * Kinds of care shared by the markets: the listing that lists one kind in each market, so a
 * search typed on one market's pages ("dentiste" on `/fr`) leads to the same kind of care in
 * another market's ("dental-practices" in Bristol, "zubni-lekar" in Brno, "dentistas" in Madrid,
 * "farmacie" for "pharmacie" in Roma, "apotheke" for "pharmacy" in Basel).
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
export type CareMarket =
	| "FR"
	| "AT"
	| "GB"
	| "CZ"
	| "ES"
	| "IT"
	| "DE"
	| "CH"
	| "EE"
	| "PL"
	| "NO"
	| "IE"
	| "FI"
	| "LT"
	| "SI";

export const CARE_KINDS = {
	"general-practice": {
		FR: "medecin-generaliste",
		AT: "allgemeinmedizin",
		GB: "gp-practices",
		CZ: "prakticky-lekar",
		ES: "centros-de-salud",
		EE: "perearstikeskused",
		PL: "przychodnie-poz",
		NO: "legekontorer",
		FI: "terveysasemat",
		LT: "seimos-medicina",
		SI: "druzinski-zdravnik",
	},
	dentistry: {
		FR: "chirurgien-dentiste",
		AT: "zahnaerzte",
		GB: "dental-practices",
		CZ: "zubni-lekar",
		ES: "dentistas",
		EE: "hambaravi",
		PL: "stomatologia",
		NO: "tannklinikker",
		FI: "hammashoitolat",
		LT: "odontologijos-klinikos",
		SI: "zobozdravnik",
	},
	orthodontics: {
		FR: "orthodontiste",
		AT: "zahnaerzte",
		GB: "dental-practices",
		CZ: "ortodontista",
		ES: "dentistas",
		EE: "hambaravi",
		PL: "stomatologia",
		NO: "tannklinikker",
		FI: "hammashoitolat",
		LT: "odontologijos-klinikos",
		SI: "zobozdravnik",
	},
	pharmacy: {
		FR: "pharmacien",
		GB: "pharmacies",
		CZ: "lekarna",
		ES: "farmacias",
		IT: "farmacie",
		DE: "apotheken",
		CH: "apotheke",
		EE: "apteegid",
		NO: "apotek",
		IE: "pharmacy",
	},
	hospital: {
		ES: "hospitales",
		IT: "ospedali",
		DE: "krankenhaeuser",
		CH: "spital",
		EE: "haiglad",
		PL: "szpitale",
		NO: "sykehus",
		IE: "hospitals",
		FI: "sairaalat",
		LT: "ligonines",
	},
	"nursing-home": { CH: "pflegeheim", IE: "nursing-homes" },
	// Outpatient specialist care where a market lists it as one kind (Lithuania's medical centres,
	// Czechia's specialists whose field has no listing of its own).
	"specialist-care": { CZ: "lekar-specialista", LT: "medicinos-centrai" },
	paediatrics: {
		FR: "pediatre",
		AT: "kinderheilkunde",
		CZ: "detsky-lekar",
		ES: "pediatras",
		PL: "poradnie-pediatryczne",
		LT: "medicinos-centrai",
		SI: "otroski-zdravnik",
	},
	gynaecology: {
		FR: "gynecologue",
		AT: "frauenheilkunde",
		CZ: "gynekolog",
		ES: "ginecologos",
		PL: "poradnie-ginekologiczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
		SI: "ginekolog",
	},
	obstetrics: {
		FR: "gynecologue-obstetricien",
		AT: "frauenheilkunde",
		CZ: "gynekolog",
		ES: "ginecologos",
		PL: "poradnie-ginekologiczne",
		FI: "neuvolat",
		LT: "medicinos-centrai",
		SI: "ginekolog",
	},
	midwifery: {
		FR: "sage-femme",
		CZ: "porodni-asistentka",
		ES: "matronas",
		CH: "geburtshaus",
		EE: "ammaemandusabi",
		PL: "pielegniarki-i-polozne",
		FI: "neuvolat",
	},
	"home-nursing": {
		FR: "infirmier",
		CZ: "domaci-pece",
		ES: "enfermeria",
		EE: "oendusabi",
		PL: "pielegniarki-i-polozne",
		LT: "slauga",
	},
	physiotherapy: {
		FR: "masseur-kinesitherapeute",
		CZ: "fyzioterapeut",
		ES: "fisioterapeutas",
		EE: "fusioteraapia",
		PL: "rehabilitacja",
		FI: "kuntoutus",
		LT: "reabilitacija",
	},
	psychology: {
		FR: "psychologue",
		CZ: "psycholog",
		ES: "psicologos",
		EE: "psuhholoogiline-ravi",
		PL: "poradnie-psychologiczne",
		FI: "mielenterveys-ja-paihdepalvelut",
		LT: "psichikos-sveikatos-centrai",
	},
	"speech-therapy": {
		FR: "orthophoniste",
		CZ: "logoped",
		ES: "logopedas",
		EE: "logopeedia",
		PL: "poradnie-logopedyczne",
		FI: "kuntoutus",
	},
	ophthalmology: {
		FR: "ophtalmologue",
		AT: "augenheilkunde",
		CZ: "ocni-lekar",
		ES: "oftalmologos",
		PL: "poradnie-okulistyczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
	},
	"ear-nose-throat": {
		FR: "orl",
		AT: "hals-nasen-ohrenheilkunde",
		CZ: "usni-nosni-krcni",
		ES: "otorrinos",
		PL: "poradnie-laryngologiczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
	},
	dermatology: {
		FR: "dermatologue",
		AT: "dermatologie",
		CZ: "dermatolog",
		ES: "dermatologos",
		PL: "poradnie-dermatologiczne",
		LT: "medicinos-centrai",
	},
	cardiology: {
		FR: "cardiologue",
		AT: "kardiologie",
		CZ: "kardiolog",
		ES: "cardiologos",
		PL: "poradnie-kardiologiczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
	},
	pneumology: {
		FR: "pneumologue",
		AT: "pneumologie",
		CZ: "pneumolog",
		ES: "neumologos",
		PL: "poradnie-chorob-pluc",
		LT: "medicinos-centrai",
	},
	gastroenterology: {
		FR: "gastro-enterologue",
		AT: "gastroenterologie",
		CZ: "gastroenterolog",
		ES: "digestologos",
		PL: "poradnie-gastroenterologiczne",
		LT: "medicinos-centrai",
	},
	endocrinology: {
		FR: "endocrinologue",
		AT: "endokrinologie",
		CZ: "endokrinolog",
		ES: "endocrinos",
		PL: "poradnie-endokrynologiczne",
		LT: "medicinos-centrai",
	},
	oncology: {
		FR: "oncologue",
		AT: "haematologie-und-onkologie",
		CZ: "onkolog",
		ES: "oncologos",
		PL: "poradnie-onkologiczne",
		LT: "medicinos-centrai",
	},
	haematology: { FR: "hematologue", AT: "haematologie-und-onkologie", ES: "hematologos" },
	rheumatology: {
		FR: "rhumatologue",
		AT: "rheumatologie",
		CZ: "revmatolog",
		ES: "reumatologos",
		PL: "poradnie-reumatologiczne",
		LT: "medicinos-centrai",
	},
	nephrology: {
		FR: "nephrologue",
		AT: "nephrologie",
		CZ: "nefrolog",
		ES: "nefrologos",
		PL: "poradnie-nefrologiczne",
		LT: "medicinos-centrai",
	},
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
		PL: "poradnie-chorob-wewnetrznych",
		LT: "medicinos-centrai",
	},
	allergology: {
		FR: "allergologue",
		CZ: "alergolog",
		ES: "alergologos",
		PL: "poradnie-alergologiczne",
		LT: "medicinos-centrai",
	},
	urology: {
		FR: "urologue",
		AT: "urologie",
		CZ: "urolog",
		ES: "urologos",
		PL: "poradnie-urologiczne",
		LT: "medicinos-centrai",
	},
	neurology: {
		FR: "neurologue",
		AT: "neurologie",
		CZ: "neurolog",
		ES: "neurologos",
		PL: "poradnie-neurologiczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
	},
	psychiatry: {
		FR: "psychiatre",
		AT: "psychiatrie",
		CZ: "psychiatr",
		ES: "psiquiatras",
		CH: "psychiatrische-klinik",
		PL: "poradnie-zdrowia-psychicznego",
		NO: "psykisk-helsevern",
		FI: "mielenterveys-ja-paihdepalvelut",
		LT: "psichikos-sveikatos-centrai",
	},
	"child-psychiatry": {
		FR: "pedopsychiatre",
		AT: "kinder-und-jugendpsychiatrie",
		CZ: "detsky-psychiatr",
		ES: "psiquiatras",
		PL: "poradnie-zdrowia-psychicznego",
		NO: "psykisk-helsevern",
		FI: "mielenterveys-ja-paihdepalvelut",
		LT: "psichikos-sveikatos-centrai",
	},
	orthopaedics: {
		FR: "chirurgien-orthopediste",
		AT: "orthopaedie",
		CZ: "ortoped",
		ES: "traumatologos",
		PL: "poradnie-ortopedyczne",
		FI: "sairaalat",
		LT: "medicinos-centrai",
	},
	"trauma-surgery": {
		FR: "chirurgien-orthopediste",
		AT: "unfallchirurgie",
		ES: "traumatologos",
		PL: "poradnie-ortopedyczne",
	},
	"general-surgery": {
		FR: "chirurgien-general",
		AT: "chirurgie",
		CZ: "chirurg",
		ES: "cirujanos",
		PL: "poradnie-chirurgiczne",
		LT: "medicinos-centrai",
	},
	"visceral-surgery": {
		FR: "chirurgien-visceral",
		AT: "chirurgie",
		CZ: "chirurg",
		ES: "cirujanos",
		PL: "poradnie-chirurgiczne",
	},
	"plastic-surgery": {
		FR: "chirurgien-plasticien",
		AT: "plastische-chirurgie",
		CZ: "plasticky-chirurg",
		ES: "cirujanos-plasticos",
		PL: "poradnie-chirurgiczne",
		LT: "medicinos-centrai",
	},
	"vascular-surgery": {
		FR: "chirurgien-vasculaire",
		AT: "gefaesschirurgie",
		CZ: "cevni-chirurg",
		ES: "cirujanos-vasculares",
		PL: "poradnie-chirurgiczne",
	},
	neurosurgery: {
		FR: "neurochirurgien",
		AT: "neurochirurgie",
		CZ: "neurochirurg",
		ES: "neurocirujanos",
		PL: "poradnie-chirurgiczne",
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
	radiology: {
		FR: "radiologue",
		AT: "radiologie",
		CZ: "radiolog",
		ES: "radiologos",
		PL: "diagnostyka",
		FI: "laboratoriot-ja-kuvantaminen",
		LT: "medicinos-centrai",
	},
	"nuclear-medicine": { FR: "medecin-nucleaire", AT: "nuklearmedizin" },
	radiotherapy: { FR: "radiotherapeute", AT: "strahlentherapie" },
	pathology: { FR: "anatomopathologiste", AT: "pathologie" },
	"laboratory-medicine": {
		FR: "biologiste-medical",
		AT: "labordiagnostik",
		PL: "diagnostyka",
		FI: "laboratoriot-ja-kuvantaminen",
		LT: "laboratorijos",
	},
	genetics: { FR: "geneticien", AT: "medizinische-genetik", CZ: "genetik", ES: "geneticistas" },
	rehabilitation: {
		FR: "medecin-reeducateur",
		AT: "physikalische-medizin",
		CZ: "rehabilitacni-lekar",
		ES: "medicos-rehabilitadores",
		PL: "rehabilitacja",
		FI: "kuntoutus",
		LT: "reabilitacija",
	},
	"occupational-medicine": {
		FR: "medecin-du-travail",
		AT: "arbeitsmedizin",
		ES: "medicos-del-trabajo",
		PL: "poradnie-medycyny-pracy",
	},
	"forensic-medicine": { FR: "medecin-legiste", AT: "gerichtsmedizin" },
	geriatrics: { FR: "geriatre", ES: "geriatras", PL: "poradnie-chorob-wewnetrznych" },
	podiatry: { FR: "pedicure-podologue", ES: "podologos" },
	dietetics: { FR: "dieteticien", ES: "nutricionistas" },
	"occupational-therapy": {
		FR: "ergotherapeute",
		ES: "terapeutas-ocupacionales",
		FI: "kuntoutus",
		LT: "reabilitacija",
	},
} as const satisfies Readonly<Record<string, Readonly<Partial<Record<CareMarket, string>>>>>;

/** A kind of care shared by the markets (`general-practice`, `dentistry`…). */
export type CareKind = keyof typeof CARE_KINDS;

const KINDS = Object.entries(CARE_KINDS) as [CareKind, Partial<Record<CareMarket, string>>][];

/** The kind of care a listing of a market lists (`dental-practices` in GB → `dentistry`), or null. */
export function careKindOfListing(slug: string, market: CareMarket): CareKind | null {
	return KINDS.find(([, listings]) => listings[market] === slug)?.[0] ?? null;
}

/**
 * Every kind of care a listing of a market lists, in the table's order (`dental-practices` in GB
 * → `dentistry`, `orthodontics`), or none.
 */
export function careKindsOfListing(slug: string, market: CareMarket): CareKind[] {
	return KINDS.filter(([, listings]) => listings[market] === slug).map(([kind]) => kind);
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
