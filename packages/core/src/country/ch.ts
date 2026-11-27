import { CH_POSTCODE, formatPhoneCh, toE164Ch } from "../phone-ch";
import { CH_ID_SCHEMES, type ChIdScheme, isValidChSourceId } from "../slugs";
import {
	CH_DEFAULT_PROFESSIONS,
	CH_PROFESSIONS,
	chListingSlugFor,
	isChListingSlug,
} from "../taxonomy/ch";
import { CH_CANTONS } from "./ch-cantons";
import type { CountryAdapter, IdentifierScheme, RegistrySource } from "./types";

export { CH_CANTONS, chCantonOfNumber } from "./ch-cantons";

/**
 * The edition of the FOPH's "Kennzahlen der Schweizer Spitäler" the import reads: the 2023
 * figures, published on opendata.swiss under "Open use. Must provide the source." The 2024
 * edition's terms ask for permission before any commercial use, so it is not read.
 */
export const CH_HOSPITAL_FIGURES_YEAR = 2023;

/** opendata.swiss's "Open use. Must provide the source." (`terms_by`). */
const TERMS_BY = "opendata.swiss: Open use. Must provide the source.";
const TERMS_BY_URL = "https://opendata.swiss/en/terms-of-use#terms_by";
/** opendata.swiss's "Open use." (`terms_open`); the publishers below still ask for the source. */
const TERMS_OPEN = "opendata.swiss: Open use.";
const TERMS_OPEN_URL = "https://opendata.swiss/en/terms-of-use#terms_open";

/**
 * The placeholder of the date of the data in an attribution (SITG asks for the day the data was
 * downloaded): a page puts the day of the Swiss import it is built from.
 */
export const CH_ATTRIBUTION_DATE = "{date}";

/**
 * The canton whose open list each cantonal source is, by registry id (the activities' sources
 * and the `quelle` qualifications' codes): what the pages say a canton's coverage comes from.
 * The FOPH's figures and the places' registers are federal and absent here. The import's lists
 * (`CH_SOURCES` in @apercura/etl) give the same cantons, which its tests check.
 */
export const CH_LIST_CANTONS: Readonly<Record<string, string>> = {
	"ch-be-spitaeler": "BE",
	"ch-be-heime": "BE",
	"ch-ge-hopitaux": "GE",
	"ch-ge-ems": "GE",
	"ch-ge-pharmacies": "GE",
	"ch-bl-apotheken": "BL",
	"ch-bl-heime": "BL",
	"ch-bs-spitaeler": "BS",
	"ch-bs-heime": "BS",
	"ch-zh-heime": "ZH",
	"ch-ju-institutions": "JU",
};

/**
 * Switzerland has one time zone. A region code is a canton abbreviation (`ZH`), a district or
 * commune number of the Federal Statistical Office (`101`, `261`); any other one is an error,
 * never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (/^[A-Z]{2}$/.test(code) ? !CH_CANTONS[code] : !/^[1-9]\d{0,3}$/.test(code)) {
		throw new RangeError(`Unknown Swiss region code "${code}"`);
	}
	return "Europe/Zurich";
}

const SCHEME_NAMES: Readonly<Record<ChIdScheme, { name: string; issuer: string }>> = {
	"CH-BAG": {
		name: "Key of a hospital site derived from its canton, hospital, name and postcode",
		issuer: "Bundesamt für Gesundheit, Kennzahlen der Schweizer Spitäler",
	},
	"CH-BE-SPITAL": {
		name: "Key derived from the site's name and address",
		issuer: "Gesundheitsamt des Kantons Bern, Spitäler und Kliniken",
	},
	"CH-BE-PH": {
		name: "Key derived from the home's name and address",
		issuer: "Amt für Integration und Soziales des Kantons Bern",
	},
	"CH-GE-HOP": {
		name: "Key derived from the facility's name and address",
		issuer: "SITG, Hôpitaux et cliniques",
	},
	"CH-GE-EMS": {
		name: "Cantonal address identifier of the nursing home (IDPADR)",
		issuer: "SITG, Établissements médico-sociaux",
	},
	"CH-GE-PHARM": {
		name: "Key derived from the pharmacy's name and address",
		issuer: "SITG, Lieux de vaccination : pharmacies",
	},
	"CH-BL-PHARM": {
		name: "Global Location Number (GLN) of the pharmacy",
		issuer: "Kanton Basel-Landschaft, Amt für Gesundheit",
	},
	"CH-BL-PH": {
		name: "Key derived from the home's name and address",
		issuer: "Kanton Basel-Landschaft, Amt für Gesundheit",
	},
	"CH-BS-SPITAL": {
		name: "Key derived from the hospital's name and address",
		issuer: "Kanton Basel-Stadt, Spitäler",
	},
	"CH-BS-PH": {
		name: "Key derived from the home's name and address",
		issuer: "Kanton Basel-Stadt, Alters- und Pflegeheime",
	},
	"CH-ZH-PH": {
		name: "Identifier of the home (hexadecimal, read as a number)",
		issuer: "Kanton Zürich, Gesundheitsdirektion",
	},
	"CH-JU": {
		name: "Key derived from the institution's name and address",
		issuer: "République et Canton du Jura, Institutions de soins et de santé",
	},
};

const practitionerIds: IdentifierScheme[] = (Object.keys(CH_ID_SCHEMES) as ChIdScheme[]).map(
	(id) => ({ id, ...SCHEME_NAMES[id], isValid: (value) => isValidChSourceId(id, value) }),
);

/**
 * The sources of the Swiss pages, each with the attribution its publisher asks for, word for
 * word and in each of its languages: the FOPH's hospital figures, the cantons' lists, and the
 * places of the Federal Statistical Office and swisstopo. Ids are the activities' sources
 * (`ch-bag-kzp`…) and the `quelle` qualifications' codes.
 */
