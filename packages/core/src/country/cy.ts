import { CY_POSTCODE, formatPhoneCy, toE164Cy } from "../phone-cy";
import { CY_ID_SCHEMES, type CyIdScheme, isValidCySourceId } from "../slugs";
import {
	CY_DEFAULT_PROFESSIONS,
	CY_PROFESSIONS,
	cyListingSlugFor,
	isCyListingSlug,
} from "../taxonomy/cy";
import type { CountryAdapter, IdentifierScheme } from "./types";

/** The licence of every Cypriot source, as data.gov.cy names it. */
const CC_BY_4 = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.el";

/**
 * The five districts (επαρχίες) of the areas the Government of the Republic of Cyprus controls,
 * by the Statistical Service's (CYSTAT) district code, named as a page names them. The district
 * of Kyrenia (2) lies wholly in the areas where the Government does not exercise effective
 * control: no open source lists a facility there, so the market has no place there either.
 */
export const CY_DISTRICTS: Readonly<Record<string, string>> = {
	"1": "Επαρχία Λευκωσίας",
	"3": "Επαρχία Αμμοχώστου",
	"4": "Επαρχία Λάρνακας",
	"5": "Επαρχία Λεμεσού",
	"6": "Επαρχία Πάφου",
};

/**
 * Cyprus has one time zone. A region code is a district's code (`1`, `3` to `6`) or a
 * municipality's or community's four-digit code in it (`1000`, `5000`); anything else is an
 * error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	const district = /^([1-6])(?:\d{3})?$/.exec(code)?.[1];
	if (!district || !CY_DISTRICTS[district]) {
		throw new RangeError(`Unknown Cypriot region "${code}"`);
	}
	return "Europe/Nicosia";
}

const scheme = (id: CyIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidCySourceId(id, value),
});

/**
 * Cyprus, opened from the open lists of the Ministry of Health on the national open data portal
 * (data.gov.cy, every one under CC BY 4.0): the Pharmaceutical Services' list of private
 * pharmacies, and the Ministry's lists of state hospitals and state health centres; placed in the
 * five districts and their municipalities and communities as the Statistical Service's 2021
 * census counts them (CYSTAT), located at the municipality's or community's centre that Cyprus
 * Post's table of postcodes by municipality and community gives (Department of Postal
 * Services), or at a hospital's own point. Facilities only: the pharmacist each pharmacy is
 * listed under, and their home telephone number, are never read (docs/adr/0002-multi-country.md,
 * "Cyprus"), so a pharmacy is named after its address. No booking and no e-identity claim: a
 * facility claims its page with documents checked by an administrator.
 *
 * Listings are uniform for all, without paid prominence, as article 45 of the Cyprus Medical
 * Association's Code of Medical Ethics asks of any directory listing doctors.
 */
export const cyprus: CountryAdapter = {
	code: "CY",
	segment: "cy",
	defaultLocale: "el",
	defaultTimeZone: "Europe/Nicosia",
	timeZones: ["Europe/Nicosia"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "cy-farmakeia",
			name: "Κατάλογος Ιδιωτικών Φαρμακείων",
			publisher: "Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας",
			url: "https://www.data.gov.cy/el/dataset/katalogos-idiotikon-farmakeion",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Κατάλογος Ιδιωτικών Φαρμακείων: Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura",
			provides: ["practitioners", "activities"],
		},
		{
			id: "cy-nosokomeia",
			name: "Κατάλογος Κρατικών Νοσοκομείων Κύπρου",
			publisher: "Υπουργείο Υγείας",
			url: "https://www.data.gov.cy/el/dataset/katalogos-kratikon-nosokomeion-kyproy",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Κατάλογος Κρατικών Νοσοκομείων Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura",
			provides: ["practitioners", "activities"],
		},
		{
			id: "cy-kentra-ygeias",
			name: "Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου",
			publisher: "Υπουργείο Υγείας",
			url: "https://www.data.gov.cy/el/dataset/katalogos-kratikon-kentron-ygeias-kyproy",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura",
			provides: ["practitioners", "activities"],
		},
		{
			id: "cy-tk",
			name: "Ταχυδρομικοί Κώδικες ανά Δήμο, Κοινότητα και Επαρχία",
			publisher: "Τμήμα Ταχυδρομικών Υπηρεσιών (Κυπριακά Ταχυδρομεία)",
			url: "https://www.data.gov.cy/el/dataset/tahydromikoi-kodikes-ana-dimo-koinotita-kai-eparhia",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Ταχυδρομικοί κώδικες ανά δήμο και κοινότητα: Τμήμα Ταχυδρομικών Υπηρεσιών, CC BY 4.0",
			provides: ["places", "activities"],
		},
		{
			id: "cy-apografi",
			name: "Απογραφή Πληθυσμού και Κατοικιών 2021: πληθυσμός κατά επαρχία και δήμο/κοινότητα",
			publisher: "Στατιστική Υπηρεσία Κύπρου (ΚΥΣΤΑΤ)",
			url: "https://www.data.gov.cy/el/dataset/katoikies-noikokyria-idrymata-kai-plithysmos-poy-katagrafikan-kata-eparhia-dimokoinotita",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Δήμοι και κοινότητες: Στατιστική Υπηρεσία Κύπρου, Απογραφή 2021, CC BY 4.0",
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme(
			"CY-FARM",
			"Pharmacy registration number (ΑΜ)",
			"Φαρμακευτικές Υπηρεσίες (Pharmaceutical Services)",
		),
		scheme("CY-MOH", "State facility key", "Apercura, from the Ministry of Health's lists"),
	],
	taxonomy: {
		professions: CY_PROFESSIONS,
		defaultProfessions: CY_DEFAULT_PROFESSIONS,
		listingSlugFor: cyListingSlugFor,
		isListingSlug: isCyListingSlug,
	},
	phone: { callingCodes: ["357"], toE164: (raw) => toE164Cy(raw), format: formatPhoneCy },
	address: {
		postcode: CY_POSTCODE,
		// A Cypriot address: the street and number, then the postcode and the place (`6023 Λάρνακα`).
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
				"Law 156(I)/2004 on information society services and electronic commerce, section 8: the service provider's name, address, contact details, e-mail included, register and number, VAT number",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; Law 125(I)/2018 (the GDPR's implementing law); supervisory authority: the Commissioner for Personal Data Protection (Επίτροπος Προστασίας Δεδομένων Προσωπικού Χαρακτήρα)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Όροι χρήσης της υπηρεσίας" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: Law 50(I)/2019 on the accessibility of websites and mobile applications binds public sector bodies, and the accessibility requirements for products and services (Directive (EU) 2019/882) cover e-commerce and the other services they list, not a free directory",
		},
	],
	healthDataHosting: {
		regime: "GDPR and Law 125(I)/2018",
		basis:
			"No hosting certification for a directory: the GDPR and its implementing law, Law 125(I)/2018; a directory without booking processes no health data",
		url: "https://www.dataprotection.gov.cy",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Cypriot market, as stored in `directory.practitioners.id_scheme`. */
export const CY_SCHEME_IDS = Object.keys(CY_ID_SCHEMES) as CyIdScheme[];
