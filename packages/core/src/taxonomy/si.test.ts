import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeListingSlugs } from "./de";
import { allEsListingSlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import {
	allSiActivityCodes,
	allSiListingSlugs,
	isSiListingSlug,
	primarySiProfession,
	SI_CHILDREN_DOCTOR,
	SI_DEFAULT_PROFESSIONS,
	SI_DENTIST,
	SI_FAMILY_DOCTOR,
	SI_GYNAECOLOGIST,
	SI_RESERVED_SEGMENTS,
	siListingSlugFor,
	siProfessionOfActivity,
	siProfessionOfListingSlug,
} from "./si";

describe("the Slovenian taxonomy", () => {
	it("reads the kind of doctor from the insurer's activity code", () => {
		expect(siProfessionOfActivity("302001")).toBe(SI_FAMILY_DOCTOR);
		expect(siProfessionOfActivity(" 302068 ")).toBe(SI_FAMILY_DOCTOR);
		expect(siProfessionOfActivity("302070")).toBe(SI_FAMILY_DOCTOR);
		expect(siProfessionOfActivity("327009")).toBe(SI_CHILDREN_DOCTOR);
		expect(siProfessionOfActivity("306007")).toBe(SI_GYNAECOLOGIST);
		for (const code of ["404101", "404103", "404105"]) {
			expect(siProfessionOfActivity(code)).toBe(SI_DENTIST);
		}
		// The additional practices (302069) name no doctor; anything else is unknown.
		for (const code of ["302069", "", null, undefined, "999999"]) {
			expect(siProfessionOfActivity(code)).toBeNull();
		}
		expect(allSiActivityCodes()).toHaveLength(8);
	});

	it("lists a doctor under the kind of most of their rows, then the order of the kinds", () => {
		expect(
			primarySiProfession([
				{ activityCode: "302001" },
				{ activityCode: "327009" },
				{ activityCode: "302001" },
			]),
		).toBe(SI_FAMILY_DOCTOR);
		expect(
			primarySiProfession([
				{ activityCode: "327009" },
				{ activityCode: "327009" },
				{ activityCode: "302001" },
			]),
		).toBe(SI_CHILDREN_DOCTOR);
		expect(primarySiProfession([{ activityCode: "327009" }, { activityCode: "302001" }])).toBe(
			SI_FAMILY_DOCTOR,
		);
		expect(primarySiProfession([{ activityCode: "302069" }])).toBeNull();
		expect(primarySiProfession([])).toBeNull();
	});

	it("gives each kind one listing, whatever the activity", () => {
		expect(siListingSlugFor(SI_FAMILY_DOCTOR, "302068")).toBe("druzinski-zdravnik");
		expect(siListingSlugFor(SI_CHILDREN_DOCTOR, null)).toBe("otroski-zdravnik");
		expect(siListingSlugFor(SI_GYNAECOLOGIST, "306007")).toBe("ginekolog");
		expect(siListingSlugFor(SI_DENTIST, "404103")).toBe("zobozdravnik");
		expect(siListingSlugFor("XX", null)).toBeNull();
		expect(SI_DEFAULT_PROFESSIONS).toEqual([
			SI_FAMILY_DOCTOR,
			SI_CHILDREN_DOCTOR,
			SI_GYNAECOLOGIST,
			SI_DENTIST,
		]);
		expect(siProfessionOfListingSlug("zobozdravnik")).toBe(SI_DENTIST);
		expect(siProfessionOfListingSlug("zdravnik")).toBeUndefined();
	});

	it("never shares a listing slug with another market, nor with its own route segments", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsListingSlugs(),
			...allItListingSlugs(),
			...allDeListingSlugs(),
			...allChListingSlugs(),
		]);
		expect([...allSiListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allSiListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isSiListingSlug(slug)).toBe(true);
		}
		for (const segment of SI_RESERVED_SEGMENTS) expect(isSiListingSlug(segment)).toBe(false);
		expect(isSiListingSlug("gynekolog")).toBe(false);
	});
});
