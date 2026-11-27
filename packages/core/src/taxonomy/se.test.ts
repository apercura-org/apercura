import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import { allEeTaxonomySlugs } from "./ee";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allIeListingSlugs } from "./ie";
import { allItListingSlugs } from "./it";
import { allNoTaxonomySlugs } from "./no";
import { allPlListingSlugs } from "./pl";
import {
	allSeListingSlugs,
	allSeTaxonomySlugs,
	isSeListingSlug,
	SE_HEALTH_CENTRE,
	SE_KIND_SLUGS,
	SE_PHARMACY,
	SE_PROFESSIONS,
	SE_RESERVED_SEGMENTS,
	seKindSlugOf,
	seListingSlugFor,
	seProfessionOfListingSlug,
} from "./se";

describe("the Swedish taxonomy", () => {
	it("lists every kind under its own listing", () => {
		expect(seListingSlugFor(SE_PHARMACY, null)).toBe("apoteken");
		expect(seListingSlugFor(SE_HEALTH_CENTRE)).toBe("vardcentraler");
		expect(seListingSlugFor("XX")).toBeNull();
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
			...allIeListingSlugs(),
		]);
		expect([...allSeTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allSeListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isSeListingSlug(slug)).toBe(true);
		}
		for (const segment of SE_RESERVED_SEGMENTS) expect(isSeListingSlug(segment)).toBe(false);
		// A kind is a key of its own, never a listing.
		for (const slug of Object.values(SE_KIND_SLUGS)) expect(isSeListingSlug(slug)).toBe(false);
		expect(seProfessionOfListingSlug("apoteken")).toBe(SE_PHARMACY);
		expect(seProfessionOfListingSlug("oppenvardsapotek")).toBeUndefined();
		expect(seKindSlugOf(SE_HEALTH_CENTRE)).toBe("vardcentral");
		expect(seKindSlugOf(null)).toBeNull();
		expect(Object.keys(SE_KIND_SLUGS).sort()).toEqual(Object.keys(SE_PROFESSIONS).sort());
	});
});
