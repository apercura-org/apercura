import { describe, expect, it } from "vitest";
import {
	displayId,
	marketAdapter,
	marketSegmentOf,
	parseAnyPractitionerKey,
	parsePractitionerKey,
} from "./practitioner-key";

describe("parsePractitionerKey", () => {
	it("reads an RPPS in France and its interface translations", () => {
		const key = { country: "FR", idScheme: "RPPS", nationalId: "19999990013", namePart: "camille" };
		expect(parsePractitionerKey("fr", "camille-19999990013")).toEqual(key);
		expect(parsePractitionerKey("de", "camille-19999990013")).toEqual(key);
		expect(parsePractitionerKey("fr", "camille-19999990014")).toBeNull();
	});

	it("reads a regional list key in Austria, and never an RPPS there", () => {
		expect(parsePractitionerKey("de-AT", "anna-muster-w7983")).toEqual({
			country: "AT",
			idScheme: "AT-WIEN",
			nationalId: "7983",
			namePart: "anna-muster",
		});
		expect(parsePractitionerKey("de-AT", "st45")?.idScheme).toBe("AT-STMK");
		expect(parsePractitionerKey("de-AT", "camille-19999990013")).toBeNull();
		expect(parsePractitionerKey("fr", "anna-muster-w7983")).toBeNull();
	});

	it("names the market's features", () => {
		expect(marketAdapter("fr").features.booking).toBe(true);
		expect(marketAdapter("de-AT").features).toEqual({
			directory: true,
			booking: false,
			eIdentityClaim: false,
		});
	});

	it("reads any market's segment outside a locale, and prints the identifier", () => {
		expect(parseAnyPractitionerKey("camille-19999990013")?.country).toBe("FR");
		expect(parseAnyPractitionerKey("anna-muster-sb123")?.idScheme).toBe("AT-SBG");
		expect(parseAnyPractitionerKey("anna-muster")).toBeNull();
		expect(displayId({ idScheme: "RPPS", nationalId: "19999990013" })).toBe("19999990013");
		expect(displayId({ idScheme: "AT-WIEN", nationalId: "7983" })).toBe("w7983");
	});
});

describe("UK practice keys", () => {
	it("read a practice page segment in the UK only", () => {
		expect(parsePractitionerKey("en-GB", "the-example-surgery-a99001")).toEqual({
			country: "GB",
			idScheme: "GB-ODS-GP",
			nationalId: "A99001",
			namePart: "the-example-surgery",
		});
		expect(parsePractitionerKey("en-GB", "anna-muster-w7983")).toBeNull();
		expect(parsePractitionerKey("de-AT", "the-example-surgery-a99001")).toBeNull();
		expect(marketAdapter("en-GB").features.booking).toBe(false);
	});

	it("mark a UK segment outside a locale, and print the NHS identifier", () => {
		expect(marketSegmentOf("GB", "meddygfa-w91234")).toBe("gb.meddygfa-w91234");
		expect(marketSegmentOf("AT", "anna-muster-w7983")).toBe("anna-muster-w7983");
		expect(parseAnyPractitionerKey("gb.meddygfa-w91234")).toMatchObject({
			country: "GB",
			nationalId: "W91234",
		});
		expect(parseAnyPractitionerKey("meddygfa-w91234")?.country).toBe("AT");
		expect(displayId({ idScheme: "GB-ODS-GP", nationalId: "A99001" })).toBe("A99001");
		expect(displayId({ idScheme: "GB-PHS-GP", nationalId: "89001" })).toBe("sg89001");
	});
});