const REGISTRIES: readonly RegistrySource[] = [
	{
		id: "ch-bag-kzp",
		name: `Kennzahlen der Schweizer Spitäler ${CH_HOSPITAL_FIGURES_YEAR}`,
		publisher: "Bundesamt für Gesundheit (BAG)",
		url: `https://opendata.swiss/de/dataset/kennzahlen-der-schweizer-spitaler-${CH_HOSPITAL_FIGURES_YEAR}`,
		licence: TERMS_BY,
		licenceUrl: TERMS_BY_URL,
		attribution: `Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler ${CH_HOSPITAL_FIGURES_YEAR}`,
		attributions: {
			de: `Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler ${CH_HOSPITAL_FIGURES_YEAR}`,
			fr: `Source : © Office fédéral de la santé publique (OFSP), Chiffres-clés des hôpitaux suisses ${CH_HOSPITAL_FIGURES_YEAR}`,
			it: `Fonte: © Ufficio federale della sanità pubblica (UFSP), Cifre chiave degli ospedali svizzeri ${CH_HOSPITAL_FIGURES_YEAR}`,
		},
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-be-spitaeler",
		name: "Spitäler und Kliniken (Kanton Bern)",
		publisher: "Gesundheitsamt des Kantons Bern",
		url: "https://opendata.swiss/de/dataset/spitaler-und-kliniken",
		licence: `${TERMS_OPEN} Kanton Bern: Freie Nutzung, Quellenangabe ist Pflicht`,
		licenceUrl: TERMS_OPEN_URL,
		attribution: "Spitäler und Kliniken © Gesundheitsamt des Kantons Bern",
		attributions: {
			de: "Spitäler und Kliniken © Gesundheitsamt des Kantons Bern",
			fr: "Hôpitaux et cliniques © Office de la santé du canton de Berne",
		},
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-be-heime",
		name: "Standorte der Leistungserbringung in den Bereichen Alter und Behinderung (Kanton Bern)",
		publisher: "Amt für Integration und Soziales des Kantons Bern",
		url: "https://opendata.swiss/de/dataset/standorte-der-leistungserbringung-in-den-bereichen-alter-und-behinderung",
		licence: `${TERMS_OPEN} Kanton Bern: Freie Nutzung, Quellenangabe ist Pflicht`,
		licenceUrl: TERMS_OPEN_URL,
		attribution:
			"Standorte der Leistungserbringung in den Bereichen Alter und Behinderung © Amt für Integration und Soziales des Kantons Bern",
		attributions: {
			de: "Standorte der Leistungserbringung in den Bereichen Alter und Behinderung © Amt für Integration und Soziales des Kantons Bern",
			fr: "Sites des fournisseurs de prestations dans les domaines du troisième âge et du handicap © Office de l'intégration et de l'action sociale du canton de Berne",
		},
		provides: ["practitioners", "activities"],
	},
	...(
		[
			[
				"ch-ge-hopitaux",
				"Hôpitaux et cliniques (DAS_HOPITAUX_CLINIQUES)",
				"etablissements-de-soins-hospitaliers-et-cliniques",
			],
			[
				"ch-ge-ems",
				"Établissements médico-sociaux (DAS_EMS)",
				"etablissements-medico-sociaux-ems1",
			],
			[
				"ch-ge-pharmacies",
				"Lieux de vaccination : pharmacies (GEO_SANTE_VACCINATION_PHARM)",
				"lieux-de-vaccination-pharmacie1",
			],
		] as const
	).map(
		([id, name, dataset]): RegistrySource => ({
			id,
			name,
			publisher:
				"République et canton de Genève, Système d'information du territoire à Genève (SITG)",
			url: `https://opendata.swiss/fr/dataset/${dataset}`,
			licence: `${TERMS_OPEN} SITG: conditions générales d'utilisation, niveau A (accès libre)`,
			licenceUrl: "https://sitg.ge.ch/ressources/conditions-utilisation-donnees",
			attribution: `Source : Portail des données SITG (État de Genève), téléchargé en date du ${CH_ATTRIBUTION_DATE} ; données compilées par Apercura`,
			provides: ["practitioners", "activities"],
		}),
	),
	{
		id: "ch-bl-apotheken",
		name: "Apotheken im Kanton Basel-Landschaft",
		publisher: "Kanton Basel-Landschaft, Amt für Gesundheit",
		url: "https://opendata.swiss/de/dataset/apotheken-mit-betriebsbewilligung-oder-impfberechtigung-nach-standort",
		licence: TERMS_BY,
		licenceUrl: TERMS_BY_URL,
		attribution: "Quelle: Kanton Basel-Landschaft, Amt für Gesundheit (data.bl.ch)",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-bl-heime",
		name: "Alters- und Pflegeheime im Kanton Basel-Landschaft",
		publisher: "Kanton Basel-Landschaft, Amt für Gesundheit",
		url: "https://opendata.swiss/de/dataset/alters-und-pflegeheime-nach-standort",
		licence: TERMS_BY,
		licenceUrl: TERMS_BY_URL,
		attribution: "Quelle: Kanton Basel-Landschaft, Amt für Gesundheit (data.bl.ch)",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-bs-spitaeler",
		name: "Spitäler (Kanton Basel-Stadt, SPTL)",
		publisher: "Kanton Basel-Stadt",
		url: "https://opendata.swiss/de/dataset/spitaler",
		licence: `${TERMS_BY} (CC BY 4.0)`,
		licenceUrl: "https://creativecommons.org/licenses/by/4.0/deed.de",
		attribution: "Quelle: Kanton Basel-Stadt (geo.bs.ch), CC BY 4.0",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-bs-heime",
		name: "Alters- und Pflegeheime (Kanton Basel-Stadt, APFH)",
		publisher: "Kanton Basel-Stadt",
		url: "https://opendata.swiss/de/dataset/alterspflegeheime1",
		licence: `${TERMS_BY} (CC BY 4.0)`,
		licenceUrl: "https://creativecommons.org/licenses/by/4.0/deed.de",
		attribution: "Quelle: Kanton Basel-Stadt (geo.bs.ch), CC BY 4.0",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-zh-heime",
		name: "Alters- und Pflegeheime Kanton Zürich",
		publisher: "Kanton Zürich, Gesundheitsdirektion",
		url: "https://opendata.swiss/de/dataset/alters-und-pflegeheime-kanton-zurich",
		licence: TERMS_OPEN,
		licenceUrl: TERMS_OPEN_URL,
		attribution:
			"Quelle: Kanton Zürich, Gesundheitsdirektion, Alters- und Pflegeheime Kanton Zürich",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-ju-institutions",
		name: "Institutions de soins et de santé (SSA_19_04)",
		publisher: "République et Canton du Jura",
		url: "https://opendata.swiss/fr/dataset/institutions-de-soins-et-de-sante",
		licence: `${TERMS_BY} Niveau A : libre d'accès`,
		licenceUrl: TERMS_BY_URL,
		attribution: "© Géodonnées de la République et Canton du Jura",
		provides: ["practitioners", "activities"],
	},
	{
		id: "ch-bfs-gemeinden",
		name: "Amtliches Gemeindeverzeichnis der Schweiz",
		publisher: "Bundesamt für Statistik (BFS)",
		url: "https://opendata.swiss/de/dataset/historisiertes-gemeindeverzeichnis-der-schweiz",
		licence: TERMS_OPEN,
		licenceUrl: TERMS_OPEN_URL,
		attribution: "Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz",
		attributions: {
			de: "Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz",
			fr: "Source : OFS – Répertoire officiel des communes de Suisse",
			it: "Fonte: UST – Elenco ufficiale dei Comuni della Svizzera",
		},
		provides: ["places"],
	},
	{
		id: "ch-swisstopo-plz",
		name: "Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter",
		publisher: "Bundesamt für Landestopografie swisstopo",
		url: "https://opendata.swiss/de/dataset/amtliches-ortschaftenverzeichnis-mit-postleitzahl-und-perimeter",
		licence: "Open Government Data swisstopo: free use with the source",
		licenceUrl: "https://www.swisstopo.admin.ch/ogd-conditions",
		attribution: "© swisstopo, Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter",
		attributions: {
			de: "© swisstopo, Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter",
			fr: "© swisstopo, Répertoire officiel des localités avec code postal et périmètre",
			it: "© swisstopo, Elenco ufficiale delle località con NPA e perimetro",
		},
		provides: ["places"],
	},
];

