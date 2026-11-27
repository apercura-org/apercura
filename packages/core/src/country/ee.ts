import { EE_POSTCODE, formatPhoneEe, toE164Ee } from "../phone-ee";
import { EE_ID_SCHEMES, type EeIdScheme, isValidEeSourceId } from "../slugs";
import {
	EE_DEFAULT_PROFESSIONS,
	EE_PROFESSIONS,
	eeListingSlugFor,
	isEeListingSlug,
} from "../taxonomy/ee";
import type { CountryAdapter, IdentifierScheme } from "./types";

/** The Health Board's licence, as andmed.eesti.ee names it ("jurisdiktsiooniga sidumata"). */
const CC_BY_NC_SA_3 =
	"Creative Commons Autorile viitamine-Mitteäriline eesmärk-Jagamine samadel tingimustel 3.0 Jurisdiktsiooniga sidumata (CC BY-NC-SA 3.0)";
const CC_BY_NC_SA_3_URL = "https://creativecommons.org/licenses/by-nc-sa/3.0/deed.et";
const CC0 = "Creative Commons CC0 1.0 Üldine (CC0 1.0)";
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/deed.et";
/** The Land and Spatial Development Board's open data licence (its Creative Commons equivalent: CC BY 4.0). */
const MARU_LICENCE = "Maa- ja Ruumiameti avaandmete litsents";
const MARU_LICENCE_URL = "https://geoportaal.maaruum.ee/avaandmete-litsents";

/**
 * The date of the administrative and settlement units the places were imported from (the
 * `EKSPORT` date of the Land and Spatial Development Board's monthly files), which its credit
 * names ("Haldus- ja asustusjaotus: Maa- ja Ruumiamet 01.11.2026"). Raised with the places
 * import (`etl:places --country ee`, which prints the date it read).
 */
export const EE_PLACES_DATE = "2026-11-01";

/** `2026-11-01` → `01.11.2026`, the way an Estonian credit dates its data. */
function estonianDate(iso: string): string {
	const [year, month, day] = iso.split("-");
	return `${day}.${month}.${year}`;
}

/**
 * The fifteen counties (maakonnad) by their EHAK code, the classification of Estonian
 * administrative and settlement units that Statistics Estonia keeps.
 */
export const EE_COUNTIES: Readonly<Record<string, string>> = {
	"0037": "Harju maakond",
	"0039": "Hiiu maakond",
	"0045": "Ida-Viru maakond",
	"0050": "Jõgeva maakond",
	"0052": "Järva maakond",
	"0056": "Lääne maakond",
	"0060": "Lääne-Viru maakond",
	"0064": "Põlva maakond",
	"0068": "Pärnu maakond",
	"0071": "Rapla maakond",
	"0074": "Saare maakond",
	"0079": "Tartu maakond",
	"0081": "Valga maakond",
	"0084": "Viljandi maakond",
	"0087": "Võru maakond",
};

/**
 * Estonia has one time zone. A region code is an EHAK code of four digits (a county, a
 * municipality or a settlement); anything else is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{4}$/.test(code)) throw new RangeError(`Unknown Estonian region "${code}"`);
	return "Europe/Tallinn";
}

const scheme = (id: EeIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidEeSourceId(id, value),
});

/**
 * Estonia, opened from the Health Board's register of healthcare providers and their activity
 * licences (Terviseamet, MEDRE open data on andmed.eesti.ee, CC BY-NC-SA 3.0) and the State
 * Agency of Medicines' register of pharmacies (Ravimiamet, CC0 1.0), placed in the counties,
 * municipalities and settlements of the Land and Spatial Development Board's administrative
 * and settlement division (EHAK units, Maa- ja Ruumiamet, open data with its credit) and
 * located at their address points (the address data system ADS, CC0 1.0). Providers only: the
 * health workers the register names with each provider are never read (docs/adr/0002-multi-country.md,
 * "Estonia"), nor a pharmacy's responsible pharmacist, e-mail or holder. A provider's page
 * prints its activity licence numbers, as the Advertising Act (§ 22(3)) requires of any
 * information about a provider. No booking and no e-identity claim: a provider claims its page
 * with documents checked by an administrator.
 *
 * The Health Board's data is under CC BY-NC-SA 3.0: republished non-commercially (Apercura is
 * free, without ads or paid ranking) and under the same licence, which the data page and every
 * page's credit say; an operator who would use it commercially must not import it
 * (docs/self-hosting.md).
 */
