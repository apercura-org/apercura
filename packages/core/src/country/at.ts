import { formatPhoneAt, toE164At } from "../phone-at";
import { AT_ID_SCHEMES, isValidAtSourceId } from "../slugs";
import {
	AT_DEFAULT_PROFESSIONS,
	AT_PROFESSIONS,
	atListingSlugFor,
	isAtListingSlug,
} from "../taxonomy/at";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Namensnennung 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.de";

/** The nine Bundesländer, by their Statistik Austria number (the first digit of a Gemeinde code). */
export const AT_STATES: Readonly<Record<string, string>> = {
	"1": "Burgenland",
	"2": "Kärnten",
	"3": "Niederösterreich",
	"4": "Oberösterreich",
	"5": "Salzburg",
	"6": "Steiermark",
	"7": "Tirol",
	"8": "Vorarlberg",
	"9": "Wien",
};

/** Statistik Austria code of the Gemeinde Wien, whose 23 districts are listed like arrondissements. */
export const VIENNA_CODE = "90001";

/** Austria has one time zone; any other region code is an error, never a guess. */
function timeZoneOfState(code: string): string {
	if (!AT_STATES[code]) throw new RangeError(`Unknown Austrian state code "${code}"`);
	return "Europe/Vienna";
}

/**
 * Austria, opened from the open data of three Länder (docs/adr/0002-multi-country.md,
 * "Austria"): the Vienna, Styria and Salzburg doctors lists and the Salzburg
 * dentists list under CC BY 4.0, located on Statistik Austria's municipalities. Directory pages only: no booking (the
 * Gesundheitstelematikgesetz question is open) and no e-identity claim (no
 * equivalent of Pro Santé Connect is open to Apercura); practitioners claim
 * their page with documents checked by an administrator.
 */
export const austria: CountryAdapter = {
	code: "AT",
	segment: "at",
	defaultLocale: "de",
	defaultTimeZone: "Europe/Vienna",
	timeZones: ["Europe/Vienna"],
	timeZoneOf: timeZoneOfState,
	registries: [
		{
			id: "at-wien",
			name: "Ärzte Standorte Wien",
			publisher: "Stadt Wien (data from the Ärztekammer für Wien)",
			url: "https://www.data.gv.at/katalog/dataset/fdcaabe5-0efd-4701-8fd9-49935c0d9cff",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Datenquelle: Stadt Wien – data.wien.gv.at",
			provides: ["practitioners", "activities"],
		},
		{
			id: "at-stmk",
			name: "Niedergelassene Ärzte Steiermark",
			publisher: "Land Steiermark",
			url: "https://www.data.gv.at/katalog/dataset/b0a8ca10-3968-11e2-81c1-0800200c9a66",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at",
			provides: ["practitioners", "activities"],
		},
		{
			id: "at-sbg",
			name: "Ärzte Land Salzburg",
			publisher: "Land Salzburg (list of the Ärztekammer für Salzburg)",
			url: "https://www.data.gv.at/katalog/dataset/8bd69af0-d42a-4777-beb6-1e8e87145a23",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Datenquelle: Land Salzburg – data.salzburg.gv.at",
			provides: ["practitioners", "activities"],
		},
		{
			id: "at-sbg-zahn",
			name: "Zahnärzte Land Salzburg",
			publisher: "Land Salzburg (list of the Zahnärztekammer)",
			url: "https://www.data.gv.at/katalog/dataset/90dd469f-9c41-49c4-aa86-cdf02ebaa1e0",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Datenquelle: Land Salzburg – data.salzburg.gv.at",
			provides: ["practitioners", "activities"],
		},
		{
			id: "at-places",
			name: "Gemeinden – Schwerpunkte",
			publisher: "Statistik Austria",
			url: "https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_GEM_MP_1",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Datenquelle: Statistik Austria - data.statistik.gv.at",
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: "AT-WIEN",
			name: `Praxisplan (${AT_ID_SCHEMES["AT-WIEN"]})`,
			issuer: "Ärztekammer für Wien",
			isValid: isValidAtSourceId,
		},
		{
			id: "AT-STMK",
			name: `Arztnummer Steiermark (${AT_ID_SCHEMES["AT-STMK"]})`,
			issuer: "Land Steiermark",
			isValid: isValidAtSourceId,
		},
		{
			id: "AT-SBG",
			name: `Salzburg (${AT_ID_SCHEMES["AT-SBG"]}, derived from the names)`,
			issuer: "Apercura, from the Land Salzburg list",
			isValid: isValidAtSourceId,
		},
		{
			id: "AT-SBGZ",
			name: `Salzburg dentists (${AT_ID_SCHEMES["AT-SBGZ"]}, derived from the names)`,
			issuer: "Apercura, from the Land Salzburg list",
			isValid: isValidAtSourceId,
		},
	],
	taxonomy: {
		professions: AT_PROFESSIONS,
		defaultProfessions: AT_DEFAULT_PROFESSIONS,
		listingSlugFor: atListingSlugFor,
		isListingSlug: isAtListingSlug,
	},
	phone: { callingCodes: ["43"], toE164: (raw) => toE164At(raw), format: formatPhoneAt },
	address: {
		postcode: /^\d{4}$/,
		lines: ({ street, postcode, city }) =>
			[street, [postcode, city].filter(Boolean).join(" ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis: "E-Commerce-Gesetz (ECG) § 5, Mediengesetz (MedienG) § 25 (Impressum)",
		},
		{ id: "privacy", pathname: "/confidentialite", basis: "DSGVO Art. 13, 14 und 21" },
		{ id: "terms", pathname: "/conditions", basis: "Nutzungsbedingungen des Dienstes" },
	],
	healthDataHosting: {
		regime: "DSGVO and DSG",
		basis:
			"No hosting certification: DSGVO, Datenschutzgesetz (DSG); Gesundheitstelematikgesetz 2012 for electronic health data exchange",
		url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20008120",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
