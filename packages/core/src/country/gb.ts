import { formatPhoneGb, GB_POSTCODE, toE164Gb } from "../phone-gb";
import { GB_ID_SCHEMES, type GbIdScheme, isValidGbSourceId } from "../slugs";
import {
	GB_DEFAULT_PROFESSIONS,
	GB_PROFESSIONS,
	gbListingSlugFor,
	isGbListingSlug,
} from "../taxonomy/gb";
import type { CountryAdapter, IdentifierScheme } from "./types";

const OGL = "Open Government Licence v3.0";
const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
/** The year of the OS and ONS data in use, as their attribution statements ask. */
const COPYRIGHT_YEAR = 2026;

/**
 * The regions of the UK listings: England's nine regions (ONS RGN codes) and the
 * three other nations (ONS country codes), the way the UK's own statistics group
 * local authorities.
 */
export const GB_REGIONS: Readonly<Record<string, { name: string; nation: string }>> = {
	E12000001: { name: "North East", nation: "E92000001" },
	E12000002: { name: "North West", nation: "E92000001" },
	E12000003: { name: "Yorkshire and The Humber", nation: "E92000001" },
	E12000004: { name: "East Midlands", nation: "E92000001" },
	E12000005: { name: "West Midlands", nation: "E92000001" },
	E12000006: { name: "East of England", nation: "E92000001" },
	E12000007: { name: "London", nation: "E92000001" },
	E12000008: { name: "South East", nation: "E92000001" },
	E12000009: { name: "South West", nation: "E92000001" },
	W92000004: { name: "Wales", nation: "W92000004" },
	S92000003: { name: "Scotland", nation: "S92000003" },
	N92000002: { name: "Northern Ireland", nation: "N92000002" },
};

/** The four nations (ONS country codes). */
export const GB_NATIONS: Readonly<Record<string, string>> = {
	E92000001: "England",
	W92000004: "Wales",
	S92000003: "Scotland",
	N92000002: "Northern Ireland",
};

/** The nation of an ONS code (a region, a local authority or a nation): its first letter. */
export function gbNationOf(code: string): string | null {
	const nation = Object.keys(GB_NATIONS).find((key) => key.charAt(0) === code.charAt(0));
	return nation ?? null;
}

/**
 * The UK has one time zone. A region code is an ONS region, nation or local authority
 * code (`E12000007`, `S92000003`, `E09000007`); any other one is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^[ENSW]\d{8}$/.test(code)) throw new RangeError(`Unknown UK region code "${code}"`);
	return "Europe/London";
}

const SCHEME_NAMES: Record<GbIdScheme, { name: string; issuer: string }> = {
	"GB-ODS-GP": { name: "ODS code (GP practice)", issuer: "NHS England, Organisation Data Service" },
	"GB-ODS-DENT": {
		name: "ODS code (dental practice)",
		issuer: "NHS England, Organisation Data Service",
	},
	"GB-ODS-PHARM": { name: "ODS code (pharmacy)", issuer: "NHS England, Organisation Data Service" },
	"GB-PHS-GP": { name: "Practice code (sg)", issuer: "Public Health Scotland" },
	"GB-PHS-DENT": { name: "Dental practice code (sd)", issuer: "Public Health Scotland" },
	"GB-PHS-PHARM": { name: "Dispenser code (sp)", issuer: "Public Health Scotland" },
	"GB-BSO-GP": { name: "Practice number (ng)", issuer: "Business Services Organisation" },
	"GB-BSO-DENT": {
		name: "Dental surgery key (nd, derived from the address)",
		issuer: "Apercura, from the Business Services Organisation list",
	},
};

const practitionerIds: IdentifierScheme[] = (Object.keys(GB_ID_SCHEMES) as GbIdScheme[]).map(
	(id) => ({ id, ...SCHEME_NAMES[id], isValid: (value) => isValidGbSourceId(id, value) }),
);

/**
 * The United Kingdom, opened from NHS organisation data under the Open Government
 * Licence (docs/adr/0002-multi-country.md, "United Kingdom"): GP practices, dental
 * practices and pharmacies of England and Wales (NHS England's Organisation Data
 * Service), Scotland (Public Health Scotland) and Northern Ireland (Business
 * Services Organisation), located by postcode (Ordnance Survey Code-Point Open) and
 * placed in the ONS local authorities and the OS towns. Practice pages only: the
 * OGL "does not cover personal data", so no clinician is listed, and a practice
 * named after a person is shown under its premises or street. No booking and no
 * e-identity claim: a practice claims its page with documents checked by an
 * administrator.
 */
