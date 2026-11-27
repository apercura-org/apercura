import type { SearchAliasTable } from "./types";

/**
 * Cyprus: everyday Greek words for the kinds of facility the market lists ("νοσοκομείο",
 * "κέντρο υγείας", "φαρμακείο", "φαρμακοποιός"), in their usual forms, with English and French
 * lists for visitors who search in those languages. Cyprus lists the state hospitals, the state
 * health centres and the private pharmacies: a search for a family doctor reads as the health
 * centres, the state's primary care; dentists, private clinics, physiotherapists and
 * psychologists are not listed yet (ROADMAP.md).
 */
export const CY_SEARCH_ALIASES = {
	el: {
		listings: {
			nosokomeia: [
				"νοσοκομείο",
				"νοσοκομεία",
				"γενικό νοσοκομείο",
				"κρατικό νοσοκομείο",
				"αγροτικό νοσοκομείο",
				"Τμήμα Ατυχημάτων και Επειγόντων Περιστατικών",
				"ΤΑΕΠ",
				"πρώτες βοήθειες",
				"επείγοντα",
				"μαιευτήριο",
				"ΟΚΥπΥ",
			],
			"kentra-ygeias": [
				"κέντρο υγείας",
				"κέντρα υγείας",
				"αγροτικό ιατρείο",
				"ιατρείο",
				"γιατρός",
				"ιατρός",
				"προσωπικός ιατρός",
				"προσωπικός γιατρός",
				"οικογενειακός γιατρός",
				"γενικός ιατρός",
				"παθολόγος",
				"πρωτοβάθμια φροντίδα",
			],
			farmakeia: [
				"φαρμακείο",
				"φαρμακεία",
				"φαρμακοποιός",
				"φαρμακοποιοί",
				"διανυκτερεύον φαρμακείο",
				"εφημερεύον φαρμακείο",
				"φάρμακα",
			],
		},
		unlisted: [
			"οδοντίατρος",
			"οδοντιατρείο",
			"ορθοδοντικός",
			"φυσιοθεραπευτής",
			"ψυχολόγος",
			"ιδιωτική κλινική",
			"κλινική",
			"μαία",
			"κτηνίατρος",
		],
	},
	en: {
		listings: {
			nosokomeia: ["hospital", "A&E", "emergency room", "accident and emergency"],
			"kentra-ygeias": ["health centre", "health center", "GP", "family doctor", "doctor"],
			farmakeia: ["pharmacy", "pharmacist", "chemist", "night pharmacy"],
		},
		unlisted: ["dentist", "physiotherapist", "psychologist", "private clinic"],
	},
	fr: {
		listings: {
			nosokomeia: ["hôpital", "urgences", "maternité"],
			"kentra-ygeias": ["centre de santé", "médecin généraliste", "médecin traitant"],
			farmakeia: ["pharmacie", "pharmacien"],
		},
		unlisted: ["dentiste", "kinésithérapeute", "psychologue"],
	},
} as const satisfies SearchAliasTable;
