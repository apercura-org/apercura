import { CZ_POSTCODE, formatPhoneCz, toE164Cz } from "../phone-cz";
import { CZ_ID_SCHEME, isValidCzSourceId } from "../slugs";
import {
	CZ_DEFAULT_PROFESSIONS,
	CZ_PROFESSIONS,
	czListingSlugFor,
	isCzListingSlug,
} from "../taxonomy/cz";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Uveďte původ 4.0 Mezinárodní (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.cs";
/** The year of the RÚIAN data in use, as ČÚZK's terms ask for it („ČÚZK, [rok]“). */
const RUIAN_YEAR = 2026;

/**
 * The fourteen regions (kraje), by their NUTS 3 code: the code the NRPZS and the Czech
 * Statistical Office print (`ZZ_kraj_kod`), and RÚIAN's `NutsLau` of a region.
 */
export const CZ_REGIONS: Readonly<Record<string, string>> = {
	CZ010: "Hlavní město Praha",
	CZ020: "Středočeský kraj",
	CZ031: "Jihočeský kraj",
	CZ032: "Plzeňský kraj",
	CZ041: "Karlovarský kraj",
	CZ042: "Ústecký kraj",
	CZ051: "Liberecký kraj",
	CZ052: "Královéhradecký kraj",
	CZ053: "Pardubický kraj",
	CZ063: "Kraj Vysočina",
	CZ064: "Jihomoravský kraj",
	CZ071: "Olomoucký kraj",
	CZ072: "Zlínský kraj",
	CZ080: "Moravskoslezský kraj",
};

/** RÚIAN code of the municipality of Prague, whose 22 administrative districts list like arrondissements. */
export const PRAGUE_CODE = "554782";

/**
 * The district (okres) code of Prague (LAU 1 `CZ0100`): Prague is a region and a
 * municipality and has no district in RÚIAN, but the NRPZS and the statistics name one.
 */
export const PRAGUE_DISTRICT_CODE = "CZ0100";

/**
 * Czechia has one time zone. A region code is a region or district NUTS/LAU code (`CZ010`,
 * `CZ0642`, `CZ020C`); any other one is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^CZ0\d{2}[0-9A-F]?$/.test(code))
		throw new RangeError(`Unknown Czech region code "${code}"`);
	return "Europe/Prague";
}

/**
 * Czechia, opened from the National Register of Healthcare Providers (NRPZS) published by
 * ÚZIS under CC BY 4.0 (docs/adr/0002-multi-country.md, "Czechia"): the places of care of
 * general practitioners, paediatricians, dentists, gynaecologists, specialists, pharmacies,
 * home care agencies, physiotherapists, clinical psychologists, speech therapists and midwives,
 * located by the register's own coordinates and placed in the regions, districts and
 * municipalities of RÚIAN (ČÚZK, CC BY 4.0). A page is a facility, under its name in the
 * register (a sole trader's facility carries their name: the Czech DPA allowed basic profiles
 * in 2013, and an objection removes the page); the provider's company number, seat and
 * professional representative are never stored. No booking and no e-identity claim: a
 * facility claims its page with documents checked by an administrator.
 */
export const czechia: CountryAdapter = {
	code: "CZ",
	segment: "cz",
	defaultLocale: "cs",
	defaultTimeZone: "Europe/Prague",
	timeZones: ["Europe/Prague"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "cz-nrpzs",
			name: "NRPZS: Místa poskytování zdravotních služeb",
			publisher:
				"Ústav zdravotnických informací a statistiky ČR (ÚZIS ČR) and the Ministry of Health of the Czech Republic",
			url: "https://www.nzip.cz/data/1823-narodni-registr-poskytovatelu-zdravotnich-sluzeb-otevrena-data",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Zdroj: Ministerstvo zdravotnictví ČR a Ústav zdravotnických informací a statistiky ČR, Národní registr poskytovatelů zdravotních služeb (nzip.cz)",
			provides: ["practitioners", "activities"],
		},
		{
			id: "cz-ruian",
			name: "RÚIAN: územní prvky (stát, základní datová sada)",
			publisher: "Český úřad zeměměřický a katastrální (ČÚZK)",
			url: "https://cuzk.gov.cz/ruian/Poskytovani-udaju-ISUI-RUIAN-VDP/Vymenny-format-RUIAN-(VFR).aspx",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: `ČÚZK, ${RUIAN_YEAR}`,
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: CZ_ID_SCHEME,
			name: "NRPZS facility number (ZZ_ID)",
			issuer: "Ústav zdravotnických informací a statistiky ČR, NRPZS",
			isValid: isValidCzSourceId,
		},
	],
	taxonomy: {
		professions: CZ_PROFESSIONS,
		defaultProfessions: CZ_DEFAULT_PROFESSIONS,
		listingSlugFor: czListingSlugFor,
		isListingSlug: isCzListingSlug,
	},
	phone: { callingCodes: ["420"], toE164: (raw) => toE164Cz(raw), format: formatPhoneCz },
	address: {
		postcode: CZ_POSTCODE,
		// A Czech address: the street and number, then the postcode and the town (`110 00 Praha 1`).
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
				"Act No. 480/2004 Coll. on certain information society services and § 435 of the Civil Code (Act No. 89/2012 Coll.)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis: "GDPR articles 13, 14 and 21; Act No. 110/2019 Coll. on personal data processing",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis: "Voluntary statement: Act No. 99/2019 Coll. binds public sector bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and Act No. 110/2019 Coll.",
		basis:
			"No hosting certification: GDPR and Act No. 110/2019 Coll. on personal data processing; Act No. 372/2011 Coll. on health services governs the records providers keep",
		url: "https://www.zakonyprolidi.cz/cs/2019-110",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
