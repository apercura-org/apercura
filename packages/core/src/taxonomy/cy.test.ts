import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import {
	allCyListingSlugs,
	allCyTaxonomySlugs,
	CY_HEALTH_CENTRE,
	CY_HOSPITAL,
	CY_KIND_SLUGS,
	CY_PHARMACY,
	CY_PROFESSIONS,
	CY_RESERVED_SEGMENTS,
	cyKindSlugOf,
	cyListingSlugFor,
	cyProfessionOfListingSlug,
	isCyListingSlug,
} from "./cy";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import { allEeTaxonomySlugs } from "./ee";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import { allNoTaxonomySlugs } from "./no";
import { allPlListingSlugs } from "./pl";

describe("the Cypriot taxonomy", () => {
	it("lists every kind under its own listing", () => {
		expect(cyListingSlugFor(CY_HOSPITAL, null)).toBe("nosokomeia");
		expect(cyListingSlugFor(CY_HEALTH_CENTRE)).toBe("kentra-ygeias");
		expect(cyListingSlugFor(CY_PHARMACY, "x")).toBe("farmakeia");
		expect(cyListingSlugFor("XX")).toBeNull();
	});

	it("never shares a listing or kind slug with another market", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
			...allItListingSlugs(),
			...allDeTaxonomySlugs(),
			...allChListingSlugs(),
			...allEeTaxonomySlugs(),
			...allPlListingSlugs(),
			...allNoTaxonomySlugs(),
		]);
		expect([...allCyTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allCyListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isCyListingSlug(slug)).toBe(true);
		}
		for (const segment of CY_RESERVED_SEGMENTS) expect(isCyListingSlug(segment)).toBe(false);
		// A kind is a key of its own, never a listing.
		for (const slug of Object.values(CY_KIND_SLUGS)) expect(isCyListingSlug(slug)).toBe(false);
		expect(cyProfessionOfListingSlug("farmakeia")).toBe(CY_PHARMACY);
		expect(cyProfessionOfListingSlug("farmakeio")).toBeUndefined();
		expect(cyKindSlugOf(CY_HEALTH_CENTRE)).toBe("kentro-ygeias");
		expect(cyKindSlugOf(null)).toBeNull();
		expect(Object.keys(CY_KIND_SLUGS).sort()).toEqual(Object.keys(CY_PROFESSIONS).sort());
	});
});
