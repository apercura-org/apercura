import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import {
	allLvListingSlugs,
	isLvListingSlug,
	LV_GP_PRACTICE,
	LV_HOSPITAL,
	LV_PHARMACY,
	LV_RESERVED_SEGMENTS,
	lvListingSlugFor,
	lvProfessionOfListingSlug,
} from "./lv";
import { SEARCH_ALIASES } from "./search-aliases";

describe("the Latvian taxonomy", () => {
	it("lists every kind under its own listing", () => {
		expect(lvListingSlugFor(LV_GP_PRACTICE, null)).toBe("gimenes-arstu-prakses");
		expect(lvListingSlugFor(LV_HOSPITAL)).toBe("slimnicas");
		expect(lvListingSlugFor(LV_PHARMACY, "x")).toBe("aptiekas");
		expect(lvListingSlugFor("XX")).toBeNull();
		expect(lvProfessionOfListingSlug("aptiekas")).toBe(LV_PHARMACY);
		expect(lvProfessionOfListingSlug("apotheken")).toBeUndefined();
	});

	it("never shares a listing slug with another market, nor with its own route segments", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
			...allItListingSlugs(),
			...allDeTaxonomySlugs(),
			...allChListingSlugs(),
		]);
		expect([...allLvListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allLvListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isLvListingSlug(slug)).toBe(true);
		}
		for (const segment of LV_RESERVED_SEGMENTS) expect(isLvListingSlug(segment)).toBe(false);
	});

	it("has search aliases for every listing, in Latvian, English and French", () => {
		const table = SEARCH_ALIASES.LV;
		for (const language of ["lv", "en", "fr"] as const) {
			expect(Object.keys(table[language]?.listings ?? {}).sort()).toEqual(
				[...allLvListingSlugs()].sort(),
			);
		}
		expect(table.lv?.listings["gimenes-arstu-prakses"]).toContain("ģimenes ārsts");
		expect(table.lv?.unlisted).toContain("zobārsts");
	});
});
