import { formatPhoneLt, LT_POSTCODE, toE164Lt } from "../phone-lt";
import { isValidLtSourceId, LT_ID_SCHEME } from "../slugs";
import {
	isLtListingSlug,
	LT_DEFAULT_PROFESSIONS,
	LT_PROFESSIONS,
	ltListingSlugFor,
} from "../taxonomy/lt";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Attribution 4.0 (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.lt";

/**
 * The ten counties (apskritys) by the Address Register's code (`adm_kodas`), named the way
 * people write them. Counties are no longer administrations (since 2010) but group the
 * municipalities everyone knows them by.
 */
export const LT_COUNTIES: Readonly<Record<string, string>> = {
	"1": "Alytaus apskritis",
	"2": "Kauno apskritis",
	"3": "Klaipėdos apskritis",
	"4": "Marijampolės apskritis",
	"5": "Panevėžio apskritis",
	"6": "Šiaulių apskritis",
	"7": "Tauragės apskritis",
	"8": "Telšių apskritis",
	"9": "Utenos apskritis",
	"10": "Vilniaus apskritis",
};

/**
 * The cities that are a municipality of their own, by the Address Register's settlement code
 * (`gyv_kodas`), with their municipality's code (`sav_kodas`): like Paris, the city's page is its
 * municipality's. Seven of them are their municipality's only settlement; Vilnius shares
 * Vilniaus miesto savivaldybė with the town of Grigiškės, which keeps its own page.
 */
export const LT_CITY_MUNICIPALITIES: Readonly<Record<string, string>> = {
	"31003": "13", // Vilnius
	"17507": "19", // Kaunas
	"18067": "21", // Klaipėda
	"28338": "29", // Šiauliai
	"23485": "27", // Panevėžys
	"10278": "11", // Alytus
	"23195": "25", // Palanga
	"21988": "23", // Neringa
};

/**
 * Lithuania has one time zone. A region code is a county (`1`–`10`), a municipality (two
 * digits, `13`) or a settlement code (four to six digits); any other one is an error, never a
 * guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!(LT_COUNTIES[code] || /^\d{2}$/.test(code) || /^\d{4,6}$/.test(code))) {
		throw new RangeError(`Unknown Lithuanian region code "${code}"`);
	}
	return "Europe/Vilnius";
}

/**
 * Lithuania, opened from the licence register of health-care institutions that the State
 * Accreditation Service for Health Care Activities (VASPVT) publishes daily on data.gov.lt under
 * CC BY 4.0 (docs/adr/0002-multi-country.md, "Lithuania"): every activity address of a licensed
 * institution, its kind read from the services licensed there, placed in the counties,
 * municipalities and settlements of the Address Register (VĮ Registrų centras, CC BY 4.0) by
 * the address as VASPVT writes it, and located at its settlement's point (computed from the
 * register's settlement boundaries) at city precision. A page prints the institution's legal
 * name as registered, its legal form abbreviated: an individual enterprise's or a small
 * partnership's name can name its owner, so the privacy notice gives the article 14 information
 * and an objection removes the page; the legal entity code, the seat address and the licence
 * numbers are never stored, and an individual enterprise's premises number is left out. No
 * individual health worker is listed. No booking and no e-identity claim: an institution claims
 * its page with documents checked by an administrator.
 */
export const lithuania: CountryAdapter = {
	code: "LT",
	segment: "lt",
	defaultLocale: "lt",
	defaultTimeZone: "Europe/Vilnius",
	timeZones: ["Europe/Vilnius"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "lt-vaspvt",
			name: "Sveikatos priežiūros įstaigų licencijų duomenys",
			publisher:
				"Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie Sveikatos apsaugos ministerijos (VASPVT)",
			url: "https://data.gov.lt/datasets/1623/",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Šaltinis: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM, „Sveikatos priežiūros įstaigų licencijų duomenys“ (data.gov.lt), CC BY 4.0",
			provides: ["practitioners", "activities"],
		},
		{
			id: "lt-adresu-registras",
			name: "Adresų registras: apskritys, savivaldybės, seniūnijos, gyvenamosios vietovės ir jų ribos",
			publisher: "Valstybės įmonė Registrų centras",
			url: "https://data.gov.lt/datasets/1287/",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Šaltinis: VĮ Registrų centras, Lietuvos Respublikos adresų registras (data.gov.lt), CC BY 4.0 (gyvenamųjų vietovių taškus apskaičiavo Apercura)",
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: LT_ID_SCHEME,
			name: "VASPVT institution number and Address Register code of the activity address",
			issuer: "Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM",
			isValid: isValidLtSourceId,
		},
	],
	taxonomy: {
		professions: LT_PROFESSIONS,
		defaultProfessions: LT_DEFAULT_PROFESSIONS,
		listingSlugFor: ltListingSlugFor,
		isListingSlug: isLtListingSlug,
	},
	phone: { callingCodes: ["370"], toE164: (raw) => toE164Lt(raw), format: formatPhoneLt },
	address: {
		postcode: LT_POSTCODE,
		// A Lithuanian address: the street and number, then the postcode and the settlement
		// (`LT-01100 Vilnius`); the licence register gives no postcode.
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
				"Law on Information Society Services (Informacinės visuomenės paslaugų įstatymas, No. X-614), article 6",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; Law on Legal Protection of Personal Data (Asmens duomenų teisinės apsaugos įstatymas)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the web accessibility rules implementing Directive (EU) 2016/2102 bind public sector bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and Asmens duomenų teisinės apsaugos įstatymas",
		basis:
			"No hosting certification: GDPR and the Law on Legal Protection of Personal Data; the Valstybinė duomenų apsaugos inspekcija supervises",
		url: "https://vdai.lrv.lt/",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
