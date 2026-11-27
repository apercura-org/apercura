import { formatPhoneNo, NO_POSTCODE, toE164No } from "../phone-no";
import { isValidNoSourceId, NO_ID_SCHEMES, type NoIdScheme } from "../slugs";
import {
	isNoListingSlug,
	NO_DEFAULT_PROFESSIONS,
	NO_PROFESSIONS,
	noListingSlugFor,
} from "../taxonomy/no";
import type { CountryAdapter, IdentifierScheme } from "./types";

/** The Norwegian Licence for Open Government Data, version 2.0, as data.norge.no names it. */
const NLOD_2 = "Norsk lisens for offentlige data (NLOD) 2.0";
const NLOD_2_URL = "https://data.norge.no/nlod/no/2.0";
const CC_BY_4 = "Creative Commons Navngivelse 4.0 Internasjonal (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.no";

/**
 * The fifteen counties (fylker) since the regional reform of 1 January 2024, by their county
 * number, the first two digits of every municipality number in them (Kartverket's
 * administrative divisions).
 */
export const NO_COUNTIES: Readonly<Record<string, string>> = {
	"03": "Oslo",
	"11": "Rogaland",
	"15": "Møre og Romsdal",
	"18": "Nordland",
	"31": "Østfold",
	"32": "Akershus",
	"33": "Buskerud",
	"34": "Innlandet",
	"39": "Vestfold",
	"40": "Telemark",
	"42": "Agder",
	"46": "Vestland",
	"50": "Trøndelag",
	"55": "Troms",
	"56": "Finnmark",
};

/** Oslo: a county and a municipality (`0301`) at once, whose page is the county's, like Paris. */
export const OSLO_MUNICIPALITY = "0301";

/**
 * Mainland Norway has one time zone. A region code is a county number (two digits) or a
 * municipality number (four digits) of a known county; anything else is an error, never a
 * guess. Svalbard (`21xx`) is not a county and not listed.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{2}(?:\d{2})?$/.test(code) || !NO_COUNTIES[code.slice(0, 2)]) {
		throw new RangeError(`Unknown Norwegian region "${code}"`);
	}
	return "Europe/Oslo";
}

const scheme = (id: NoIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidNoSourceId(id, value),
});

/**
 * Norway, opened from the Brønnøysund Register Centre's Central Coordinating Register for Legal
 * Entities (Enhetsregisteret, open data under the Norwegian Licence for Open Government Data,
 * NLOD 2.0): its establishments (underenheter) registered under a health or pharmacy industry
 * code, placed in Kartverket's counties and municipalities (administrative divisions, CC BY 4.0)
 * and located at the addresses of the cadastre (Matrikkelen – Adresse, CC BY 4.0). Establishments
 * only, never people: a sole proprietorship (enkeltpersonforetak) is named after its owner, a
 * person, and is not listed; nor is an establishment named after a doctor or dentist
 * (docs/adr/0002-multi-country.md, "Norway"). Pages are factual, as the Health Personnel Act
 * (helsepersonelloven, § 13) asks of any marketing of health services. No booking and no
 * e-identity claim: an establishment claims its page with documents checked by an administrator.
 */
export const norway: CountryAdapter = {
	code: "NO",
	segment: "no",
	defaultLocale: "nb",
	defaultTimeZone: "Europe/Oslo",
	timeZones: ["Europe/Oslo"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "no-brreg",
			name: "Enhetsregisteret: underenheter",
			publisher: "Brønnøysundregistrene",
			url: "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
			licence: NLOD_2,
			licenceUrl: NLOD_2_URL,
			attribution:
				"Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av Apercura",
			provides: ["practitioners", "activities"],
		},
		{
			id: "no-adresser",
			name: "Matrikkelen – Adresse",
			publisher: "Kartverket",
			url: "https://kartkatalog.geonorge.no/metadata/matrikkelen-adresse/f7df7a18-b30f-4745-bd64-d0863812350c",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Adresser: © Kartverket, CC BY 4.0",
			provides: ["activities"],
		},
		{
			id: "no-kommuner",
			name: "Administrative inndelinger: fylker og kommuner",
			publisher: "Kartverket",
			url: "https://kartkatalog.geonorge.no/metadata/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Fylker og kommuner: © Kartverket, CC BY 4.0",
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme(
			"NO-ORGNR",
			"Organisation number of the establishment",
			"Brønnøysundregistrene (Brønnøysund Register Centre)",
		),
	],
	taxonomy: {
		professions: NO_PROFESSIONS,
		defaultProfessions: NO_DEFAULT_PROFESSIONS,
		listingSlugFor: noListingSlugFor,
		isListingSlug: isNoListingSlug,
	},
	phone: { callingCodes: ["47"], toE164: (raw) => toE164No(raw), format: formatPhoneNo },
	address: {
		postcode: NO_POSTCODE,
		// A Norwegian address: the street and number, then the postcode and the post town
		// (`0150 Oslo`).
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
				"Ehandelsloven § 8: the service provider's name, address, e-mail and other contact details, its register and organisation number and whether it is registered for VAT (a provider established in another EEA state follows its own state's rules, § 5)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21, Norwegian law through the EEA Agreement and personopplysningsloven; supervisory authority: Datatilsynet",
		},
		{ id: "terms", pathname: "/conditions", basis: "Vilkår for bruk av tjenesten" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: forskrift om universell utforming av IKT-løsninger § 4 asks a private undertaking's web solutions to meet WCAG 2.0 A and AA; the accessibility statement of § 4e binds public bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and personopplysningsloven",
		basis:
			"No hosting certification for a directory: the GDPR and the Personal Data Act (personopplysningsloven); the Code of Conduct for information security and data protection in the healthcare and care services sector (Normen) binds the undertakings connected to the Norwegian health network, which a directory without booking is not",
		url: "https://lovdata.no/dokument/NL/lov/2018-06-15-38",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Norwegian market, as stored in `directory.practitioners.id_scheme`. */
export const NO_SCHEME_IDS = Object.keys(NO_ID_SCHEMES) as NoIdScheme[];
