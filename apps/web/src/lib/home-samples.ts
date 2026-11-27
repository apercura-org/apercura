import { type Locale, type MarketCountry, marketOf } from "~/i18n/locales";

/*
 * The fictitious pages a market's home shows: the specimen page and the sample stamps of the
 * opening. Each market shows what its directory lists, in its own language: practitioners in
 * France, Austria (its doctors) and Czechia (practices under a doctor's name, a pharmacy);
 * practices, facilities, pharmacies or hospitals in the UK, Spain, Italy, Germany, Switzerland
 * and Estonia. The names and addresses say plainly that they are examples ("Exemple",
 * "Muster", "Example", "Ejemplo", "Esempio", "Příklad", "Näidis", "Przykład"), never a real person, practice or place
 * of care; the identifiers are shaped like the market's but synthetic.
 *
 * One sample per state of a page, as the stamp prints it (DESIGN.md, "Stamp"): unclaimed
 * (outlined), verified (solid) and claimed, a claim being checked (dashed over a hatch). Every
 * market can reach the three: a page is claimed with a document an administrator reviews
 * wherever no e-identity is open (`claimPolicyOf` in `@apercura/core`), and France adds Pro
 * Santé Connect and the registry's email.
 */

/** The state of a page, as `Practitioner.status` words it. */
export type SampleStatus = "unclaimed" | "verified" | "claimed";

export type HomeSample = {
	name: string;
	/** The listing slug its kind is read from (`labels.occupation`). */
	listing: string;
	/** Grammatical gender of the kind's label, where the language has one. */
	gender: "female" | "other";
	address: string;
	/** The identifier as the market's pages print it (an RPPS, an ODS code, a page key). */
	identifier: string;
	status: SampleStatus;
};

/** Three samples, in the order of the states: unclaimed (the specimen), verified, claimed. */
export type HomeSamples = readonly [HomeSample, HomeSample, HomeSample];

/** The date the specimen page says it was updated: fixed, it is no real page. */
export const SPECIMEN_UPDATED_AT = "2026-11-19";

const FRANCE: HomeSamples = [
	{
		name: "Dr Exemple Martin",
		listing: "medecin-generaliste",
		gender: "other",
		address: "12 rue de l’Exemple, 69000 Lyon",
		// Luhn-valid but synthetic RPPS numbers.
		identifier: "10000000009",
		status: "unclaimed",
	},
	{
		name: "Dr Exemple Bernard",
		listing: "chirurgien-dentiste",
		gender: "other",
		address: "3 place de l’Exemple, 33000 Bordeaux",
		identifier: "10000000017",
		status: "verified",
	},
	{
		name: "Exemple Durand",
		listing: "infirmier",
		gender: "female",
		address: "8 avenue de l’Exemple, 59000 Lille",
		identifier: "10000000025",
		status: "claimed",
	},
];

