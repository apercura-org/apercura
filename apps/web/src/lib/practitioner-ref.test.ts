import { describe, expect, it } from "vitest";
import { isRppsRef, parsePractitionerRef, practitionerRefOf } from "./practitioner-ref";

describe("practitioner references", () => {
	it("reads an RPPS, alone or at the end of a French page address", () => {
		const rpps = { country: "FR", idScheme: "RPPS", nationalId: "19999990013" };
		expect(parsePractitionerRef("19999990013")).toEqual(rpps);
		expect(parsePractitionerRef(" 1999 9990 013 ")).toEqual(rpps);
		expect(parsePractitionerRef("https://apercura.org/fr/praticien/camille-19999990013")).toEqual(
			rpps,
		);
		expect(parsePractitionerRef("19999990014")).toBeNull();
	});

	it("reads an Austrian key, alone, as a slug or as a page address", () => {
		const key = { country: "AT", idScheme: "AT-WIEN", nationalId: "7983" };
		expect(parsePractitionerRef("w7983")).toEqual(key);
		expect(parsePractitionerRef("W7983")).toEqual(key);
		expect(parsePractitionerRef("anna-muster-w7983")).toEqual(key);
		expect(parsePractitionerRef("https://apercura.org/at/arzt/anna-muster-w7983/")).toEqual(key);
		expect(parsePractitionerRef("st45")?.idScheme).toBe("AT-STMK");
		expect(parsePractitionerRef("x45")).toBeNull();
		expect(parsePractitionerRef("")).toBeNull();
		expect(parsePractitionerRef(null)).toBeNull();
	});

	it("writes the reference back", () => {
		expect(practitionerRefOf({ idScheme: "RPPS", nationalId: "19999990013" })).toBe("19999990013");
		expect(practitionerRefOf({ idScheme: "AT-STMK", nationalId: "45" })).toBe("st45");
		expect(isRppsRef({ country: "FR", idScheme: "RPPS", nationalId: "19999990013" })).toBe(true);
		expect(isRppsRef({ country: "AT", idScheme: "AT-WIEN", nationalId: "1" })).toBe(false);
	});
});

describe("UK practice references", () => {
	const gp = { country: "GB", idScheme: "GB-ODS-GP", nationalId: "A99001" };

	it("read the `gb:` reference, a UK page address, and a bare key typed on a UK page", () => {
		expect(parsePractitionerRef("gb:a99001")).toEqual(gp);
		expect(parsePractitionerRef(" GB:A99001 ")).toEqual(gp);
		expect(
			parsePractitionerRef("https://apercura.org/gb/practice/the-example-surgery-a99001"),
		).toEqual(gp);
		expect(parsePractitionerRef("/gb/practice/the-example-surgery-a99001/")).toEqual(gp);
		expect(parsePractitionerRef("A99001")).toEqual(gp);
		expect(parsePractitionerRef("gb:sg89001")).toEqual({
			country: "GB",
			idScheme: "GB-PHS-GP",
			nationalId: "89001",
		});
		expect(parsePractitionerRef("gb:zz1")).toBeNull();
	});

	it("never read a Welsh ODS code as an Austrian key where the market is known", () => {
		const welsh = { country: "GB", idScheme: "GB-ODS-GP", nationalId: "W91234" };
		expect(parsePractitionerRef("gb:w91234")).toEqual(welsh);
		expect(parsePractitionerRef("https://apercura.org/gb/practice/meddygfa-w91234")).toEqual(welsh);
		expect(parsePractitionerRef("W91234", "GB")).toEqual(welsh);
		expect(parsePractitionerRef("w91234")?.country).toBe("AT");
		expect(parsePractitionerRef("https://apercura.org/at/arzt/anna-muster-w7983")?.country).toBe(
			"AT",
		);
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(gp)).toBe("gb:a99001");
		expect(practitionerRefOf({ idScheme: "GB-BSO-DENT", nationalId: "0a1b2c3d4e" })).toBe(
			"gb:nd0a1b2c3d4e",
		);
		expect(parsePractitionerRef(practitionerRefOf(gp))).toEqual(gp);
	});
});
