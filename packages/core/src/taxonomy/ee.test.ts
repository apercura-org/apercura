import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import {
	allEeListingSlugs,
	allEeTaxonomySlugs,
	EE_DENTAL,
	EE_FAMILY_PRACTICE,
	EE_HOSPITAL,
	EE_KIND_SLUGS,
	EE_MIDWIFERY,
	EE_NURSING,
	EE_PHARMACY,
	EE_PHYSIOTHERAPY,
	EE_PROFESSIONS,
	EE_PSYCHOLOGY,
	EE_RESERVED_SEGMENTS,
	EE_SPECIALIST,
	EE_SPEECH_THERAPY,
	type EeLicence,
	eeKindSlugOf,
	eeListingSlugFor,
	eeProfessionOfListingSlug,
	eeProviderKind,
	isEeListingSlug,
} from "./ee";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";

const licence = (kind: string, services: string[] = [], hospitalKind: string | null = null) =>
	({ kind, hospitalKind, services }) satisfies EeLicence;

describe("the Estonian taxonomy", () => {
	it("tells a provider's kind by its licences, a hospital first", () => {
		expect(eeProviderKind([licence("2", ["T0204"]), licence("1", ["T0038"], "YLD")])).toBe(
			EE_HOSPITAL,
		);
		expect(eeProviderKind([licence("1", ["T0038"], "PK")])).toBe(EE_HOSPITAL);
		// A nursing hospital lists with nursing care.
		expect(eeProviderKind([licence("2", ["T0218"], "OEH")])).toBe(EE_NURSING);
		expect(eeProviderKind([licence("1", ["T0003"]), licence("7", ["TPmed"])])).toBe(
			EE_FAMILY_PRACTICE,
		);
		expect(eeProviderKind([licence("1", ["T0003", "T0292"])])).toBe(EE_DENTAL);
		expect(eeProviderKind([licence("1", ["T0003", "T0065"])])).toBe(EE_SPECIALIST);
		expect(eeProviderKind([licence("1", [])])).toBe(EE_SPECIALIST);
		expect(eeProviderKind([licence("2", ["T0204"]), licence("6", ["T0251"])])).toBe(EE_NURSING);
		expect(eeProviderKind([licence("6", ["T0251"])])).toBe(EE_MIDWIFERY);
		expect(eeProviderKind([licence("33", ["T0295"])])).toBe(EE_PHYSIOTHERAPY);
		expect(eeProviderKind([licence("32", ["T0297"])])).toBe(EE_PSYCHOLOGY);
		expect(eeProviderKind([licence("31", ["T0296"])])).toBe(EE_SPEECH_THERAPY);
	});

	it("lists no ambulance service", () => {
		expect(eeProviderKind([licence("3", ["T0014"])])).toBeNull();
		expect(eeProviderKind([])).toBeNull();
		expect(eeProviderKind([licence("3", ["T0014"]), licence("2", ["T0236"])])).toBe(EE_NURSING);
	});

	it("lists every kind under its own listing", () => {
		expect(eeListingSlugFor(EE_HOSPITAL, null)).toBe("haiglad");
		expect(eeListingSlugFor(EE_FAMILY_PRACTICE)).toBe("perearstikeskused");
		expect(eeListingSlugFor(EE_DENTAL)).toBe("hambaravi");
		expect(eeListingSlugFor(EE_PHARMACY, "T0003")).toBe("apteegid");
		expect(eeListingSlugFor("XX")).toBeNull();
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
		]);
		expect([...allEeTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allEeListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isEeListingSlug(slug)).toBe(true);
		}
		for (const segment of EE_RESERVED_SEGMENTS) expect(isEeListingSlug(segment)).toBe(false);
		// A kind is named in the singular, never as a listing.
		for (const slug of Object.values(EE_KIND_SLUGS)) expect(isEeListingSlug(slug)).toBe(false);
		expect(eeProfessionOfListingSlug("apteegid")).toBe(EE_PHARMACY);
		expect(eeProfessionOfListingSlug("kardioloogia")).toBeUndefined();
		expect(eeKindSlugOf(EE_DENTAL)).toBe("hambakliinik");
		expect(eeKindSlugOf(null)).toBeNull();
		expect(Object.keys(EE_KIND_SLUGS).sort()).toEqual(Object.keys(EE_PROFESSIONS).sort());
	});
});
