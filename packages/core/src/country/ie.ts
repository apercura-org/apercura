import { formatPhoneIe, IE_EIRCODE, toE164Ie } from "../phone-ie";
import { IE_ID_SCHEMES, type IeIdScheme, isValidIeSourceId } from "../slugs";
import {
	IE_DEFAULT_PROFESSIONS,
	IE_PROFESSIONS,
	ieListingSlugFor,
	isIeListingSlug,
} from "../taxonomy/ie";
import type { CountryAdapter, IdentifierScheme } from "./types";

const CC_BY_4 = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * The re-use terms the PSI and HIQA attach to their registers, under the Re-use of Public Sector
 * Information regulations: free re-use in any format, acknowledging the source and copyright,
 * reproducing accurately, never misleading, never "for the principal purpose of advertising or
 * promoting a particular product or service" (docs/data-import.md, "Ireland").
 */
const PSI_REUSE = "Re-use of Public Sector Information, under the publisher's re-use conditions";

/**
 * The month the HSE's Health Atlas gave GeoHive its layers of hospitals and health centres
 * ("This data was provided by the Health Atlas in March 2020"): the pages and the data page say
 * how old these lists are. No later open list of the HSE's facilities was found in November 2026
 * (docs/data-requests/ie.md).
 */
export const IE_HSE_ATLAS_DATE = "2020-03";

/** The census whose Built Up Areas are the towns of the market (CSO, Census of Population 2022). */
export const IE_CENSUS_YEAR = 2022;

/** The four provinces, the regions of the market (grouping only: no listing of their own). */
export const IE_PROVINCES: Readonly<Record<string, string>> = {
	L: "Leinster",
	M: "Munster",
	C: "Connacht",
	U: "Ulster",
};

/**
 * The 26 counties by their code in Tailte Éireann's National Statutory Boundaries (`CO_ID`),
 * with their Irish name and province. Dublin, Cork, Galway, Limerick and Waterford are one
 * county each, whatever their local authorities (Dublin's four, the cities' councils).
 */
export const IE_COUNTIES: Readonly<
	Record<string, { readonly name: string; readonly irish: string; readonly province: string }>
> = {
	"10000": { name: "Carlow", irish: "Ceatharlach", province: "L" },
	"20000": { name: "Cavan", irish: "An Cabhán", province: "U" },
	"30000": { name: "Clare", irish: "An Clár", province: "M" },
	"40000": { name: "Cork", irish: "Corcaigh", province: "M" },
	"50000": { name: "Donegal", irish: "Dún na nGall", province: "U" },
	"60000": { name: "Galway", irish: "Gaillimh", province: "C" },
	"70000": { name: "Kerry", irish: "Ciarraí", province: "M" },
	"80000": { name: "Kildare", irish: "Cill Dara", province: "L" },
	"90000": { name: "Kilkenny", irish: "Cill Chainnigh", province: "L" },
	"100000": { name: "Laois", irish: "Laois", province: "L" },
	"110000": { name: "Leitrim", irish: "Liatroim", province: "C" },
	"120000": { name: "Limerick", irish: "Luimneach", province: "M" },
	"130000": { name: "Longford", irish: "An Longfort", province: "L" },
	"140000": { name: "Louth", irish: "Lú", province: "L" },
	"150000": { name: "Mayo", irish: "Maigh Eo", province: "C" },
	"160000": { name: "Meath", irish: "An Mhí", province: "L" },
	"170000": { name: "Monaghan", irish: "Muineachán", province: "U" },
	"180000": { name: "Offaly", irish: "Uíbh Fhailí", province: "L" },
	"190000": { name: "Roscommon", irish: "Ros Comáin", province: "C" },
	"200000": { name: "Sligo", irish: "Sligeach", province: "C" },
	"210000": { name: "Tipperary", irish: "Tiobraid Árann", province: "M" },
	"220000": { name: "Waterford", irish: "Port Láirge", province: "M" },
	"230000": { name: "Westmeath", irish: "An Iarmhí", province: "L" },
	"240000": { name: "Wexford", irish: "Loch Garman", province: "L" },
	"250000": { name: "Wicklow", irish: "Cill Mhantáin", province: "L" },
	"260000": { name: "Dublin", irish: "Baile Átha Cliath", province: "L" },
};

