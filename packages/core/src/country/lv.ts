import { formatPhoneLv, LV_POSTCODE, toE164Lv } from "../phone-lv";
import { isValidLvSourceId, LV_ID_SCHEMES, type LvIdScheme } from "../slugs";
import {
	isLvListingSlug,
	LV_DEFAULT_PROFESSIONS,
	LV_PROFESSIONS,
	lvListingSlugFor,
} from "../taxonomy/lv";
import type { CountryAdapter, IdentifierScheme } from "./types";

const CC0 = "CC0 1.0 Universal (Creative Commons Public Domain Dedication)";
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/deed.lv";
const CC_BY_4 = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.lv";

/**
 * Latvia's five statistical regions (NUTS 3, since 1 January 2024), by their code in the Central
 * Statistical Bureau's classification of administrative territories (ATVK and NUTS 3, CC0). The
 * Central Statistical Bureau names the first "Rīga"; it holds Rīga and the municipalities around
 * it, so it is named the region it is, apart from the city.
 */
export const LV_REGIONS: Readonly<Record<string, string>> = {
	LV00A: "Rīgas reģions",
	LV00B: "Kurzeme",
	LV00C: "Vidzeme",
	LV009: "Zemgale",
	LV005: "Latgale",
};

/**
 * The statistical region of each of Latvia's 42 administrative territories since the reform of
 * 1 July 2021 (seven state cities, valstspilsētas, and 35 municipalities, novadi), by ATVK code,
 * as the Central Statistical Bureau's classification gives it (`ATU_NUTS_codes.csv`, data of
 * 25 August 2026). A territory missing from the table is an error of the import, never a guess.
 */
export const LV_DEPARTMENT_REGIONS: Readonly<Record<string, string>> = {
	"0001000": "LV00A", // Rīga
	"0002000": "LV005", // Daugavpils
	"0003000": "LV009", // Jelgava
	"0004000": "LV00A", // Jūrmala
	"0005000": "LV00B", // Liepāja
	"0006000": "LV005", // Rēzekne
	"0007000": "LV00B", // Ventspils
	"0020000": "LV009", // Aizkraukles novads
	"0021000": "LV00C", // Alūksnes novads
	"0022000": "LV005", // Augšdaugavas novads
	"0023000": "LV00A", // Ādažu novads
	"0024000": "LV005", // Balvu novads
	"0025000": "LV009", // Bauskas novads
	"0026000": "LV00C", // Cēsu novads
	"0027000": "LV00B", // Dienvidkurzemes novads
	"0028000": "LV009", // Dobeles novads
	"0029000": "LV00C", // Gulbenes novads
	"0030000": "LV009", // Jelgavas novads
	"0031000": "LV009", // Jēkabpils novads
	"0032000": "LV005", // Krāslavas novads
	"0033000": "LV00B", // Kuldīgas novads
	"0034000": "LV00A", // Ķekavas novads
	"0035000": "LV00C", // Limbažu novads
	"0036000": "LV005", // Līvānu novads
	"0037000": "LV005", // Ludzas novads
	"0038001": "LV00C", // Madonas novads
	"0039000": "LV00A", // Mārupes novads
	"0040000": "LV00C", // Ogres novads
	"0041000": "LV00A", // Olaines novads
	"0042000": "LV005", // Preiļu novads
	"0043000": "LV005", // Rēzeknes novads
	"0044000": "LV00A", // Ropažu novads
	"0045000": "LV00A", // Salaspils novads
	"0046000": "LV00B", // Saldus novads
	"0047000": "LV00C", // Saulkrastu novads
	"0048000": "LV00A", // Siguldas novads
	"0049000": "LV00C", // Smiltenes novads
	"0051000": "LV00B", // Talsu novads
	"0052000": "LV00B", // Tukuma novads
	"0053000": "LV00C", // Valkas novads
	"0054000": "LV00C", // Valmieras novads
	"0056000": "LV00B", // Ventspils novads
};

/** The ATVK codes of the seven state cities (valstspilsētas): each a territory and a town at once. */
export const LV_STATE_CITIES: readonly string[] = [
	"0001000",
	"0002000",
	"0003000",
	"0004000",
	"0005000",
	"0006000",
	"0007000",
];

/** The ATVK code of Rīga. */
export const RIGA_CODE = "0001000";

/**
 * The statistical region of an ATVK code: a territory's own (`0054000`), or that of the
 * territory a town or parish belongs to (`0054010`, Valmiera's parishes and towns share its first
 * four digits, and Madona's `0038…` its own), or null.
 */
export function lvRegionOf(code: string): string | null {
	if (LV_REGIONS[code]) return code;
	if (!/^\d{7}$/.test(code)) return null;
	const direct = LV_DEPARTMENT_REGIONS[code];
	if (direct) return direct;
	const prefix = code.slice(0, 4);
	const department = Object.keys(LV_DEPARTMENT_REGIONS).find((key) => key.startsWith(prefix));
	return department ? (LV_DEPARTMENT_REGIONS[department] ?? null) : null;
}