const SAMPLES: Readonly<Record<Exclude<MarketCountry, "CH">, HomeSamples>> = {
	FR: FRANCE,
	// Austria: doctors and dentists of the Länder's lists (Wien, Steiermark, Salzburg).
	AT: [
		{
			name: "Dr. Maria Muster",
			listing: "allgemeinmedizin",
			gender: "female",
			address: "Musterstraße 12, 1010 Wien",
			identifier: "w000009",
			status: "unclaimed",
		},
		{
			name: "DDr. Thomas Beispiel",
			listing: "zahnaerzte",
			gender: "other",
			address: "Beispielgasse 3, 8010 Graz",
			identifier: "st000017",
			status: "verified",
		},
		{
			name: "Dr. Eva Musterfrau",
			listing: "kinderheilkunde",
			gender: "female",
			address: "Mustergasse 8, 5020 Salzburg",
			identifier: "sb000025",
			status: "claimed",
		},
	],
	// The UK: NHS GP practices, dental practices and pharmacies, never a clinician.
	GB: [
		{
			name: "Example Road Surgery",
			listing: "gp-practices",
			gender: "other",
			address: "12 Example Road, Leeds",
			identifier: "A00009",
			status: "unclaimed",
		},
		{
			name: "Example Dental Care",
			listing: "dental-practices",
			gender: "other",
			address: "3 Sample Street, Bristol",
			identifier: "V000017",
			status: "verified",
		},
		{
			name: "Example Pharmacy",
			listing: "pharmacies",
			gender: "other",
			address: "8 Specimen Way, Cardiff",
			identifier: "FX009",
			status: "claimed",
		},
	],
	// Czechia: the NRPZS's facilities, a doctor's practice under the doctor's name.
	CZ: [
		{
			name: "MUDr. Pavel Příkladný",
			listing: "prakticky-lekar",
			gender: "other",
			address: "Příkladná 12, 110 00 Praha 1",
			identifier: "000009",
			status: "unclaimed",
		},
		{
			name: "MDDr. Eva Příkladná",
			listing: "zubni-lekar",
			gender: "other",
			address: "Náměstí Příkladů 3, 602 00 Brno",
			identifier: "000017",
			status: "verified",
		},
		{
			name: "Lékárna U Vzoru",
			listing: "lekarna",
			gender: "other",
			address: "Vzorná 8, 779 00 Olomouc",
			identifier: "000025",
			status: "claimed",
		},
	],
	// Spain: the REGCESS's centres.
	ES: [
		{
			name: "Centro de Salud Ejemplo",
			listing: "centros-de-salud",
			gender: "other",
			address: "Calle del Ejemplo 12, 28012 Madrid",
			identifier: "0000000009",
			status: "unclaimed",
		},
		{
			name: "Clínica Dental Muestra",
			listing: "dentistas",
			gender: "other",
			address: "Plaza de la Muestra 3, 41004 Sevilla",
			identifier: "0000000017",
			status: "verified",
		},
		{
			name: "Farmacia Ejemplo",
			listing: "farmacias",
			gender: "other",
			address: "Avenida del Ejemplo 8, 46002 Valencia",
			identifier: "0000000025",
			status: "claimed",
		},
	],
	// Italy: pharmacies, parapharmacies, hospitals and accredited clinics.
	IT: [
		{
			name: "Farmacia dell’Esempio",
			listing: "farmacie",
			gender: "other",
			address: "Via dell’Esempio 12, 00184 Roma",
			identifier: "f0000009",
			status: "unclaimed",
		},
		{
			name: "Casa di cura Villa Esempio",
			listing: "case-di-cura",
			gender: "other",
			address: "Piazza dell’Esempio 3, 20121 Milano",
			identifier: "s000017",
			status: "verified",
		},
		{
			name: "Parafarmacia del Modello",
			listing: "parafarmacie",
			gender: "other",
			address: "Corso dell’Esempio 8, 10121 Torino",
			identifier: "p000025",
			status: "claimed",
		},
	],
	// Germany: hospitals and clinics of the Destatis directory, pharmacies of Thuringia's list.
	DE: [
		{
			name: "Klinikum Musterstadt",
			listing: "krankenhaeuser",
			gender: "other",
			address: "Musterstraße 12, 10115 Berlin",
			identifier: "k0000000009",
			status: "unclaimed",
		},
		{
			name: "Reha-Klinik Am Musterpark",
			listing: "reha-kliniken",
			gender: "other",
			address: "Am Musterpark 3, 04109 Leipzig",
			identifier: "r0000000017",
			status: "verified",
		},
		{
			name: "Apotheke am Musterplatz",
			listing: "apotheken",
			gender: "other",
			address: "Musterplatz 8, 99084 Erfurt",
			identifier: "th9",
			status: "claimed",
		},
	],
	// Estonia: providers of the Health Board's register, a pharmacy of the State Agency of
	// Medicines'. A provider's page prints its first activity licence number.
	EE: [
		{
			name: "Näidise Perearstikeskus",
			listing: "perearstikeskused",
			gender: "other",
			address: "Näidise tn 12, 10117 Tallinn",
			identifier: "L00009",
			status: "unclaimed",
		},
		{
			name: "Näidise Hambakliinik",
			listing: "hambaravi",
			gender: "other",
			address: "Näidise pst 3, 51004 Tartu",
			identifier: "L00017",
			status: "verified",
		},
		{
			name: "Näidisapteek",
			listing: "apteegid",
			gender: "other",
			address: "Näidise väljak 8, 80010 Pärnu",
			identifier: "ap25",
			status: "claimed",
		},
	],
	// Poland: RPWDL's establishments, a primary care clinic, a dental clinic, a hospital.
	PL: [
		{
			name: "Przychodnia Przykładowa",
			listing: "przychodnie-poz",
			gender: "other",
			address: "ul. Przykładowa 12, 00-950 Warszawa",
			identifier: "900001",
			status: "unclaimed",
		},
		{
			name: "Gabinet Stomatologiczny Wzorcowy",
			listing: "stomatologia",
			gender: "other",
			address: "pl. Przykładowy 3, 31-001 Kraków",
			identifier: "900002",
			status: "verified",
		},
		{
			name: "Szpital Przykładowy",
			listing: "szpitale",
			gender: "other",
			address: "ul. Wzorcowa 8, 50-001 Wrocław",
			identifier: "900003",
			status: "claimed",
		},
	], // Norway: establishments of the Central Coordinating Register for Legal Entities, printed
	// with their organisation number (synthetic, the check digit valid).
	NO: [
		{
			name: "Eksempel Legesenter",
			listing: "legekontorer",
			gender: "other",
			address: "Eksempelgata 10, 0150 Oslo",
			identifier: "910 000 039",
			status: "unclaimed",
		},
		{
			name: "Eksempel Tannklinikk",
			listing: "tannklinikker",
			gender: "other",
			address: "Eksempelvegen 7, 2050 Jessheim",
			identifier: "910 000 101",
			status: "verified",
		},
		{
			name: "Apotek 1 Eksempel",
			listing: "apotek",
			gender: "other",
			address: "Eksempelgata 12, 0151 Oslo",
			identifier: "910 000 152",
			status: "claimed",
		},
	],
};