/** The county code of a county as the lists write it (`Co. Cork`, `CORK`, `Dublin 15`), or null. */
export function ieCountyOfName(raw: string | null | undefined): string | null {
	// Word by word, so no pattern backtracks over a run of spaces (`Co.Cork` is `Co.` `Cork`).
	const words = (raw ?? "").toLowerCase().replace(/^co\./, "co. ").split(/\s/).filter(Boolean);
	if (words[0] === "county" || words[0] === "co" || words[0] === "co.") words.shift();
	const last = words.at(-1);
	if (words.length > 1 && (last === "city" || last === "county")) words.pop();
	const value = words.join(" ");
	if (!value) return null;
	// Dublin's postal districts (`Dublin 15`, `Dublin 6W`) are in County Dublin.
	const name = /^dublin\s*\d{1,2}w?$/.test(value) ? "dublin" : value;
	return (
		Object.entries(IE_COUNTIES).find(([, county]) => county.name.toLowerCase() === name)?.[0] ??
		null
	);
}

/**
 * Ireland has one time zone. A region code is a province letter (`L`), a county code of
 * Tailte Éireann (`40000`) or a CSO Built Up Area code (five digits, `13200`); anything else is an
 * error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!IE_PROVINCES[code] && !IE_COUNTIES[code] && !/^\d{5}$/.test(code)) {
		throw new RangeError(`Unknown Irish region "${code}"`);
	}
	return "Europe/Dublin";
}

const SCHEME_NAMES: Readonly<Record<IeIdScheme, { name: string; issuer: string }>> = {
	"IE-PSI": {
		name: "PSI registration number of a retail pharmacy business",
		issuer: "Pharmaceutical Society of Ireland, Register of Pharmacies",
	},
	"IE-HIQA": {
		name: "HIQA centre id of a designated centre for older people",
		issuer: "Health Information and Quality Authority, register of designated centres",
	},
	"IE-HSE-HOSP": {
		name: "Key derived from a hospital's county, name and address",
		issuer: "HSE Health Atlas, Hospitals – HSE Ireland (GeoHive)",
	},
	"IE-HSE-HC": {
		name: "Key derived from a health centre's county, name and address",
		issuer: "HSE Health Atlas, Health Centres – HSE Ireland (GeoHive)",
	},
};

const practitionerIds: IdentifierScheme[] = (Object.keys(IE_ID_SCHEMES) as IeIdScheme[]).map(
	(id) => ({ id, ...SCHEME_NAMES[id], isValid: (value) => isValidIeSourceId(id, value) }),
);

/**
 * Ireland, opened from the registers its regulators publish for re-use and the HSE's open
 * layers (docs/adr/0002-multi-country.md, "Ireland"): the retail pharmacy businesses of the
 * Pharmaceutical Society of Ireland's register (monthly), the designated centres for older
 * people of HIQA's register (nursing homes, a live export), both under their publishers' re-use
 * conditions, and the hospitals and health centres of the HSE's Health Atlas on GeoHive (CC BY
 * 4.0, a March 2020 snapshot). Facilities are placed in the 26 counties (Tailte Éireann) and the
 * towns of the census (the CSO's Built Up Areas, 2022) by the town and county their list
 * writes, never by Eircode (the Eircode database is not open data); the HSE's facilities keep
 * their layer's point. A page is a facility, never a person: the superintendent pharmacist, the
 * person in charge and an individual registered provider are never read. No booking and no
 * e-identity claim: a facility claims its page with documents checked by an administrator.
 */
