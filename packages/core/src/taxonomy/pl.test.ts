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
	allPlListingSlugs,
	classifyPlEstablishment,
	isPlListingSlug,
	PL_DENTAL,
	PL_DIAGNOSTICS,
	PL_HOSPICE,
	PL_HOSPITAL,
	PL_LONG_TERM_CARE,
	PL_NURSING,
	PL_OTHER,
	PL_OUT_OF_HOURS,
	PL_PRIMARY_CARE,
	PL_REHABILITATION,
	PL_RESERVED_SEGMENTS,
	PL_RESIDENTIAL,
	PL_SPA,
	PL_SPECIALIST,
	plListingSlugFor,
	plProfessionOfListingSlug,
	plSpecialtyOfCell,
	primaryPlSpecialty,
} from "./pl";

describe("the Polish taxonomy", () => {
	it("reads a hospital from its kind of activity, a sanatorium from its spa wards", () => {
		expect(classifyPlEstablishment("1", ["4000", "4500", "4900"])).toEqual({
			professionCode: PL_HOSPITAL,
			specialtyCode: null,
		});
		expect(classifyPlEstablishment("1", []).professionCode).toBe(PL_HOSPITAL);
		expect(classifyPlEstablishment("1", ["6100", "1310"]).professionCode).toBe(PL_SPA);
		// A misprinted kind with hospital wards is a hospital.
		expect(classifyPlEstablishment("HP.3.2", ["4000"]).professionCode).toBe(PL_HOSPITAL);
	});

	it("tells the inpatient care outside hospitals apart by their cells", () => {
		expect(classifyPlEstablishment("2", ["2184", "5170"]).professionCode).toBe(PL_HOSPICE);
		expect(classifyPlEstablishment("2", ["5170", "4924"]).professionCode).toBe(PL_LONG_TERM_CARE);
		expect(classifyPlEstablishment("2", ["6500", "1310"]).professionCode).toBe(PL_SPA);
		expect(classifyPlEstablishment("2", ["2742"]).professionCode).toBe("PL_ADDICTION");
		expect(classifyPlEstablishment("2", ["2306", "1310"]).professionCode).toBe(PL_RESIDENTIAL);
		expect(classifyPlEstablishment(null, ["5160"]).professionCode).toBe(PL_LONG_TERM_CARE);
	});

	it("reads an outpatient establishment from its cells, primary care first", () => {
		const kind = (cells: string[]) => classifyPlEstablishment("3", cells).professionCode;
		expect(kind(["0010", "0032", "1100", "1800"])).toBe(PL_PRIMARY_CARE);
		expect(kind(["0014"])).toBe(PL_PRIMARY_CARE);
		expect(kind(["0016"])).toBe(PL_OUT_OF_HOURS);
		expect(kind(["2180", "0010"])).toBe(PL_HOSPICE);
		expect(kind(["1100", "9450"])).toBe(PL_SPECIALIST);
		expect(kind(["1800", "1820", "9450"])).toBe(PL_DENTAL);
		expect(kind(["1310", "1300"])).toBe(PL_REHABILITATION);
		expect(kind(["0032", "0034"])).toBe(PL_NURSING);
		expect(kind(["2142"])).toBe(PL_NURSING);
		expect(kind(["7100", "7110"])).toBe(PL_DIAGNOSTICS);
		expect(kind(["9450"])).toBe(PL_OTHER);
		expect(kind([])).toBe(PL_OTHER);
	});

	it("leaves out establishments nobody visits", () => {
		expect(classifyPlEstablishment("3", ["0040", "0041"])).toEqual({
			professionCode: null,
			reason: "school nurses only",
		});
		expect(classifyPlEstablishment("3", ["3112", "3114", "9250"])).toEqual({
			professionCode: null,
			reason: "emergency or transport teams only",
		});
		expect(classifyPlEstablishment("3", ["8500"])).toEqual({
			professionCode: null,
			reason: "blood bank only",
		});
		// A school nurse next to a doctor keeps the clinic.
		expect(classifyPlEstablishment("3", ["0040", "0010"]).professionCode).toBe(PL_PRIMARY_CARE);
	});

	it("lists a specialist clinic under its most specific field, or as a clinic of many fields", () => {
		expect(plSpecialtyOfCell("1100")).toBe("kardiologia");
		expect(plSpecialtyOfCell("1101")).toBe("kardiologia");
		expect(plSpecialtyOfCell("1700")).toBe("psychiatria");
		expect(plSpecialtyOfCell("1070")).toBeNull();
		expect(plSpecialtyOfCell("abcd")).toBeNull();
		expect(primaryPlSpecialty(["1000", "1100"])).toBe("kardiologia");
		expect(primaryPlSpecialty(["1500", "1640"])).toBe("urologia");
		expect(primaryPlSpecialty(["1100", "1200", "1220"])).toBeNull();
		expect(primaryPlSpecialty(["1070"])).toBeNull();
		expect(classifyPlEstablishment("3", ["1450", "9450"])).toEqual({
			professionCode: PL_SPECIALIST,
			specialtyCode: "ginekologia",
		});
		expect(plListingSlugFor(PL_SPECIALIST, "kardiologia")).toBe("poradnie-kardiologiczne");
		expect(plListingSlugFor(PL_SPECIALIST, null)).toBe("przychodnie-specjalistyczne");
		expect(plListingSlugFor(PL_SPECIALIST, "nieznana")).toBe("przychodnie-specjalistyczne");
		expect(plListingSlugFor(PL_PRIMARY_CARE, "kardiologia")).toBe("przychodnie-poz");
		expect(plListingSlugFor("XX", null)).toBeNull();
	});

	it("never shares a listing slug with another market", () => {
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
		expect([...allPlListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allPlListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isPlListingSlug(slug)).toBe(true);
		}
		for (const segment of PL_RESERVED_SEGMENTS) expect(isPlListingSlug(segment)).toBe(false);
		expect(isPlListingSlug("lekarna")).toBe(false);
		expect(plProfessionOfListingSlug("szpitale")).toBe(PL_HOSPITAL);
		expect(plProfessionOfListingSlug("stomatologia")).toBe(PL_DENTAL);
		expect(plProfessionOfListingSlug("poradnie-kardiologiczne")).toBeUndefined();
	});
});
