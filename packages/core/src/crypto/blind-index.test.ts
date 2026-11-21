/// <reference types="node" />
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindIndex, deriveBlindIndexKey } from "./blind-index";
import { normalizeEmail, normalizePhone } from "./phone";

const master = randomBytes(32);

describe("blindIndex", () => {
	const orgA = deriveBlindIndexKey(master, "org-a");
	const orgB = deriveBlindIndexKey(master, "org-b");

	it("is stable within an organization and matches equivalent inputs", () => {
		const index = blindIndex("Lea.Martin@Example.org", orgA, "email");
		expect(index).toMatch(/^[0-9a-f]{32}$/);
		expect(blindIndex("  lea.martin@example.ORG ", orgA, "email")).toBe(index);
		expect(blindIndex("06 12 34 56 78", orgA, "phone")).toBe(
			blindIndex("+33612345678", orgA, "phone"),
		);
		expect(deriveBlindIndexKey(master, "org-a")).toEqual(orgA);
	});

	it("differs across organizations, master keys and kinds", () => {
		const email = "lea.martin@example.org";
		expect(blindIndex(email, orgA, "email")).not.toBe(blindIndex(email, orgB, "email"));
		const otherMaster = deriveBlindIndexKey(randomBytes(32), "org-a");
		expect(blindIndex(email, orgA, "email")).not.toBe(blindIndex(email, otherMaster, "email"));
	});

	it("rejects weak master keys, empty organizations and invalid values", () => {
		expect(() => deriveBlindIndexKey(randomBytes(16), "org-a")).toThrow(RangeError);
		expect(() => deriveBlindIndexKey(master, "")).toThrow(RangeError);
		expect(() => blindIndex("not an email", orgA, "email")).toThrow(RangeError);
		expect(() => blindIndex("12", orgA, "phone")).toThrow(RangeError);
	});
});

describe("normalizeEmail", () => {
	it("trims and lowercases", () => {
		expect(normalizeEmail("  Lea.MARTIN@Example.org\n")).toBe("lea.martin@example.org");
		expect(normalizeEmail("Élodie@example.org")).toBe("élodie@example.org");
	});
});

describe("normalizePhone", () => {
	it.each([
		["06 12 34 56 78", "+33612345678"],
		["06.12.34.56.78", "+33612345678"],
		["06-12-34-56-78", "+33612345678"],
		["01 23 45 67 89", "+33123456789"],
		["+33 6 12 34 56 78", "+33612345678"],
		["+33 (0)6 12 34 56 78", "+33612345678"],
		["+33 06 12 34 56 78", "+33612345678"],
		["0033 6 12 34 56 78", "+33612345678"],
		["06 12 34 56 78", "+33612345678"],
		// Guadeloupe, Saint-Barthélemy, Saint-Martin
		["0590 12 34 56", "+590590123456"],
		["0690 12 34 56", "+590690123456"],
		["+590 690 12 34 56", "+590690123456"],
		["+590 0690 12 34 56", "+590690123456"],
		["+33 690 12 34 56", "+590690123456"],
		// Martinique
		["0596 12 34 56", "+596596123456"],
		["0696 12 34 56", "+596696123456"],
		// French Guiana
		["0594 12 34 56", "+594594123456"],
		["0694 12 34 56", "+594694123456"],
		// Réunion
		["0262 12 34 56", "+262262123456"],
		["0692 12 34 56", "+262692123456"],
		// Mayotte
		["0269 61 23 45", "+262269612345"],
		["0639 12 34 56", "+262639123456"],
		["+262 639 12 34 56", "+262639123456"],
		// Saint-Pierre-et-Miquelon
		["+508 41 23 45", "+508412345"],
		// Elsewhere, kept as written
		["+269 773 12 34", "+2697731234"],
		["+32 470 12 34 56", "+32470123456"],
		["0044 20 7946 0958", "+442079460958"],
	])("normalizes %j to %s", (input, expected) => {
		expect(normalizePhone(input)).toBe(expected);
	});

	it.each([
		"",
		"abc",
		"06 12 34 56",
		"06 12 34 56 78 9",
		"0 12 34 56 78",
		"+33 6 12 34",
		"+508 41 23",
		"+1 23",
		"+0 1234567",
	])("rejects %j", (input) => {
		expect(() => normalizePhone(input)).toThrow(RangeError);
	});
});
