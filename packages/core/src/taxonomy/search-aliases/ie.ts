import type { SearchAliasTable } from "./types";

/**
 * Ireland: the pages list facilities (pharmacies, nursing homes, hospitals, health centres),
 * which people call "chemist", "care home", "A&E", "primary care centre". GPs, dentists and the
 * other clinicians are not listed (their registers cannot be republished, and the HSE's GP layer
 * names doctors): they read as "not listed here yet". Short lists in the other interface
 * languages help visitors who search in their own ("pharmacie", "Krankenhaus", "ospedale").
 */
export const IE_SEARCH_ALIASES = {
	en: {
		listings: {
			pharmacy: [
				"pharmacies",
				"pharmacist",
				"chemist",
				"chemist's",
				"chemists",
				"retail pharmacy",
				"community pharmacy",
				"dispensing chemist",
				"medical hall",
			],
			"nursing-homes": [
				"nursing home",
				"care home",
				"residential care",
				"residential care centre",
				"older persons centre",
				"designated centre for older people",
				"community nursing unit",
				"long-term care",
				"retirement home",
				"old people's home",
			],
			hospitals: [
				"hospital",
				"general hospital",
				"university hospital",
				"regional hospital",
				"community hospital",
				"maternity hospital",
				"private hospital",
				"children's hospital",
				"A&E",
				"accident and emergency",
				"emergency department",
			],
			"health-centres": [
				"health centre",
				"health center",
				"HSE health centre",
				"primary care centre",
				"primary care center",
				"public health nurse",
				"community health centre",
			],
		},
		unlisted: [
			"GP",
			"doctor",
			"family doctor",
			"general practitioner",
			"dentist",
			"orthodontist",
			"physio",
			"physiotherapist",
			"optician",
			"optometrist",
			"chiropodist",
			"podiatrist",
			"psychologist",
			"psychiatrist",
			"counsellor",
			"midwife",
			"consultant",
			"paediatrician",
			"dermatologist",
			"cardiologist",
		],
	},
	fr: {
		listings: {
			pharmacy: ["pharmacie", "pharmacien"],
			"nursing-homes": ["maison de retraite", "EHPAD"],
			hospitals: ["hôpital", "urgences", "clinique"],
			"health-centres": ["centre de santé"],
		},
	},
	de: {
		listings: {
			pharmacy: ["Apotheke"],
			"nursing-homes": ["Pflegeheim", "Altenheim", "Seniorenheim"],
			hospitals: ["Krankenhaus", "Klinik", "Spital", "Notaufnahme"],
			"health-centres": ["Gesundheitszentrum"],
		},
	},
	es: {
		listings: {
			pharmacy: ["farmacia"],
			"nursing-homes": ["residencia de mayores", "residencia de ancianos"],
			hospitals: ["hospital", "urgencias"],
			"health-centres": ["centro de salud"],
		},
	},
	it: {
		listings: {
			pharmacy: ["farmacia"],
			"nursing-homes": ["casa di riposo", "RSA"],
			hospitals: ["ospedale", "pronto soccorso"],
			"health-centres": ["centro di salute", "poliambulatorio"],
		},
	},
	cs: {
		listings: {
			pharmacy: ["lékárna"],
			"nursing-homes": ["domov pro seniory"],
			hospitals: ["nemocnice"],
			"health-centres": ["zdravotní středisko"],
		},
	},
} as const satisfies SearchAliasTable;
