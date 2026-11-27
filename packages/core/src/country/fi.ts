import { FI_POSTCODE, formatPhoneFi, toE164Fi } from "../phone-fi";
import { FI_ID_SCHEMES, type FiIdScheme, isValidFiSourceId } from "../slugs";
import {
	FI_DEFAULT_PROFESSIONS,
	FI_PROFESSIONS,
	fiListingSlugFor,
	isFiListingSlug,
} from "../taxonomy/fi";
import type { CountryAdapter, IdentifierScheme } from "./types";

const CC0 = "Creative Commons CC0 1.0 Yleismaailmallinen (CC0 1.0)";
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/deed.fi";
const CC_BY_4 = "Creative Commons Nimeä 4.0 Kansainvälinen (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.fi";

/**
 * The year of Statistics Finland's statistical areas the places were imported from (the
 * municipalities of 1 January, `kunta4500k_{year}`, and the correspondence tables of the year),
 * which its credit names. Raised with the places import each January (`etl:places --country
 * fi`, which prints the year it read).
 */
export const FI_PLACES_YEAR = 2026;

/**
 * The 23 areas that organise public health care, by Statistics Finland's code (classification
 * "Hyvinvointialueet sekä Helsingin kaupunki ja Ahvenanmaa"): the 21 wellbeing services counties
 * (hyvinvointialueet), the City of Helsinki and Åland.
 */
export const FI_COUNTIES: Readonly<Record<string, string>> = {
	"01": "Itä-Uudenmaan hyvinvointialue",
	"02": "Keski-Uudenmaan hyvinvointialue",
	"03": "Länsi-Uudenmaan hyvinvointialue",
	"04": "Vantaan ja Keravan hyvinvointialue",
	"05": "Varsinais-Suomen hyvinvointialue",
	"06": "Satakunnan hyvinvointialue",
	"07": "Kanta-Hämeen hyvinvointialue",
	"08": "Pirkanmaan hyvinvointialue",
	"09": "Päijät-Hämeen hyvinvointialue",
	"10": "Kymenlaakson hyvinvointialue",
	"11": "Etelä-Karjalan hyvinvointialue",
	"12": "Etelä-Savon hyvinvointialue",
	"13": "Pohjois-Savon hyvinvointialue",
	"14": "Pohjois-Karjalan hyvinvointialue",
	"15": "Keski-Suomen hyvinvointialue",
	"16": "Etelä-Pohjanmaan hyvinvointialue",
	"17": "Pohjanmaan hyvinvointialue",
	"18": "Keski-Pohjanmaan hyvinvointialue",
	"19": "Pohjois-Pohjanmaan hyvinvointialue",
	"20": "Kainuun hyvinvointialue",
	"21": "Lapin hyvinvointialue",
	"90": "Helsinki",
	"91": "Ahvenanmaa",
};

/** Statistics Finland's code of the municipality of Helsinki, the only one of its department. */
export const HELSINKI_CODE = "091";

/**
 * Finland has one time zone. A region code is a region or county code of two digits or a
 * municipality code of three; anything else is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{2,3}$/.test(code)) throw new RangeError(`Unknown Finnish region "${code}"`);
	return "Europe/Helsinki";
}

const scheme = (id: FiIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidFiSourceId(id, value),
});

/**
 * Finland, opened from the national Finnish Service Catalogue (Suomi.fi-palvelutietovaranto,
 * PTV, run by the Digital and Population Data Services Agency, DVV; CC0 1.0, its open API
 * without a key): the health service locations of the wellbeing services counties, the City of
 * Helsinki, Åland and the other public organisations that describe them there, placed in
 * Statistics Finland's municipalities, wellbeing services counties and regions (CC BY 4.0).
 * Locations only, never people: the catalogue names no person on a service location, and its
 * e-mail addresses are never read. The catalogue has no pharmacies and no private clinics
 * (docs/adr/0002-multi-country.md, "Finland").
 *
 * No booking and no e-identity claim: whether a booking tool must be a registered system
 * connected to Kanta (Act 784/2021) waits for a ruling; a directory without booking does not
 * process client data. An organiser claims its page with documents checked by an administrator.
 */
export const finland: CountryAdapter = {
	code: "FI",
	segment: "fi",
	defaultLocale: "fi",
	defaultTimeZone: "Europe/Helsinki",
	timeZones: ["Europe/Helsinki"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "fi-ptv",
			name: "Suomi.fi-palvelutietovaranto (PTV): palvelupaikat",
			publisher: "Digi- ja väestötietovirasto (DVV)",
			url: "https://avoindata.suomi.fi/data/fi/dataset/palvelutietovaranto",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Lähde: Suomi.fi-palvelutietovaranto, Digi- ja väestötietovirasto (CC0 1.0)",
			provides: ["practitioners", "activities"],
		},
		{
			id: "fi-tilastokeskus",
			name: "Kuntapohjaiset tilastointialueet ja luokitukset (kunnat, hyvinvointialueet, maakunnat)",
			publisher: "Tilastokeskus",
			url: "https://www.avoindata.fi/data/fi/dataset/kuntapohjaiset-tilastointialueet",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: `Lähde: Tilastokeskus, kuntapohjaiset tilastointialueet ${FI_PLACES_YEAR}`,
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme(
			"FI-PTV",
			"Service location id (Finnish Service Catalogue)",
			"Digi- ja väestötietovirasto (Digital and Population Data Services Agency)",
		),
	],
	taxonomy: {
		professions: FI_PROFESSIONS,
		defaultProfessions: FI_DEFAULT_PROFESSIONS,
		listingSlugFor: fiListingSlugFor,
		isListingSlug: isFiListingSlug,
	},
	phone: { callingCodes: ["358"], toE164: (raw) => toE164Fi(raw), format: formatPhoneFi },
	address: {
		postcode: FI_POSTCODE,
		// A Finnish address: the street and number, then the postcode and the post office
		// (`33100 Tampere`).
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
				"Laki sähköisen viestinnän palveluista (917/2014) 176 §: the service provider's name, address, contact details (e-mail included), trade register and business id",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; tietosuojalaki (1050/2018); supervisory authority: Tietosuojavaltuutetun toimisto (Data Protection Ombudsman)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Käyttöehdot" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement in the form of the Act on the Provision of Digital Services (laki digitaalisten palvelujen tarjoamisesta, 306/2019), which binds public bodies and some private sectors, not a free directory; the accessibility requirements act for products and services (102/2023) lists services a directory is not",
		},
	],
	healthDataHosting: {
		regime: "GDPR, the Data Protection Act and Act 784/2021",
		basis:
			"No hosting certification for a directory: the GDPR and the Data Protection Act (tietosuojalaki 1050/2018). Booking would process client data under the Act on the Processing of Client Data in Healthcare and Social Welfare (784/2021: registered class A or B systems, Kanta), which a directory without booking does not",
		url: "https://www.finlex.fi/fi/lainsaadanto/2021/784",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Finnish market, as stored in `directory.practitioners.id_scheme`. */
export const FI_SCHEME_IDS = Object.keys(FI_ID_SCHEMES) as FiIdScheme[];
