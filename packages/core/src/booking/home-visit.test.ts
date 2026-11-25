import { describe, expect, it } from "vitest";
import {
	isInServiceArea,
	isInseeCode,
	MAX_HOME_ADDRESS_LENGTH,
	MAX_SERVICE_AREA,
	normalizeHomeAddress,
	normalizeServiceArea,
} from "./home-visit";

describe("isInseeCode", () => {
	it("accepts commune and arrondissement codes, Corsica and overseas included", () => {
		for (const code of ["75115", "69383", "2A004", "2B033", "97411"]) {
			expect(isInseeCode(code)).toBe(true);
		}
	});

	it("refuses postcodes of the wrong length, department codes and anything else", () => {
		for (const code of ["7511", "751150", "2C004", "2a004", "75", "", "75 115", "<b>"]) {
			expect(isInseeCode(code)).toBe(false);
		}
	});
});

describe("normalizeServiceArea", () => {
	it("trims, upper-cases, removes duplicates and sorts", () => {
		expect(normalizeServiceArea([" 75115", "75114", "2a004", "75115"])).toEqual([
			"2A004",
			"75114",
			"75115",
		]);
		expect(normalizeServiceArea([])).toEqual([]);
	});

	it("refuses a value that is not an INSEE code", () => {
		expect(() => normalizeServiceArea(["75115", "Paris"])).toThrow(RangeError);
	});

	it("holds at most MAX_SERVICE_AREA communes", () => {
		const codes = Array.from({ length: MAX_SERVICE_AREA + 1 }, (_, index) =>
			String(10_000 + index),
		);
		expect(() => normalizeServiceArea(codes)).toThrow(RangeError);
		expect(normalizeServiceArea(codes.slice(0, MAX_SERVICE_AREA))).toHaveLength(MAX_SERVICE_AREA);
	});
});

describe("isInServiceArea", () => {
	const area = ["75114", "75115", "2A004"];

	it("matches the exact INSEE code of the patient's commune", () => {
		expect(isInServiceArea(area, "75115")).toBe(true);
		expect(isInServiceArea(area, " 2a004 ")).toBe(true);
	});

	it("refuses another commune, the city of an arrondissement and malformed codes", () => {
		expect(isInServiceArea(area, "75116")).toBe(false);
		// Paris itself is not one of its arrondissements: the area lists what is visited.
		expect(isInServiceArea(area, "75056")).toBe(false);
		expect(isInServiceArea(area, "")).toBe(false);
		expect(isInServiceArea([], "75115")).toBe(false);
	});
});

describe("normalizeHomeAddress", () => {
	it("trims lines, collapses spaces and drops empty lines", () => {
		expect(normalizeHomeAddress("  12   rue de l’Exemple \r\n\n  Bât. B, 3e étage  ")).toBe(
			"12 rue de l’Exemple\nBât. B, 3e étage",
		);
	});

	it("replaces control characters", () => {
		expect(normalizeHomeAddress("12 rue\u0000 Exemple\u0007")).toBe("12 rue Exemple");
	});

	it("refuses an empty, too long or too many-lined address", () => {
		expect(normalizeHomeAddress("   \n  ")).toBeNull();
		expect(normalizeHomeAddress("a".repeat(MAX_HOME_ADDRESS_LENGTH + 1))).toBeNull();
		expect(normalizeHomeAddress("a".repeat(MAX_HOME_ADDRESS_LENGTH))).toHaveLength(
			MAX_HOME_ADDRESS_LENGTH,
		);
		expect(normalizeHomeAddress("1\n2\n3\n4\n5")).toBeNull();
	});
});
