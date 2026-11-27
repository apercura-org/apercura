import { DE_POSTCODE, formatPhoneDe, toE164De } from "../phone-de";
import { DE_ID_SCHEMES, type DeIdScheme, isValidDeSourceId } from "../slugs";
import {
	DE_DEFAULT_PROFESSIONS,
	DE_PROFESSIONS,
	deListingSlugFor,
	isDeListingSlug,
} from "../taxonomy/de";
import type { CountryAdapter, IdentifierScheme } from "./types";

const CC_BY_4 = "Creative Commons Namensnennung 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.de";
const DL_DE_BY_2 = "Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0)";
const DL_DE_BY_2_URL = "https://www.govdata.de/dl-de/by-2-0";
/** Destatis's terms, printed on every edition: reproduction and distribution with the source. */
const DESTATIS_TERMS =
	"Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet";

/**
 * The edition year the source notes name (`© Statistisches Bundesamt (Destatis), 2026`): the
 * year the directory of hospitals (reporting year 2024) and the municipalities' directory
 * (31 December 2025) were published. Raised with the editions the import reads.
 */
export const DESTATIS_YEAR = 2026;

/**
 * The sixteen Länder by their official code (Amtlicher Gemeindeschlüssel, AGS: the first two
 * digits of every Kreis and Gemeinde code).
 */
export const DE_STATES: Readonly<Record<string, string>> = {
	"01": "Schleswig-Holstein",
	"02": "Hamburg",
	"03": "Niedersachsen",
	"04": "Bremen",
	"05": "Nordrhein-Westfalen",
	"06": "Hessen",
	"07": "Rheinland-Pfalz",
	"08": "Baden-Württemberg",
	"09": "Bayern",
	"10": "Saarland",
	"11": "Berlin",
	"12": "Brandenburg",
	"13": "Mecklenburg-Vorpommern",
	"14": "Sachsen",
	"15": "Sachsen-Anhalt",
	"16": "Thüringen",
};

/**
 * The Länder whose pharmacies are listed: Thuringia and Brandenburg, whose supervising
 * authorities publish their lists of pharmacies as open data. Every other Land's list is not
 * open, or not current (Saarland's open list was captured in March 2021), so the pharmacies'
 * pages name these Länder.
 */
export const DE_PHARMACY_STATES: readonly string[] = ["16", "12"];

/**
 * Germany has one time zone. A region code is a Land (`09`), a Kreis (`09162`) or a Gemeinde
 * (`09162000`) of a known Land; anything else is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{2}(?:\d{3}(?:\d{3})?)?$/.test(code) || !DE_STATES[code.slice(0, 2)]) {
		throw new RangeError(`Unknown German region "${code}"`);
	}
	return "Europe/Berlin";
}

const scheme = (id: DeIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidDeSourceId(id, value),
});

/**
 * Germany, opened from the directory of hospitals and of prevention and rehabilitation clinics
 * that the statistical offices publish every year (Statistisches Bundesamt, "Verzeichnis der
 * Krankenhäuser und Vorsorge- oder Rehabilitationseinrichtungen"; reproduction allowed with the
 * source) and the pharmacy lists of the Länder that publish a current one as open data (Thuringia under CC
 * BY 4.0, Brandenburg under dl-de/by-2-0), placed in the Länder, Kreise and Gemeinden
 * of Destatis's municipalities' directory (GV-ISys) by their official code. The hospital
 * directory publishes no coordinates: a site is located at its Gemeinde's geographic centre, at
 * city precision. Facilities only: Germany's registers of doctors and dentists are not open
 * (docs/adr/0002-multi-country.md, "Germany"), and the hospital directory's e-mail and web
 * addresses, operators' names, beds and pseudonymous ids are never stored. No booking and no
 * e-identity claim: a facility claims its page with documents checked by an administrator.
 */