export const estonia: CountryAdapter = {
	code: "EE",
	segment: "ee",
	defaultLocale: "et",
	defaultTimeZone: "Europe/Tallinn",
	timeZones: ["Europe/Tallinn"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "ee-medre",
			name: "Tervishoiuteenuse osutajate ning tegevuslubade andmestik",
			publisher:
				"Terviseamet; tervishoiukorralduse infosüsteem MEDRE, mida haldab Tervise ja Heaolu Infosüsteemide Keskus (TEHIK)",
			url: "https://andmed.eesti.ee/datasets/tervishoiuteenuse-osutajate-ning-tegevuslubade-andmestik",
			licence: CC_BY_NC_SA_3,
			licenceUrl: CC_BY_NC_SA_3_URL,
			attribution:
				"Terviseamet, tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ee-ravimiamet",
			name: "Ravimiameti tegevuslubade register: apteekide koondandmed",
			publisher: "Ravimiamet",
			url: "https://andmed.eesti.ee/datasets/ravimiameti-tegevuslubade-register",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Ravimiamet, tegevuslubade register",
			provides: ["practitioners", "activities"],
		},
		{
			id: "ee-ads",
			name: "Aadressiandmete süsteem (ADS): aadressid ja posti sihtnumbrid",
			publisher: "Maa- ja Ruumiamet",
			url: "https://geoportaal.maaruum.ee/est/ruumiandmed/aadressiandmed/aadressid-ja-posti-sihtnumbrid-p582.html",
			licence: CC0,
			licenceUrl: CC0_URL,
			attribution: "Aadressiandmed: Maa- ja Ruumiamet",
			provides: ["activities"],
		},
		{
			id: "ee-ehak",
			name: "Haldus- ja asustusjaotus (EHAK)",
			publisher: "Maa- ja Ruumiamet",
			url: "https://geoportaal.maaruum.ee/est/ruumiandmed/haldus-ja-asustusjaotus-p119.html",
			licence: MARU_LICENCE,
			licenceUrl: MARU_LICENCE_URL,
			attribution: `Haldus- ja asustusjaotus: Maa- ja Ruumiamet ${estonianDate(EE_PLACES_DATE)}`,
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme("EE-TTL", "Activity licence number", "Terviseamet (Health Board)"),
		scheme("EE-APT", "Pharmacy place of business code", "Ravimiamet (State Agency of Medicines)"),
	],
	taxonomy: {
		professions: EE_PROFESSIONS,
		defaultProfessions: EE_DEFAULT_PROFESSIONS,
		listingSlugFor: eeListingSlugFor,
		isListingSlug: isEeListingSlug,
	},
	phone: { callingCodes: ["372"], toE164: (raw) => toE164Ee(raw), format: formatPhoneEe },
	address: {
		postcode: EE_POSTCODE,
		// An Estonian address: the street and number, then the postcode and the place (`50412 Tartu`).
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
				"Infoühiskonna teenuse seadus (InfoTS) § 4 lg 1: the service provider's name, registry code and register, address and contact details, e-mail included",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; isikuandmete kaitse seadus (IKS); supervisory authority: Andmekaitse Inspektsioon",
		},
		{ id: "terms", pathname: "/conditions", basis: "Teenuse kasutustingimused" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Toodete ja teenuste ligipääsetavuse seadus (LPS) covers e-commerce and the other services it lists, not a free directory, and the Public Information Act's web accessibility rules bind public bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and IKS",
		basis:
			"No hosting certification for a directory: the GDPR and the Personal Data Protection Act (isikuandmete kaitse seadus); health data exchanged with the national Health Information System is governed by the Health Services Organisation Act, which a directory without booking does not take part in",
		url: "https://www.riigiteataja.ee/akt/IKS",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Estonian market, as stored in `directory.practitioners.id_scheme`. */
export const EE_SCHEME_IDS = Object.keys(EE_ID_SCHEMES) as EeIdScheme[];
