import { describe, expect, it } from "vitest";
import { isValidRpps } from "./rpps";

// Synthetic numbers computed for these tests; they do not identify anyone.
const VALID = ["10000000009", "12345678903", "99999999990", "10101010105"];

describe("isValidRpps", () => {
	it.each(VALID)("accepts the Luhn-valid number %s", (value) => {
		expect(isValidRpps(value)).toBe(true);
	});

	it.each(["10000000000", "12345678901", "99999999999", "10101010100"])(
		"rejects %s, whose check digit is wrong",
		(value) => {
			expect(isValidRpps(value)).toBe(false);
		},
	);

	it("rejects a single transposition of adjacent digits", () => {
		expect(isValidRpps("21345678903")).toBe(false);
	});

	it.each([
		["too short", "1000000009"],
		["too long", "100000000009"],
		["empty", ""],
		["letters", "1000000000A"],
		["spaces", "1000 000 0009"],
		["surrounding whitespace", " 10000000009"],
		["trailing newline", "10000000009\n"],
		["non-ASCII digits", "١٠٠٠٠٠٠٠٠٠٩"],
	])("rejects input that is %s", (_label, value) => {
		expect(isValidRpps(value)).toBe(false);
	});
});