export const germany: CountryAdapter = {
	code: "DE",
	segment: "de",
	defaultLocale: "de",
	defaultTimeZone: "Europe/Berlin",
	timeZones: ["Europe/Berlin"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "de-destatis-khv",
			name: "Verzeichnis der Krankenhäuser und Vorsorge- oder Rehabilitationseinrichtungen",
			publisher:
				"Statistisches Bundesamt (Destatis), im Auftrag der Statistischen Ämter des Bundes und der Länder",
			url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Krankenhaeuser/Publikationen/_publikationen-innen-krankenhausverzeichnis.html",
			licence: DESTATIS_TERMS,
			licenceUrl: "https://www.destatis.de/DE/Service/Impressum/_inhalt.html",
			attribution: `© Statistisches Bundesamt (Destatis), ${DESTATIS_YEAR}`,
			provides: ["practitioners", "activities"],
		},
		{
			id: "de-destatis-gv",
			name: "Gemeindeverzeichnis-Informationssystem (GV-ISys): alle politisch selbständigen Gemeinden",
			publisher:
				"Statistisches Bundesamt (Destatis), im Auftrag der Statistischen Ämter des Bundes und der Länder",
			url: "https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html",
			licence: DESTATIS_TERMS,
			licenceUrl: "https://www.destatis.de/DE/Service/Impressum/_inhalt.html",
			attribution: `© Statistisches Bundesamt (Destatis), ${DESTATIS_YEAR}`,
			provides: ["places"],
		},
		{
			id: "de-apo-th",
			name: "Apotheken in Thüringen",
			publisher:
				"Thüringer Landesamt für Verbraucherschutz (TLV), über die Geodateninfrastruktur Thüringen (GDI-Th)",
			url: "https://registry.gdi-de.org/id/de.th.csw/259ef2fc-1c82-40cc-99c6-f5b9b1d3dbeb",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "© GDI-Th",
			provides: ["practitioners", "activities"],
		},
		{
			id: "de-apo-bb",
			name: "Standorte der Apotheken im Land Brandenburg",
			publisher:
				"Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit Brandenburg (LAVG), über die Landesvermessung und Geobasisinformation Brandenburg (LGB)",
			url: "https://registry.gdi-de.org/id/de.bb.metadata/62474539-faa4-4d28-a7ab-74375cf826b4",
			licence: DL_DE_BY_2,
			licenceUrl: DL_DE_BY_2_URL,
			attribution:
				"© Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit Brandenburg, dl-de/by-2-0 (Daten geändert)",
			provides: ["practitioners", "activities"],
		},
	],
	practitionerIds: [
		scheme("DE-KHV", "Hospital site key (derived)", "Apercura, from the Destatis directory"),
		scheme(
			"DE-RHV",
			"Prevention or rehabilitation clinic key (derived)",
			"Apercura, from the Destatis directory",
		),
		scheme("DE-APO-TH", "Pharmacy file number", "Freistaat Thüringen"),
		scheme("DE-APO-BB", "Pharmacy key (derived)", "Apercura, from Brandenburg's list"),
	],
	taxonomy: {
		professions: DE_PROFESSIONS,
		defaultProfessions: DE_DEFAULT_PROFESSIONS,
		listingSlugFor: deListingSlugFor,
		isListingSlug: isDeListingSlug,
	},
	phone: { callingCodes: ["49"], toE164: (raw) => toE164De(raw), format: formatPhoneDe },
	address: {
		postcode: DE_POSTCODE,
		// A German address: the street and number, then the postcode and the town (`24939 Flensburg`).
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
				"Digitale-Dienste-Gesetz (DDG) § 5; Medienstaatsvertrag (MStV) § 18 Abs. 2 for journalistic and editorial content",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis: "DSGVO Art. 13, 14 und 21; Bundesdatenschutzgesetz (BDSG)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Nutzungsbedingungen des Dienstes" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Barrierefreiheitsstärkungsgesetz (BFSG) does not cover a free directory; BITV 2.0 binds federal public bodies",
		},
	],
	healthDataHosting: {
		regime: "DSGVO and BDSG",
		basis:
			"No hosting certification for a directory: DSGVO and BDSG; § 393 SGB V (cloud processing of social and health data, BSI C5) binds statutory health insurance providers and their processors, which a directory without booking is not",
		url: "https://www.gesetze-im-internet.de/sgb_5/__393.html",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the German market, as stored in `directory.practitioners.id_scheme`. */
export const DE_SCHEME_IDS = Object.keys(DE_ID_SCHEMES) as DeIdScheme[];
