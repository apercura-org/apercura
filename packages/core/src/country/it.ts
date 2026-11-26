import { formatPhoneIt, IT_POSTCODE, toE164It } from "../phone-it";
import { IT_ID_SCHEMES, type ItIdScheme, isValidItSourceId } from "../slugs";
import {
	IT_DEFAULT_PROFESSIONS,
	IT_PROFESSIONS,
	isItListingSlug,
	itListingSlugFor,
} from "../taxonomy/it";
import type { CountryAdapter, IdentifierScheme } from "./types";

const IODL = "Italian Open Data Licence v2.0 (IODL 2.0)";
const IODL_URL = "https://www.dati.gov.it/iodl/2.0/";

/**
 * The reference date of ISTAT's boundaries in use (1 January of the year), as their name gives
 * it ("Confini delle unità amministrative a fini statistici al 1° gennaio 2026").
 */
export const ISTAT_BOUNDARIES_YEAR = 2026;

/**
 * The twenty regions by ISTAT code (`COD_REG`, two digits). The Ministry of Health's lists
 * write a region as ten times its ISTAT code (`010` Piemonte, `120` Lazio), with Trentino-Alto
 * Adige's two autonomous provinces apart (`041` Bolzano, `042` Trento): `itRegionOfMinistryCode`.
 */
export const IT_REGIONS: Readonly<Record<string, string>> = {
	"01": "Piemonte",
	"02": "Valle d'Aosta/Vallée d'Aoste",
	"03": "Lombardia",
	"04": "Trentino-Alto Adige/Südtirol",
	"05": "Veneto",
	"06": "Friuli-Venezia Giulia",
	"07": "Liguria",
	"08": "Emilia-Romagna",
	"09": "Toscana",
	"10": "Umbria",
	"11": "Marche",
	"12": "Lazio",
	"13": "Abruzzo",
	"14": "Molise",
	"15": "Campania",
	"16": "Puglia",
	"17": "Basilicata",
	"18": "Calabria",
	"19": "Sicilia",
	"20": "Sardegna",
};

/**
 * The ISTAT region (`12`) of a region code of the Ministry of Health's lists (`120`, or `041`
 * and `042` for the autonomous provinces of Bolzano and Trento), or null when it names none.
 */
export function itRegionOfMinistryCode(code: string): string | null {
	const value = code.trim();
	if (!/^\d{3}$/.test(value)) return null;
	if (value === "041" || value === "042") return "04";
	if (!value.endsWith("0")) return null;
	const region = value.slice(0, 2);
	return IT_REGIONS[region] ? region : null;
}

/**
 * Italy has one time zone. A region code is an ISTAT region (`12`), province or metropolitan
 * city (`058`, `258`) or municipality (`058091`) code; any other one is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (/^\d{2}$/.test(code) ? !IT_REGIONS[code] : !/^\d{3}(?:\d{3})?$/.test(code)) {
		throw new RangeError(`Unknown Italian region code "${code}"`);
	}
	return "Europe/Rome";
}

const SCHEME_NAMES: Readonly<Record<ItIdScheme, { name: string; issuer: string }>> = {
	"IT-FARM": {
		name: "Ministerial pharmacy code (codice identificativo della farmacia)",
		issuer: "Ministero della Salute, Farmacie",
	},
	"IT-PFARM": {
		name: "Parapharmacy logistic-site code (codice identificativo del sito logistico)",
		issuer: "Ministero della Salute, Parafarmacie",
	},
	"IT-HSP": {
		name: "Hospital facility code of the HSP.11 model (codice struttura)",
		issuer: "Ministero della Salute, Posti letto per struttura ospedaliera",
	},
};

const practitionerIds: IdentifierScheme[] = (Object.keys(IT_ID_SCHEMES) as ItIdScheme[]).map(
	(id) => ({ id, ...SCHEME_NAMES[id], isValid: (value) => isValidItSourceId(id, value) }),
);

/**
 * Italy, opened from the open data of the Ministry of Health (docs/adr/0002-multi-country.md,
 * "Italy"), under the Italian Open Data Licence 2.0: the pharmacies open to the public with
 * their branches and dispensaries, the parapharmacies (both lists daily), and the hospitals
 * and accredited private clinics of the yearly hospital bed counts, placed in ISTAT's regions,
 * provinces and municipalities by their ISTAT codes and located at their municipality's centre
 * (ISTAT boundaries, CC BY 4.0). A page is a place, under the name the ministry publishes (a
 * pharmacy's company name can name its pharmacists: what follows a title or a company form is
 * left out, and an objection removes the page); the owner's VAT number is never stored. No
 * individual health worker is listed. No booking and no e-identity claim: a place claims its
 * page with documents checked by an administrator.
 */
