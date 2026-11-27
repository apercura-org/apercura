import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { equivalentListing } from "./care-kinds";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeListingSlugs } from "./de";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import {
	allIeListingSlugs,
	IE_DEFAULT_PROFESSIONS,
	IE_HOSPITAL_KINDS,
	IE_NURSING_HOME,
	IE_PHARMACY,
	IE_RESERVED_SEGMENTS,
	ieListingSlugFor,
	ieProfessionOfListingSlug,
	isIeListingSlug,
	isPrivateIeHospitalKind,
} from "./ie";
import { allItListingSlugs } from "./it";
import { IE_SEARCH_ALIASES, SEARCH_ALIASES } from "./search-aliases";

describe("the Irish taxonomy", () => {
	it("lists pharmacies, nursing homes, hospitals and health centres, each on its own", () => {
		expect(IE_DEFAULT_PROFESSIONS.map((code) => ieListingSlugFor(code, null))).toEqual([
			"pharmacy",
			"nursing-homes",
			"hospitals",
			"health-centres",
		]);
		expect(ieListingSlugFor("XX", null)).toBeNull();
	});

	it("names the HSE's kinds of hospital and tells the private ones", () => {
		expect(IE_HOSPITAL_KINDS["General/Acute"]).toBe("General and acute hospital");
		expect(IE_HOSPITAL_KINDS.Community).toBe("Community hospital");
		expect(isPrivateIeHospitalKind("Private General")).toBe(true);
		expect(isPrivateIeHospitalKind(" private general ")).toBe(true);
		expect(isPrivateIeHospitalKind("General/Acute")).toBe(false);
		expect(isPrivateIeHospitalKind(null)).toBe(false);
	});

	it("never shares a listing slug with another market, the UK's English ones included", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
			...allItListingSlugs(),
			...allDeListingSlugs(),
			...allChListingSlugs(),
		]);
		expect([...allIeListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allIeListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isIeListingSlug(slug)).toBe(true);
		}
		for (const segment of IE_RESERVED_SEGMENTS) expect(isIeListingSlug(segment)).toBe(false);
		expect(isIeListingSlug("pharmacies")).toBe(false);
		expect(ieProfessionOfListingSlug("pharmacy")).toBe(IE_PHARMACY);
		expect(ieProfessionOfListingSlug("nursing-homes")).toBe(IE_NURSING_HOME);
		expect(ieProfessionOfListingSlug("pharmacies")).toBeUndefined();
	});

	it("carries pharmacy, hospital and nursing-home searches over from the other markets", () => {
		expect(equivalentListing("pharmacien", "FR", "IE")).toBe("pharmacy");
		expect(equivalentListing("pharmacies", "GB", "IE")).toBe("pharmacy");
		expect(equivalentListing("pharmacy", "IE", "GB")).toBe("pharmacies");
		expect(equivalentListing("ospedali", "IT", "IE")).toBe("hospitals");
		expect(equivalentListing("hospitals", "IE", "DE")).toBe("krankenhaeuser");
		expect(equivalentListing("pflegeheim", "CH", "IE")).toBe("nursing-homes");
		expect(equivalentListing("nursing-homes", "IE", "CH")).toBe("pflegeheim");
		expect(equivalentListing("health-centres", "IE", "GB")).toBeNull();
		expect(equivalentListing("chirurgien-dentiste", "FR", "IE")).toBeNull();
	});

	it("reads English words first, and short lists in the other interface languages", () => {
		const table = IE_SEARCH_ALIASES;
		expect(Object.keys(table)).toEqual(["en", "fr", "de", "es", "it", "cs"]);
		expect(SEARCH_ALIASES.IE).toBe(IE_SEARCH_ALIASES);
		for (const aliases of Object.values(table)) {
			for (const slug of Object.keys(aliases.listings))
				expect(isIeListingSlug(slug), slug).toBe(true);
		}
		expect(table.en.listings.pharmacy).toContain("chemist");
		expect(table.en.listings["nursing-homes"]).toContain("care home");
		expect(table.en.listings.hospitals).toContain("A&E");
		expect(table.en.unlisted).toContain("GP");
	});
});
