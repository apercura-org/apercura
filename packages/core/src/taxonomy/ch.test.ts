import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { equivalentListing } from "./care-kinds";
import {
	allChListingSlugs,
	CH_BIRTH_CENTRE,
	CH_DEFAULT_PROFESSIONS,
	CH_HOSPITAL,
	CH_HOSPITAL_TYPES,
	CH_PHARMACY,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_RESERVED_SEGMENTS,
	CH_SPECIALTY_CLINIC,
	chHospitalKindOf,
	chListingSlugFor,
	chProfessionOfListingSlug,
	isChListingSlug,
} from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeListingSlugs } from "./de";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import { CH_SEARCH_ALIASES, SEARCH_ALIASES } from "./search-aliases";

describe("the Swiss taxonomy", () => {
	it("lists hospitals, clinics, birth centres, nursing homes and pharmacies, each on its own", () => {
		expect(CH_DEFAULT_PROFESSIONS.map((code) => chListingSlugFor(code, null))).toEqual([
			"spital",
			"psychiatrische-klinik",
			"rehaklinik",
			"spezialklinik",
			"geburtshaus",
			"pflegeheim",
			"apotheke",
		]);
		expect(chListingSlugFor("XX", null)).toBeNull();
	});

	it("sorts the FOPH's hospitals by the typology and the activity types", () => {
		expect(chHospitalKindOf("K111", "A")).toBe(CH_HOSPITAL);
		expect(chHospitalKindOf("K123", "A, R")).toBe(CH_HOSPITAL);
		expect(chHospitalKindOf("K211", "P")).toBe(CH_PSYCHIATRIC_CLINIC);
		expect(chHospitalKindOf("K212", "P, R")).toBe(CH_PSYCHIATRIC_CLINIC);
		expect(chHospitalKindOf("K221", "R")).toBe(CH_REHAB_CLINIC);
		expect(chHospitalKindOf("K231", "A")).toBe(CH_SPECIALTY_CLINIC);
		expect(chHospitalKindOf("K232", "A, B")).toBe(CH_SPECIALTY_CLINIC);
		expect(chHospitalKindOf("K232", "B")).toBe(CH_BIRTH_CENTRE);
		expect(chHospitalKindOf(" k235 ", "a")).toBe(CH_SPECIALTY_CLINIC);
		expect(chHospitalKindOf("", "B")).toBe(CH_BIRTH_CENTRE);
		expect(chHospitalKindOf("", "A")).toBeNull();
		expect(chHospitalKindOf("K999", "A")).toBeNull();
		expect(Object.keys(CH_HOSPITAL_TYPES)).toHaveLength(13);
	});

	it("never shares a listing slug with another market", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
			...allItListingSlugs(),
			...allDeListingSlugs(),
		]);
		expect([...allChListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allChListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isChListingSlug(slug)).toBe(true);
		}
		for (const segment of CH_RESERVED_SEGMENTS) expect(isChListingSlug(segment)).toBe(false);
		expect(isChListingSlug("apotheken")).toBe(false);
		expect(isChListingSlug("krankenhaeuser")).toBe(false);
		expect(chProfessionOfListingSlug("apotheke")).toBe(CH_PHARMACY);
		expect(chProfessionOfListingSlug("pharmacie")).toBeUndefined();
	});

	it("carries pharmacy, hospital, psychiatry and midwifery searches over from the other markets", () => {
		expect(equivalentListing("pharmacien", "FR", "CH")).toBe("apotheke");
		expect(equivalentListing("farmacie", "IT", "CH")).toBe("apotheke");
		expect(equivalentListing("apotheke", "CH", "GB")).toBe("pharmacies");
		expect(equivalentListing("ospedali", "IT", "CH")).toBe("spital");
		expect(equivalentListing("psychiatre", "FR", "CH")).toBe("psychiatrische-klinik");
		expect(equivalentListing("sage-femme", "FR", "CH")).toBe("geburtshaus");
		expect(equivalentListing("chirurgien-dentiste", "FR", "CH")).toBeNull();
	});

	it("reads the words of the market's three languages, and English", () => {
		const table = CH_SEARCH_ALIASES;
		expect(Object.keys(table)).toEqual(["de", "fr", "it", "en"]);
		expect(SEARCH_ALIASES.CH).toBe(CH_SEARCH_ALIASES);
		for (const aliases of Object.values(table)) {
			for (const slug of Object.keys(aliases.listings))
				expect(isChListingSlug(slug), slug).toBe(true);
		}
		expect(table.de.listings.pflegeheim).toContain("Altersheim");
		expect(table.fr.listings.pflegeheim).toContain("EMS");
		expect(table.it.listings.pflegeheim).toContain("casa per anziani");
		expect(table.it.listings.spital).toContain("pronto soccorso");
	});
});