export const italy: CountryAdapter = {
	code: "IT",
	segment: "it",
	defaultLocale: "it",
	defaultTimeZone: "Europe/Rome",
	timeZones: ["Europe/Rome"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "it-farmacie",
			name: "Farmacie",
			publisher: "Ministero della Salute",
			url: "https://www.dati.salute.gov.it/it/dataset/farmacie/",
			licence: IODL,
			licenceUrl: IODL_URL,
			attribution: "Fonte: Ministero della Salute, Farmacie, IODL 2.0",
			provides: ["practitioners", "activities"],
		},
		{
			id: "it-parafarmacie",
			name: "Parafarmacie",
			publisher: "Ministero della Salute",
			url: "https://www.dati.salute.gov.it/it/dataset/parafarmacie/",
			licence: IODL,
			licenceUrl: IODL_URL,
			attribution: "Fonte: Ministero della Salute, Parafarmacie, IODL 2.0",
			provides: ["practitioners", "activities"],
		},
		{
			id: "it-posti-letto",
			name: "Posti letto per struttura ospedaliera",
			publisher: "Ministero della Salute",
			url: "https://www.dati.salute.gov.it/it/dataset/posti-letto-per-struttura-ospedaliera/",
			licence: IODL,
			licenceUrl: IODL_URL,
			attribution: "Fonte: Ministero della Salute, Posti letto per struttura ospedaliera, IODL 2.0",
			provides: ["practitioners", "activities"],
		},
		{
			id: "it-istat",
			name: `Confini delle unità amministrative a fini statistici al 1° gennaio ${ISTAT_BOUNDARIES_YEAR}`,
			publisher: "Istituto Nazionale di Statistica (Istat)",
			url: "https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/",
			licence: "CC BY 4.0",
			licenceUrl: "https://creativecommons.org/licenses/by/4.0/deed.it",
			attribution: `Fonte: Istat, Confini delle unità amministrative a fini statistici al 1° gennaio ${ISTAT_BOUNDARIES_YEAR}, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)`,
			provides: ["places"],
		},
	],
	practitionerIds,
	taxonomy: {
		professions: IT_PROFESSIONS,
		defaultProfessions: IT_DEFAULT_PROFESSIONS,
		listingSlugFor: itListingSlugFor,
		isListingSlug: isItListingSlug,
	},
	phone: { callingCodes: ["39"], toE164: (raw) => toE164It(raw), format: formatPhoneIt },
	address: {
		postcode: IT_POSTCODE,
		// An Italian address: the street and number, then the CAP and the municipality
		// (`00184 Roma`).
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
				"D.Lgs. 70/2003 (information society services and electronic commerce), article 7; D.P.R. 633/1972, article 35 (VAT number on the website)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; Codice in materia di protezione dei dati personali (D.Lgs. 196/2003, as amended by D.Lgs. 101/2018)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: Legge 4/2004 (Legge Stanca) binds public administrations and the largest private companies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and Codice privacy",
		basis:
			"No hosting certification: GDPR and D.Lgs. 196/2003 as amended by D.Lgs. 101/2018 (Codice privacy); the Garante's rules on health data bind the controllers of care records",
		url: "https://www.garanteprivacy.it/",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