/**
 * Switzerland, in each of its languages, from cantons whose lists it publishes: hospitals
 * everywhere (the FOPH's figures), nursing homes of Bern and Geneva, pharmacies of
 * Basel-Landschaft and Geneva. Ticino has no list of its own, so its samples are hospitals and
 * clinics only. Swiss German writes no "ß".
 */
const SWITZERLAND: Readonly<Record<"de-CH" | "fr-CH" | "it-CH", HomeSamples>> = {
	"de-CH": [
		{
			name: "Spital Musterwil",
			listing: "spital",
			gender: "other",
			address: "Musterstrasse 12, 8001 Zürich",
			identifier: "h900000009",
			status: "unclaimed",
		},
		{
			name: "Alters- und Pflegeheim Musterhalde",
			listing: "pflegeheim",
			gender: "other",
			address: "Musterweg 3, 3011 Bern",
			identifier: "bee900000017",
			status: "verified",
		},
		{
			name: "Apotheke zum Muster",
			listing: "apotheke",
			gender: "other",
			address: "Musterplatz 8, 4410 Liestal",
			identifier: "blp7600000000009",
			status: "claimed",
		},
	],
	"fr-CH": [
		{
			name: "Hôpital de l’Exemple",
			listing: "spital",
			gender: "other",
			address: "Rue de l’Exemple 12, 1205 Genève",
			identifier: "h900000009",
			status: "unclaimed",
		},
		{
			name: "EMS Les Exemples",
			listing: "pflegeheim",
			gender: "other",
			address: "Chemin de l’Exemple 3, 1206 Genève",
			identifier: "gee900000017",
			status: "verified",
		},
		{
			name: "Pharmacie de l’Exemple",
			listing: "apotheke",
			gender: "other",
			address: "Place de l’Exemple 8, 1204 Genève",
			identifier: "gep900000025",
			status: "claimed",
		},
	],
	"it-CH": [
		{
			name: "Ospedale dell’Esempio",
			listing: "spital",
			gender: "other",
			address: "Via dell’Esempio 12, 6900 Lugano",
			identifier: "h900000009",
			status: "unclaimed",
		},
		{
			name: "Clinica di riabilitazione Esempio",
			listing: "rehaklinik",
			gender: "other",
			address: "Piazza dell’Esempio 3, 6600 Locarno",
			identifier: "h900000017",
			status: "verified",
		},
		{
			name: "Clinica psichiatrica Modello",
			listing: "psychiatrische-klinik",
			gender: "other",
			address: "Viale del Modello 8, 6850 Mendrisio",
			identifier: "h900000025",
			status: "claimed",
		},
	],
};

/** The samples a locale's home shows: its market's, in Switzerland its language's too. */
export function homeSamples(locale: Locale): HomeSamples {
	if (locale === "de-CH" || locale === "fr-CH" || locale === "it-CH") return SWITZERLAND[locale];
	const market = marketOf(locale);
	return market === "CH" ? SWITZERLAND["de-CH"] : SAMPLES[market];
}

/** The specimen page: the unclaimed sample, as its directory fills it. */
export function specimenOf(locale: Locale): HomeSample {
	return homeSamples(locale)[0];
}
