import type { SearchAliasTable } from "./types";

/**
 * Slovenia: everyday words for the four kinds of personal doctor ("zdravnik", "osebni zdravnik",
 * "zobar", "pediater"), with their feminine and plural forms, which Slovenian inflects rather
 * than ending in "s". Care the insurer's lists do not cover (hospitals, pharmacies, emergency
 * services, specialists) reads as "not listed here yet". A short English list helps visitors who
 * search in English.
 */
export const SI_SEARCH_ALIASES = {
	sl: {
		listings: {
			"druzinski-zdravnik": [
				"zdravnik",
				"zdravnica",
				"zdravniki",
				"osebni zdravnik",
				"osebna zdravnica",
				"izbrani zdravnik",
				"družinska zdravnica",
				"družinska medicina",
				"družinski zdravniki",
				"splošni zdravnik",
				"splošna zdravnica",
				"splošna ambulanta",
				"splošna medicina",
				"ambulanta družinske medicine",
				"doktor",
				"doktorica",
			],
			"otroski-zdravnik": [
				"pediater",
				"pediatrinja",
				"pediatri",
				"pediatrija",
				"otroška zdravnica",
				"otroški zdravniki",
				"otroški dispanzer",
				"šolski zdravnik",
				"šolska zdravnica",
				"šolski dispanzer",
				"zdravnik za otroke",
			],
			ginekolog: [
				"ginekologinja",
				"ginekologi",
				"ginekologija",
				"dispanzer za ženske",
				"ženski zdravnik",
				"izbrani ginekolog",
			],
			zobozdravnik: [
				"zobozdravnica",
				"zobozdravniki",
				"zobozdravstvo",
				"zobar",
				"zobarka",
				"zobna ambulanta",
				"zobna ordinacija",
				"dentist",
				"stomatolog",
				"otroški zobozdravnik",
				"mladinski zobozdravnik",
				"šolski zobozdravnik",
				"zobozdravnik za otroke",
				"študentski zobozdravnik",
			],
		},
		unlisted: [
			"bolnišnica",
			"bolnica",
			"urgenca",
			"nujna pomoč",
			"dežurna služba",
			"lekarna",
			"lekarnar",
			"optik",
			"laboratorij",
			"specialist",
		],
	},
	en: {
		listings: {
			"druzinski-zdravnik": ["GP", "general practitioner", "family doctor", "doctor"],
			"otroski-zdravnik": ["paediatrician", "pediatrician", "school doctor"],
			ginekolog: ["gynaecologist", "gynecologist"],
			zobozdravnik: ["dentist", "dental"],
		},
		unlisted: ["hospital", "pharmacy"],
	},
} as const satisfies SearchAliasTable;