/**
 * Switzerland, opened from the Federal Office of Public Health's hospital figures and the
 * cantons' open lists (docs/adr/0002-multi-country.md, "Switzerland"): every hospital and clinic
 * site of the "Kennzahlen der Schweizer Spitäler" (2023, open use with the source), the
 * hospitals, nursing homes and pharmacies of the cantons that publish theirs under open terms,
 * placed in the cantons, districts and communes of the Federal Statistical Office. A page is a
 * facility under the name its list publishes; no health professional is listed (the federal
 * registers are consulted one by one, their bulk data needs an agreement) and the lists' names
 * of responsible persons are never read. No booking and no e-identity claim: a facility claims
 * its page with documents checked by an administrator.
 *
 * The market speaks the country's three official languages: German under `/ch` (locale
 * `de-CH`), French under `/ch-fr` (`fr-CH`) and Italian under `/ch-it` (`it-CH`), each indexed;
 * `defaultLocale` is the language of `/ch`.
 */
export const switzerland: CountryAdapter = {
	code: "CH",
	segment: "ch",
	defaultLocale: "de",
	defaultTimeZone: "Europe/Zurich",
	timeZones: ["Europe/Zurich"],
	timeZoneOf: timeZoneOfRegion,
	registries: REGISTRIES,
	practitionerIds,
	taxonomy: {
		professions: CH_PROFESSIONS,
		defaultProfessions: CH_DEFAULT_PROFESSIONS,
		listingSlugFor: chListingSlugFor,
		isListingSlug: isChListingSlug,
	},
	phone: { callingCodes: ["41"], toE164: (raw) => toE164Ch(raw), format: formatPhoneCh },
	address: {
		postcode: CH_POSTCODE,
		// A Swiss address: the street and number, then the postcode and the locality
		// (`8001 Zürich`).
		lines: ({ street, postcode, city }) =>
			[street, [postcode, city].filter(Boolean).join(" ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis:
				"Bundesgesetz gegen den unlauteren Wettbewerb (UWG), Art. 3 Abs. 1 lit. s (Impressum of a provider of online services)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"Bundesgesetz über den Datenschutz (DSG, revised, in force since 1 September 2023): Art. 19 (duty to inform), Art. 16 (disclosure abroad), Art. 30 and 32 (objection); for visitors in the EU, the GDPR articles 13, 14 and 21",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Behindertengleichstellungsgesetz (BehiG) binds the Confederation's own services, not private websites",
		},
	],
	healthDataHosting: {
		regime: "DSG (nFADP)",
		basis:
			"No hosting certification: the revised Federal Act on Data Protection (DSG, nFADP) and its ordinance (DSV); health data are sensitive personal data (Art. 5 lit. c DSG)",
		url: "https://www.fedlex.admin.ch/eli/cc/2022/491/de",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
