import type { SearchAliasTable } from "./types";

/**
 * Sweden: everyday Swedish words for the kinds of facility the market lists ("apotek",
 * "vårdcentral", "husläkare"), in their usual forms (`apoteket`, `vårdcentralen`). Sweden lists
 * facilities, not the people who work in them: a search for a person reads as the facility's
 * kind (a health centre for "läkare" or "distriktsläkare", a pharmacy for "farmaceut"). Health
 * centres are listed only where a region publishes them openly (Västra Götaland today). Hospitals,
 * dental care, physiotherapy, psychologists, midwives and care homes have no open national list
 * and are not listed (docs/data-requests/se.md). English and French lists help visitors who
 * search in those languages.
 */
export const SE_SEARCH_ALIASES = {
	sv: {
		listings: {
			vardcentraler: [
				"vårdcentral",
				"vårdcentralen",
				"vårdcentraler",
				"hälsocentral",
				"hälsocentralen",
				"husläkare",
				"husläkarmottagning",
				"läkarmottagning",
				"läkarhus",
				"familjeläkare",
				"distriktsläkare",
				"allmänläkare",
				"allmänmedicin",
				"läkare",
				"doktor",
				"primärvård",
				"närsjukvård",
				"vårdval",
			],
			apoteken: [
				"apotek",
				"apoteket",
				"apoteken",
				"öppenvårdsapotek",
				"apotekare",
				"receptarie",
				"farmaceut",
				"läkemedel",
				"mediciner",
				"sjukhusapotek",
			],
		},
		unlisted: [
			"sjukhus",
			"lasarett",
			"akuten",
			"akutmottagning",
			"närakut",
			"tandläkare",
			"tandvård",
			"folktandvården",
			"tandklinik",
			"fysioterapeut",
			"sjukgymnast",
			"psykolog",
			"psykiatri",
			"barnmorska",
			"mödravårdscentral",
			"barnavårdscentral",
			"äldreboende",
			"kiropraktor",
			"specialistläkare",
		],
	},
	en: {
		listings: {
			vardcentraler: [
				"health centre",
				"health center",
				"GP",
				"family doctor",
				"general practitioner",
				"doctor",
				"primary care",
			],
			apoteken: ["pharmacy", "pharmacist", "chemist"],
		},
	},
	fr: {
		listings: {
			vardcentraler: [
				"centre de santé",
				"médecin généraliste",
				"généraliste",
				"médecin traitant",
				"médecin",
			],
			apoteken: ["pharmacie", "pharmacien"],
		},
	},
} as const satisfies SearchAliasTable;
