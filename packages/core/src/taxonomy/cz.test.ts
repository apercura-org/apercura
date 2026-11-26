import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import {
	allCzListingSlugs,
	CZ_DENTIST,
	CZ_GP,
	CZ_PHARMACY,
	CZ_RESERVED_SEGMENTS,
	CZ_SPECIALIST,
	CZ_SPECIALTIES,
	czFieldCodeOf,
	czFieldsOf,
	czListingSlugFor,
	czProfessionOfKind,
	czProfessionOfListingSlug,
	isCzListingSlug,
	primaryCzSpecialty,
} from "./cz";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";

describe("the Czech taxonomy", () => {
	it("imports the facility kinds patients visit, and only those", () => {
		expect(czProfessionOfKind("320")).toBe(CZ_GP);
		expect(czProfessionOfKind(" 322 ")).toBe(CZ_DENTIST);
		expect(czProfessionOfKind("324")).toBe(CZ_SPECIALIST);
		expect(czProfessionOfKind("510")).toBe(CZ_PHARMACY);
		// Hospitals, dental laboratories, opticians, ambulances, polyclinics: left out.
		for (const kind of ["102", "360", "523", "481", "301", "302", "", null]) {
			expect(czProfessionOfKind(kind)).toBeNull();
		}
	});

	it("reads the fields of care of a facility as the register lists them", () => {
		expect(czFieldsOf("kardiologie, vnitřní lékařství,  kardiologie ,")).toEqual([
			{ code: "kardiologie", label: "kardiologie" },
			{ code: "vnitrni-lekarstvi", label: "vnitřní lékařství" },
		]);
		expect(czFieldsOf("")).toEqual([]);
		expect(czFieldsOf(null)).toEqual([]);
		expect(czFieldCodeOf("Otorinolaryngologie a chirurgie hlavy a krku")).toBe(
			"otorinolaryngologie-a-chirurgie-hlavy-a-krku",
		);
	});

	it("lists a specialist under the most specific of its fields", () => {
		expect(primaryCzSpecialty(["kardiologie", "vnitrni-lekarstvi"])).toBe("kardiologie");
		expect(primaryCzSpecialty(["vnitrni-lekarstvi", "endokrinologie-a-diabetologie"])).toBe(
			"endokrinologie-a-diabetologie",
		);
		expect(primaryCzSpecialty(["chirurgie", "cevni-chirurgie"])).toBe("cevni-chirurgie");
		expect(primaryCzSpecialty(["vseobecna-sestra"])).toBeNull();
		expect(primaryCzSpecialty([])).toBeNull();
		expect(czListingSlugFor(CZ_SPECIALIST, "kardiologie")).toBe("kardiolog");
		expect(czListingSlugFor(CZ_SPECIALIST, "detska-kardiologie")).toBe("kardiolog");
		expect(czListingSlugFor(CZ_SPECIALIST, null)).toBe("lekar-specialista");
		expect(czListingSlugFor(CZ_SPECIALIST, "soudni-lekarstvi")).toBe("lekar-specialista");
		// Other kinds list under their own slug, whatever their fields.
		expect(czListingSlugFor(CZ_GP, "kardiologie")).toBe("prakticky-lekar");
		expect(czListingSlugFor("XX", null)).toBeNull();
	});

	it("never shares a listing slug with France, Austria or the United Kingdom", () => {
		const others = new Set([...allListingSlugs(), ...allAtListingSlugs(), ...allGbListingSlugs()]);
		expect([...allCzListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allCzListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isCzListingSlug(slug)).toBe(true);
		}
		for (const segment of CZ_RESERVED_SEGMENTS) expect(isCzListingSlug(segment)).toBe(false);
		expect(isCzListingSlug("allgemeinmedizin")).toBe(false);
		expect(czProfessionOfListingSlug("lekarna")).toBe(CZ_PHARMACY);
		expect(czProfessionOfListingSlug("kardiolog")).toBeUndefined();
	});

	it("keys every field of care by the slug of its name", () => {
		for (const code of Object.keys(CZ_SPECIALTIES)) expect(czFieldCodeOf(code)).toBe(code);
	});
});
