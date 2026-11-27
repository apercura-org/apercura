import { formatPhoneSi, SI_POSTCODE, toE164Si } from "../phone-si";
import { isValidSiSourceId, SI_ID_SCHEME } from "../slugs";
import {
	isSiListingSlug,
	SI_DEFAULT_PROFESSIONS,
	SI_PROFESSIONS,
	siListingSlugFor,
} from "../taxonomy/si";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Priznanje avtorstva 4.0 Mednarodna (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.sl";

/** The dataset of the ZZZS lists on the national open data portal (CC BY 4.0). */
const ZZZS_DATASET =
	"https://podatki.gov.si/dataset/poimenski-seznami-zdravnikov-ki-so-lahko-osebni-zdravniki";

/**
 * The twelve statistical regions (statistične regije), by their code in the Register of Spatial
 * Units (RPE, GURS): the departments of Slovenia's places, each holding its municipalities.
 */
export const SI_REGIONS: Readonly<Record<string, string>> = {
	"1": "Pomurska",
	"2": "Podravska",
	"3": "Koroška",
	"4": "Savinjska",
	"5": "Zasavska",
	"6": "Posavska",
	"7": "Jugovzhodna Slovenija",
	"8": "Osrednjeslovenska",
	"9": "Gorenjska",
	"10": "Primorsko-notranjska",
	"11": "Goriška",
	"12": "Obalno-kraška",
};

/**
 * The three lists of the ZZZS's "Poimenski seznami zdravnikov, ki so lahko osebni zdravniki",
 * one registry each (a list that cannot be read is left out and keeps its pages): general
 * practices with children's and school dispensaries, women's clinics, dentists. The fourth file
 * of the page (the additional practices for adults without a personal doctor) names no doctor and
 * is not read.
 */
export const SI_LIST_IDS = ["si-zzzs-sa", "si-zzzs-gin", "si-zzzs-zob"] as const;

export type SiListId = (typeof SI_LIST_IDS)[number];

/** The ZZZS's credit line, as the CC BY 4.0 asks for it: the insurer, the dataset, the licence. */
const ZZZS_ATTRIBUTION =
	"Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0";

/**
 * Slovenia has one time zone. A region code is a statistical region (`1`–`12`) or a municipality
 * code of the RPE (`1`–`213`); any other one is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^(?:[1-9]|[1-9]\d|1\d\d|20\d|21[0-3])$/.test(code)) {
		throw new RangeError(`Unknown Slovenian region code "${code}"`);
	}
	return "Europe/Ljubljana";
}

/**
 * Slovenia, opened from the health insurer's daily lists of the doctors who can be chosen as a
 * personal doctor (Zavod za zdravstveno zavarovanje Slovenije, CC BY 4.0 on podatki.gov.si,
 * docs/adr/0002-multi-country.md, "Slovenia"): family doctors, children's and school doctors,
 * gynaecologists and dentists, each at the practices (izvajalci) the list names, with whether
 * they still take new patients, placed in the statistical regions and municipalities of the
 * Register of Spatial Units (GURS, CC BY 4.0). A page is a doctor, named as the insurer
 * publishes them: a legitimate-interest assessment, an article 14 notice and removal on
 * objection cover it. The Medical Chamber's register forbids republication and is never read.
 * No booking and no e-identity claim: a doctor claims their page with documents checked by an
 * administrator.
 */
export const slovenia: CountryAdapter = {
	code: "SI",
	segment: "si",
	defaultLocale: "sl",
	defaultTimeZone: "Europe/Ljubljana",
	timeZones: ["Europe/Ljubljana"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "si-zzzs-sa",
			name: "Seznam zdravnikov splošne dejavnosti (splošne ambulante, otroški in šolski dispanzerji)",
			publisher: "Zavod za zdravstveno zavarovanje Slovenije (ZZZS)",
			url: ZZZS_DATASET,
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: ZZZS_ATTRIBUTION,
			provides: ["practitioners", "activities"],
		},
		{
			id: "si-zzzs-gin",
			name: "Seznam ginekologov (dispanzerji za ženske)",
			publisher: "Zavod za zdravstveno zavarovanje Slovenije (ZZZS)",
			url: ZZZS_DATASET,
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: ZZZS_ATTRIBUTION,
			provides: ["practitioners", "activities"],
		},
		{
			id: "si-zzzs-zob",
			name: "Seznam zobozdravnikov (zobozdravstvo za odrasle, mladino in študente)",
			publisher: "Zavod za zdravstveno zavarovanje Slovenije (ZZZS)",
			url: ZZZS_DATASET,
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: ZZZS_ATTRIBUTION,
			provides: ["practitioners", "activities"],
		},
		{
			id: "si-rpe",
			name: "Register prostorskih enot (statistične regije, občine, naselja, poštni okoliši, ulice)",
			publisher: "Geodetska uprava Republike Slovenije (GURS)",
			url: "https://ipi.eprostor.gov.si/wfs-si-gurs-rpe/wfs?service=WFS&request=GetCapabilities",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			// GURS asks for its name, the kind of data and the date of its state; the pages add the
			// date of the state the last places import read (`slovenianAttribution` in the web app).
			attribution: "Vir: Geodetska uprava Republike Slovenije, Register prostorskih enot",
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: SI_ID_SCHEME,
			name: "Šifra zdravnika (ZZZS)",
			issuer: "Zavod za zdravstveno zavarovanje Slovenije",
			isValid: isValidSiSourceId,
		},
	],
	taxonomy: {
		professions: SI_PROFESSIONS,
		defaultProfessions: SI_DEFAULT_PROFESSIONS,
		listingSlugFor: siListingSlugFor,
		isListingSlug: isSiListingSlug,
	},
	phone: { callingCodes: ["386"], toE164: (raw) => toE164Si(raw), format: formatPhoneSi },
	address: {
		postcode: SI_POSTCODE,
		// A Slovenian address: the street and number, then the postcode and the post office
		// (`Celjska cesta 24 B`, `3212 Vojnik`).
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
				"Zakon o elektronskem poslovanju na trgu (ZEPT), article 5: the information a service provider gives",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis: "GDPR articles 13, 14 and 21; Zakon o varstvu osebnih podatkov (ZVOP-2)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Zakon o dostopnosti spletišč in mobilnih aplikacij (ZDSMA) binds public sector bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and ZVOP-2",
		basis:
			"No hosting certification: GDPR and the Zakon o varstvu osebnih podatkov (ZVOP-2); the Zakon o zbirkah podatkov s področja zdravstvenega varstva (ZZPPZ) and the Zakon o pacientovih pravicah (ZPacP) govern the records providers keep",
		url: "https://pisrs.si/pregledPredpisa?id=ZAKO7959",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
