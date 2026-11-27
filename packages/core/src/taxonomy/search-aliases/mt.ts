import type { SearchAliasTable } from "./types";

/**
 * Malta: the pages list community pharmacies, which people call "pharmacy", "chemist" or, in
 * Maltese, "spiżerija" (plural "spiżeriji"; a Maltese interface is a follow-up, so the Maltese
 * words sit in the English list, which works on every page of the market). Hospitals, health
 * centres, doctors and dentists are not listed (no open list of the hospitals and health
 * centres was found, and the Medical Council's registers are not republished): they read as
 * "not listed here yet". Short lists in the other interface languages help visitors who search
 * in their own ("pharmacie", "Apotheke", "farmacia").
 */
export const MT_SEARCH_ALIASES = {
	en: {
		listings: {
			"community-pharmacies": [
				"pharmacy",
				"pharmacies",
				"pharmacist",
				"chemist",
				"chemist's",
				"chemists",
				"community pharmacy",
				"dispensary",
				"dispensing chemist",
				"POYC pharmacy",
				"spiżerija",
				"spiżeriji",
				"spiżjar",
			],
		},
		unlisted: [
			"hospital",
			"health centre",
			"health center",
			"polyclinic",
			"emergency",
			"A&E",
			"GP",
			"doctor",
			"family doctor",
			"general practitioner",
			"dentist",
			"physio",
			"physiotherapist",
			"optician",
			"psychologist",
			"midwife",
			"paediatrician",
			"sptar",
			"tabib",
			"ċentru tas-saħħa",
		],
	},
	fr: { listings: { "community-pharmacies": ["pharmacie", "pharmacien"] } },
	de: { listings: { "community-pharmacies": ["Apotheke"] } },
	es: { listings: { "community-pharmacies": ["farmacia"] } },
	it: { listings: { "community-pharmacies": ["farmacia"] } },
} as const satisfies SearchAliasTable;