export const ireland: CountryAdapter = {
	code: "IE",
	segment: "ie",
	defaultLocale: "en",
	defaultTimeZone: "Europe/Dublin",
	timeZones: ["Europe/Dublin"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "ie-psi",
			name: "Register of Pharmacies (retail pharmacy businesses)",
			publisher: "Pharmaceutical Society of Ireland (PSI)",
			url: "https://www.psi.ie/information-and-resources/information-about-our-public-registers",
			licence: PSI_REUSE,
			licenceUrl: "https://www.psi.ie/terms-use",
			attribution:
				"Source: Pharmaceutical Society of Ireland, Register of Pharmacies. © Pharmaceutical Society of Ireland.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ie-hiqa",
			name: "Register of designated centres for older people",
			publisher: "Health Information and Quality Authority (HIQA)",
			url: "https://www.hiqa.ie/areas-we-work/older-peoples-services",
			licence: PSI_REUSE,
			licenceUrl: "https://www.hiqa.ie/disclaimer",
			attribution:
				"Source: Health Information and Quality Authority, register of designated centres for older people. © HIQA.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ie-hse-hospitals",
			name: "Hospitals – HSE Ireland (Health Atlas, March 2020)",
			publisher: "Health Service Executive (HSE), published on GeoHive",
			url: "https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Source: Health Service Executive, Health Atlas Ireland, Hospitals – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ie-hse-health-centres",
			name: "Health Centres – HSE Ireland (Health Atlas, March 2020)",
			publisher: "Health Service Executive (HSE), published on GeoHive",
			url: "https://www.arcgis.com/home/item.html?id=c2e825ef881b4e7daca59b0faa232b72",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Source: Health Service Executive, Health Atlas Ireland, Health Centres – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ie-counties",
			name: "Counties – National Statutory Boundaries – 2019 – Generalised 20m",
			publisher: "Tailte Éireann",
			url: "https://www.arcgis.com/home/item.html?id=7ef9c5102d61424295e98505a00251ea",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "© Tailte Éireann, Counties – National Statutory Boundaries, CC BY 4.0.",
			provides: ["places"],
		},
		{
			id: "ie-towns",
			name: `Census ${IE_CENSUS_YEAR} Built Up Areas`,
			publisher: "Central Statistics Office (CSO) and Tailte Éireann",
			url: "https://www.arcgis.com/home/item.html?id=2c859a48a4dd482e8811191773b7ec51",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: `Source: CSO and Tailte Éireann, Census ${IE_CENSUS_YEAR} Built Up Areas, CC BY 4.0 (towns' points computed by Apercura).`,
			provides: ["places"],
		},
		{
			id: "ie-placenames",
			name: "Centres of Population – National Placenames Gazetteer",
			publisher: "Tailte Éireann",
			url: "https://www.arcgis.com/home/item.html?id=b0693f23738d45c7a328a03821d6f845",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"© Tailte Éireann, Centres of Population – National Placenames Gazetteer, CC BY 4.0.",
			provides: ["places"],
		},
	],
	practitionerIds,
	taxonomy: {
		professions: IE_PROFESSIONS,
		defaultProfessions: IE_DEFAULT_PROFESSIONS,
		listingSlugFor: ieListingSlugFor,
		isListingSlug: isIeListingSlug,
	},
	phone: { callingCodes: ["353"], toE164: (raw) => toE164Ie(raw), format: formatPhoneIe },
	address: {
		postcode: IE_EIRCODE,
		// An Irish address: the street, the town, then the Eircode on a line of its own
		// (An Post's form), as the UK's address prints its postcode.
		lines: ({ street, postcode, city }) =>
			[street, city, postcode].filter((line): line is string => Boolean(line)),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis:
				"Directive 2000/31/EC, article 5, as Ireland transposed it: European Communities (Directive 2000/31/EC) Regulations 2003 (S.I. No. 68 of 2003), regulation 7",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14, 21 and 77; Data Protection Act 2018 (the Data Protection Commission, section 11, for a complaint from Ireland)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: S.I. No. 358 of 2020 binds public sector bodies; the European Accessibility Act regulations (S.I. No. 636 of 2023) bind e-commerce services, which a free directory is not",
		},
	],
	healthDataHosting: {
		regime: "GDPR and Data Protection Act 2018",
		basis:
			"No hosting certification: GDPR and the Data Protection Act 2018; a directory without booking processes no health data (GDPR article 9)",
		url: "https://www.dataprotection.ie/",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
