import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import { allEeTaxonomySlugs } from "./ee";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import {
	allNoListingSlugs,
	allNoTaxonomySlugs,
	isNoListingSlug,
	NO_DENTAL,
	NO_EMERGENCY,
	NO_GP,
	NO_HOSPITAL,
	NO_KIND_SLUGS,
	NO_MENTAL_HEALTH,
	NO_NURSING_HOME,
	NO_PHARMACY,
	NO_PROFESSIONS,
	NO_RESERVED_SEGMENTS,
	NO_SPECIALIST,
	noKindOf,
	noKindSlugOf,
	noListingSlugFor,
	noProfessionOfListingSlug,
} from "./no";

describe("the Norwegian taxonomy", () => {
	it("tells an establishment's kind by its industry code, an emergency clinic by its name", () => {
		expect(noKindOf("86.101", "Eksempel sykehus")).toBe(NO_HOSPITAL);
		for (const code of ["86.102", "86.103", "86.104"]) {
			expect(noKindOf(code, "Eksempel DPS")).toBe(NO_MENTAL_HEALTH);
		}
		expect(noKindOf("86.210", "Eksempel legesenter")).toBe(NO_GP);
		expect(noKindOf("86.210", "EKSEMPEL INTERKOMMUNALE LEGEVAKT")).toBe(NO_EMERGENCY);
		expect(noKindOf("86.221", "Eksempel øyeklinikk")).toBe(NO_SPECIALIST);
		expect(noKindOf("86.222", "Eksempel psykiatri")).toBe(NO_SPECIALIST);
		// A dental emergency clinic is a dental clinic.
		expect(noKindOf("86.230", "Eksempel tannlegevakt")).toBe(NO_DENTAL);
		expect(noKindOf("87.102", "Eksempel sykehjem")).toBe(NO_NURSING_HOME);
		expect(noKindOf("47.730", "Eksempel apotek")).toBe(NO_PHARMACY);
		// Physiotherapy, psychologists, ambulances and the other codes are not listed.
		for (const code of ["86.950", "86.930", "86.921", "86.942", "47.740", "86.2", ""]) {
			expect(noKindOf(code, "Eksempel")).toBeNull();
		}
	});

	it("lists every kind under its own listing", () => {
		expect(noListingSlugFor(NO_HOSPITAL, null)).toBe("sykehus");
		expect(noListingSlugFor(NO_GP)).toBe("legekontorer");
		expect(noListingSlugFor(NO_EMERGENCY)).toBe("legevakter");
		expect(noListingSlugFor(NO_PHARMACY, "x")).toBe("apotek");
		expect(noListingSlugFor("XX")).toBeNull();
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
		]);
		expect([...allNoTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allNoListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isNoListingSlug(slug)).toBe(true);
		}
		for (const segment of NO_RESERVED_SEGMENTS) expect(isNoListingSlug(segment)).toBe(false);
		// A kind is a key of its own, never a listing.
		for (const slug of Object.values(NO_KIND_SLUGS)) expect(isNoListingSlug(slug)).toBe(false);
		expect(noProfessionOfListingSlug("apotek")).toBe(NO_PHARMACY);
		expect(noProfessionOfListingSlug("apoteket")).toBeUndefined();
		expect(noKindSlugOf(NO_DENTAL)).toBe("tannklinikk");
		expect(noKindSlugOf(null)).toBeNull();
		expect(Object.keys(NO_KIND_SLUGS).sort()).toEqual(Object.keys(NO_PROFESSIONS).sort());
	});
});