export const unitedKingdom: CountryAdapter = {
	code: "GB",
	segment: "gb",
	defaultLocale: "en",
	defaultTimeZone: "Europe/London",
	timeZones: ["Europe/London"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "gb-ods-gp",
			name: "GP practices (epraccur) and branch surgeries (ebranchs)",
			publisher: "NHS England, Organisation Data Service (England and Wales)",
			url: "https://www.odsdatasearchandexport.nhs.uk/",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains information from NHS England, Organisation Data Service, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-ods-dent",
			name: "General dental practices (egdpprac)",
			publisher: "NHS England, Organisation Data Service (England and Wales)",
			url: "https://www.odsdatasearchandexport.nhs.uk/",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains information from NHS England, Organisation Data Service, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-ods-pharm",
			name: "Pharmacies and dispensaries (edispensary)",
			publisher: "NHS England, Organisation Data Service (England and Wales)",
			url: "https://www.odsdatasearchandexport.nhs.uk/",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains information from NHS England, Organisation Data Service, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-phs-gp",
			name: "GP Practice Contact Details and List Sizes",
			publisher: "Public Health Scotland",
			url: "https://www.opendata.nhs.scot/dataset/gp-practice-contact-details-and-list-sizes",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from Public Health Scotland, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-phs-dent",
			name: "Dental Practices and Patient Registrations",
			publisher: "Public Health Scotland",
			url: "https://www.opendata.nhs.scot/dataset/dental-practices-and-patient-registrations",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from Public Health Scotland, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-phs-pharm",
			name: "Dispenser Location Contact Details",
			publisher: "Public Health Scotland",
			url: "https://www.opendata.nhs.scot/dataset/dispenser-location-contact-details",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from Public Health Scotland, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-bso-gp",
			name: "GP Practice List Sizes (GP Practice Reference File)",
			publisher: "Business Services Organisation (Northern Ireland), on OpenDataNI",
			url: "https://www.opendatani.gov.uk/@business-services-organisation/gp-practice-list-sizes",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from the Business Services Organisation, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-bso-dent",
			name: "Dentist and Surgery List (Dental Surgery List)",
			publisher: "Business Services Organisation (Northern Ireland), on OpenDataNI",
			url: "https://www.opendatani.gov.uk/@business-services-organisation/general-dental-services-statistics",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from the Business Services Organisation, licensed under the Open Government Licence v3.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "gb-postcodes",
			name: "Code-Point Open",
			publisher: "Ordnance Survey",
			url: "https://www.ordnancesurvey.co.uk/products/code-point-open",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution: `Contains OS data © Crown copyright and database right ${COPYRIGHT_YEAR}. Contains Royal Mail data © Royal Mail copyright and database right ${COPYRIGHT_YEAR}. Contains National Statistics data © Crown copyright and database right ${COPYRIGHT_YEAR}.`,
			provides: ["places"],
		},
		{
			id: "gb-towns",
			name: "OS Open Names",
			publisher: "Ordnance Survey",
			url: "https://www.ordnancesurvey.co.uk/products/os-open-names",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution: `Contains OS data © Crown copyright and database rights ${COPYRIGHT_YEAR}.`,
			provides: ["places"],
		},
		{
			id: "gb-local-authorities",
			name: "Local Authority Districts (boundaries and ward to region lookup)",
			publisher: "Office for National Statistics",
			url: "https://geoportal.statistics.gov.uk/",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution: `Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Contains OS data © Crown copyright and database right ${COPYRIGHT_YEAR}.`,
			provides: ["places"],
		},
		{
			id: "gb-ni-towns",
			name: "OSNI Open Data – Gazetteer – Place Names",
			publisher: "Land & Property Services (OSNI), on OpenDataNI",
			url: "https://www.opendatani.gov.uk/@land-property-services/osni-open-data-gazetteer-place-names",
			licence: OGL,
			licenceUrl: OGL_URL,
			attribution:
				"Contains public sector information from Land & Property Services (OSNI), licensed under the Open Government Licence v3.0.",
			provides: ["places"],
		},
	],
	practitionerIds,
	taxonomy: {
		professions: GB_PROFESSIONS,
		defaultProfessions: GB_DEFAULT_PROFESSIONS,
		listingSlugFor: gbListingSlugFor,
		isListingSlug: isGbListingSlug,
	},
	phone: { callingCodes: ["44"], toE164: (raw) => toE164Gb(raw), format: formatPhoneGb },
	address: {
		postcode: GB_POSTCODE,
		// UK addresses put the town and the postcode on lines of their own (Royal Mail).
		lines: ({ street, postcode, city }) =>
			[street, city, postcode].filter((line): line is string => Boolean(line)),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis: "Electronic Commerce (EC Directive) Regulations 2002, regulation 6",
		},
		{ id: "privacy", pathname: "/confidentialite", basis: "UK GDPR articles 13, 14 and 21" },
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
	],
	healthDataHosting: {
		regime: "UK GDPR and DPA 2018",
		basis:
			"No hosting certification: UK GDPR, Data Protection Act 2018 (as amended by the Data (Use and Access) Act 2025); the NHS Data Security and Protection Toolkit binds organisations with access to NHS patient data and systems",
		url: "https://www.legislation.gov.uk/ukpga/2018/12/contents",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
