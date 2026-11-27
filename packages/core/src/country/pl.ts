import { formatPhonePl, PL_POSTCODE, toE164Pl } from "../phone-pl";
import { isValidPlSourceId, PL_ID_SCHEME } from "../slugs";
import {
	isPlListingSlug,
	PL_DEFAULT_PROFESSIONS,
	PL_PROFESSIONS,
	plListingSlugFor,
} from "../taxonomy/pl";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Uznanie autorstwa 4.0 Międzynarodowe (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.pl";

/**
 * The placeholders of RPWDL's attribution: the reuse conditions of the register on dane.gov.pl
 * ask to state the time the information was produced and the time it was obtained (art. 15
 * ust. 1 pkt 1 of the open data act), filled in by the page with the date of the register's
 * report the import read and the day of that import (`apps/web/src/lib/market.ts`).
 */
export const PL_PRODUCED_AT = "{produced}";
export const PL_OBTAINED_AT = "{obtained}";

/** The date TERC's official file is of, as its `STAN_NA` says (raised with the file the places import read). */
export const PL_TERC_AS_OF = "1 stycznia 2026 r.";

/** The sixteen voivodeships (województwa) by their TERYT code: the first two digits of every powiat and gmina code. */
export const PL_VOIVODESHIPS: Readonly<Record<string, string>> = {
	"02": "dolnośląskie",
	"04": "kujawsko-pomorskie",
	"06": "lubelskie",
	"08": "lubuskie",
	"10": "łódzkie",
	"12": "małopolskie",
	"14": "mazowieckie",
	"16": "opolskie",
	"18": "podkarpackie",
	"20": "podlaskie",
	"22": "pomorskie",
	"24": "śląskie",
	"26": "świętokrzyskie",
	"28": "warmińsko-mazurskie",
	"30": "wielkopolskie",
	"32": "zachodniopomorskie",
};

/** TERYT code of the gmina of Warsaw (miasto stołeczne Warszawa), a city with powiat rights. */
export const WARSAW_CODE = "1465011";

/**
 * Poland has one time zone. A region code is a voivodeship (`12`), a powiat (`1261`) or a gmina
 * (`1261011`, its kind last) of a known voivodeship; anything else is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{2}(?:\d{2}(?:\d{3})?)?$/.test(code) || !PL_VOIVODESHIPS[code.slice(0, 2)]) {
		throw new RangeError(`Unknown Polish region "${code}"`);
	}
	return "Europe/Warsaw";
}

/**
 * Poland, opened from RPWDL, the register of entities performing medical activity kept by
 * Centrum e-Zdrowia and published daily on dane.gov.pl under CC BY 4.0, with the time of
 * production and of obtaining stated (docs/adr/0002-multi-country.md, "Poland"): one page per
 * healthcare establishment (zakład leczniczy) of the healthcare entities (podmioty lecznicze),
 * hospitals, clinics, hospices, care homes, sanatoria, laboratories, placed in the voivodeships,
 * powiats and gminas of TERYT (GUS) and located at their gmina's interior point (computed from
 * GUGiK's State Register of Boundaries). The individual and group practices of doctors,
 * dentists, nurses and midwives (praktyki zawodowe), the register's other part, are not listed
 * until a legal opinion on listing named practitioners (III OSK 1052/21). A natural person who
 * runs an entity is never named from the entity's name, and the establishment's name drops theirs
 * where the register gives it alone. No booking and no e-identity claim: an establishment claims
 * its page with documents an administrator checks.
 */
export const poland: CountryAdapter = {
	code: "PL",
	segment: "pl",
	defaultLocale: "pl",
	defaultTimeZone: "Europe/Warsaw",
	timeZones: ["Europe/Warsaw"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "pl-rpwdl",
			name: "Rejestr Podmiotów Wykonujących Działalność Leczniczą (RPWDL): podmioty lecznicze",
			publisher: "Centrum e-Zdrowia",
			url: "https://dane.gov.pl/pl/dataset/728,rejestr-podmiotow-wykonujacych-dziaalnosc-lecznicza",
			licence: `${CC_BY_4}, with the time of production and of obtaining stated (art. 15 ust. 1 pkt 1 of the open data act)`,
			licenceUrl: CC_BY_4_URL,
			attribution: `Źródło: Centrum e-Zdrowia, Rejestr Podmiotów Wykonujących Działalność Leczniczą (dane.gov.pl), licencja CC BY 4.0. Czas wytworzenia: ${PL_PRODUCED_AT}; czas pozyskania: ${PL_OBTAINED_AT}. Dane przetworzone.`,
			provides: ["practitioners", "activities"],
		},
		{
			id: "pl-teryt",
			name: "TERYT: rejestr podziału terytorialnego kraju (TERC)",
			publisher: "Główny Urząd Statystyczny",
			url: "https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: `Źródło: Główny Urząd Statystyczny, rejestr TERYT (TERC), stan na ${PL_TERC_AS_OF}, CC BY 4.0.`,
			provides: ["places"],
		},
		{
			id: "pl-prg",
			name: "Państwowy Rejestr Granic (PRG): granice gmin",
			publisher: "Główny Urząd Geodezji i Kartografii",
			url: "https://dane.gov.pl/pl/dataset/726,panstwowy-rejestr-granic-i-powierzchni-jednostek-podziaow-terytorialnych-kraju-prg",
			licence: `${CC_BY_4}; material of the State Geodetic and Cartographic Resource, free under the geodetic law (art. 40a ust. 2 pkt 1 lit. a)`,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Opracowano na podstawie materiałów państwowego zasobu geodezyjnego i kartograficznego: Państwowy Rejestr Granic, Główny Urząd Geodezji i Kartografii, CC BY 4.0.",
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: PL_ID_SCHEME,
			name: "RPWDL establishment number (ID ZOZ)",
			issuer: "Centrum e-Zdrowia, RPWDL",
			isValid: isValidPlSourceId,
		},
	],
	taxonomy: {
		professions: PL_PROFESSIONS,
		defaultProfessions: PL_DEFAULT_PROFESSIONS,
		listingSlugFor: plListingSlugFor,
		isListingSlug: isPlListingSlug,
	},
	phone: { callingCodes: ["48"], toE164: (raw) => toE164Pl(raw), format: formatPhonePl },
	address: {
		postcode: PL_POSTCODE,
		// A Polish address: the street and number, then the postcode and the town (`59-220 Legnica`).
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
				"Art. 5 of the Act of 18 July 2002 on providing services by electronic means (ustawa o świadczeniu usług drogą elektroniczną)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; the Act of 10 May 2018 on personal data protection (ustawa o ochronie danych osobowych)",
		},
		{
			id: "terms",
			pathname: "/conditions",
			basis:
				"Art. 8 of the Act of 18 July 2002 on providing services by electronic means: the terms of an electronic service (regulamin)",
		},
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Act of 4 April 2019 on digital accessibility binds public bodies only",
		},
	],
	healthDataHosting: {
		regime: "GDPR and the Act of 10 May 2018 on personal data protection",
		basis:
			"No hosting certification: GDPR and the Act of 10 May 2018 on personal data protection; the Act of 6 November 2008 on patients' rights and the Patient Rights Ombudsman governs the records providers keep",
		url: "https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001000",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