/**
 * Latvia has one time zone. A region code is a statistical region (`LV00A`) or the ATVK code of a
 * territory, town or parish of a known territory (`0001000`, `0054010`); anything else is an
 * error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!lvRegionOf(code)) throw new RangeError(`Unknown Latvian region "${code}"`);
	return "Europe/Riga";
}

const scheme = (id: LvIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidLvSourceId(id, value),
});

/**
 * Latvia, opened from three lists published under CC0 1.0 on the national open data portal
 * (data.gov.lv): the National Health Service's quarterly list of the GPs it contracts and their
 * practices (Nacionālais veselības dienests, "Ģimenes ārsta praksē reģistrēto pacientu skaits"),
 * joined by the institution's code to the addresses of medical institutions that the Ministry of
 * the Interior's Information Centre publishes from the single emergency contact centre's
 * geographic system (VKCP IĢIS), which also lists hospitals, and the State Agency of Medicines'
 * register of licensed pharmacies (Zāļu valsts aģentūra). Places are the State Land Service's
 * address register (VZD, CC BY 4.0): the seven state cities and 35 municipalities of the 2021
 * reform, their towns and parishes.
 *
 * A GP practice's page names its GPs, as the National Health Service publishes them for patients
 * to choose one (legitimate interest, docs/data-import.md, "Latvia"); the GPs' identifiers and
 * patient counts are never stored. A practice whose address is not in the Ministry's list is not
 * listed. No booking and no e-identity claim: a place claims its page with documents checked by
 * an administrator.
 */
export const latvia: CountryAdapter = {
	code: "LV",
	segment: "lv",
	defaultLocale: "lv",
	defaultTimeZone: "Europe/Riga",
	timeZones: ["Europe/Riga"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "lv-nvd-gp",
			name: "Ģimenes ārsta praksē reģistrēto pacientu skaits",
			publisher: "Nacionālais veselības dienests",
			url: "https://data.gov.lv/dati/lv/dataset/gimenes-arsta-prakse-registreto-pacientu-skaits",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Avots: Nacionālais veselības dienests, data.gov.lv (CC0 1.0)",
			provides: ["practitioners", "activities"],
		},
		{
			id: "lv-vkcp",
			name: "VKCP IĢIS – ārstniecības iestāžu adreses",
			publisher: "Iekšlietu ministrijas Informācijas centrs",
			url: "https://data.gov.lv/dati/lv/dataset/vkcp-igis-arstniecibas-iestazu-adreses",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Avots: Iekšlietu ministrijas Informācijas centrs, data.gov.lv (CC0 1.0)",
			provides: ["practitioners", "activities"],
		},
		{
			id: "lv-zva",
			name: "Farmaceitiskās darbības uzņēmumu reģistrs",
			publisher: "Zāļu valsts aģentūra",
			url: "https://data.gov.lv/dati/lv/dataset/farmaceitiskas-darbibas-uznemumu-registrs",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Avots: Zāļu valsts aģentūra, data.gov.lv (CC0 1.0)",
			provides: ["practitioners", "activities"],
		},
		{
			id: "lv-var",
			name: "Valsts adrešu reģistra atvērtie dati",
			publisher: "Valsts zemes dienests",
			url: "https://data.gov.lv/dati/lv/dataset/varis-atvertie-dati",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Izmantoti Valsts adrešu reģistra informācijas sistēmas dati (Valsts zemes dienests, CC BY 4.0), apvienoti ar citiem avotiem",
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme("LV-GP", "Medical institution code (GP practice)", "Veselības inspekcija"),
		scheme(
			"LV-SLIM",
			"Hospital line of the list of medical institutions' addresses",
			"Iekšlietu ministrijas Informācijas centrs",
		),
		scheme("LV-APT", "Pharmacy number", "Zāļu valsts aģentūra"),
	],
	taxonomy: {
		professions: LV_PROFESSIONS,
		defaultProfessions: LV_DEFAULT_PROFESSIONS,
		listingSlugFor: lvListingSlugFor,
		isListingSlug: isLvListingSlug,
	},
	phone: { callingCodes: ["371"], toE164: (raw) => toE164Lv(raw), format: formatPhoneLv },
	address: {
		postcode: LV_POSTCODE,
		// A Latvian address: the street and number, then the town (and its parish and municipality
		// outside the cities) and the postcode (`Rīgas iela 5, Sigulda, LV-2150`).
		lines: ({ street, postcode, city }) =>
			[street, [city, postcode].filter(Boolean).join(", ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis: "Informācijas sabiedrības pakalpojumu likums, 4. pants",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis: "VDAR (GDPR) 13., 14. un 21. pants; Fizisko personu datu apstrādes likums",
		},
		{ id: "terms", pathname: "/conditions", basis: "Pakalpojuma lietošanas noteikumi" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: Cabinet Regulation No. 445 of 14 July 2020 on the accessibility of websites binds public bodies, not a free directory",
		},
	],
	healthDataHosting: {
		regime: "GDPR and the Personal Data Processing Law",
		basis:
			"No hosting certification found for a directory (unverified): GDPR and the Fizisko personu datu apstrādes likums; the Ārstniecības likums governs medical records",
		url: "https://likumi.lv/ta/id/300099-fizisko-personu-datu-apstrades-likums",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Latvian market, as stored in `directory.practitioners.id_scheme`. */
export const LV_SCHEME_IDS = Object.keys(LV_ID_SCHEMES) as LvIdScheme[];
