import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allCzListingSlugs } from "./cz";
import {
	allDeListingSlugs,
	allDeTaxonomySlugs,
	DE_CHILDRENS_HOSPITAL,
	DE_HOSPITAL,
	DE_KIND_SLUGS,
	DE_PHARMACY,
	DE_PROFESSIONS,
	DE_PSYCHIATRIC_HOSPITAL,
	DE_REHAB_CLINIC,
	DE_RESERVED_SEGMENTS,
	deHospitalKind,
	deKindSlugOf,
	deListingSlugFor,
	deProfessionOfListingSlug,
	isDeListingSlug,
} from "./de";
import { allEsTaxonomySlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";

describe("the German taxonomy", () => {
	it("lists a hospital site by its departments", () => {
		expect(deHospitalKind(["0100", "1500", "2400"], "Klinikum Musterstadt")).toBe(DE_HOSPITAL);
		expect(deHospitalKind(["2900", "3100"], "Klinikum Musterstadt")).toBe(DE_PSYCHIATRIC_HOSPITAL);
		expect(deHospitalKind(["3000", "3060"], "Klinikum Musterstadt")).toBe(DE_PSYCHIATRIC_HOSPITAL);
		expect(deHospitalKind(["1000", "1200", "1300", "3610"], "Klinikum")).toBe(
			DE_CHILDRENS_HOSPITAL,
		);
		// A hospital with a psychiatric and a children's department is a hospital.
		expect(deHospitalKind(["1000", "2900"], "Kinderklinik")).toBe(DE_HOSPITAL);
	});

	it("tells a site without departments by its names", () => {
		expect(deHospitalKind([], "Psychiatrische Tagesklinik Musterstadt")).toBe(
			DE_PSYCHIATRIC_HOSPITAL,
		);
		expect(deHospitalKind([], "Musterkliniken | Regio PIA KJP Musterstadt")).toBe(
			DE_PSYCHIATRIC_HOSPITAL,
		);
		expect(deHospitalKind([], "Klinik für Kinder- und Jugendpsychiatrie")).toBe(
			DE_PSYCHIATRIC_HOSPITAL,
		);
		expect(deHospitalKind([], "Kinderkrankenhaus am See")).toBe(DE_CHILDRENS_HOSPITAL);
		expect(deHospitalKind([], "Tagesklinik für Allergie und Hautkrankheiten")).toBe(DE_HOSPITAL);
	});

	it("lists every kind under its own listing", () => {
		expect(deListingSlugFor(DE_HOSPITAL, null)).toBe("krankenhaeuser");
		expect(deListingSlugFor(DE_PSYCHIATRIC_HOSPITAL)).toBe("psychiatrische-kliniken");
		expect(deListingSlugFor(DE_CHILDRENS_HOSPITAL)).toBe("kinderkliniken");
		expect(deListingSlugFor(DE_REHAB_CLINIC)).toBe("reha-kliniken");
		expect(deListingSlugFor(DE_PHARMACY, "2900")).toBe("apotheken");
		expect(deListingSlugFor("XX")).toBeNull();
	});

	it("never shares a listing or kind slug with another market, Austria's German ones included", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
		]);
		expect([...allDeTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allDeListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isDeListingSlug(slug)).toBe(true);
		}
		for (const segment of DE_RESERVED_SEGMENTS) expect(isDeListingSlug(segment)).toBe(false);
		// A kind is named in the singular, never as a listing.
		for (const slug of Object.values(DE_KIND_SLUGS)) expect(isDeListingSlug(slug)).toBe(false);
		expect(isDeListingSlug("allgemeinmedizin")).toBe(false);
		expect(deProfessionOfListingSlug("apotheken")).toBe(DE_PHARMACY);
		expect(deProfessionOfListingSlug("kardiologie")).toBeUndefined();
		expect(deKindSlugOf(DE_REHAB_CLINIC)).toBe("reha-klinik");
		expect(deKindSlugOf(null)).toBeNull();
		expect(Object.keys(DE_KIND_SLUGS).sort()).toEqual(Object.keys(DE_PROFESSIONS).sort());
	});
});
