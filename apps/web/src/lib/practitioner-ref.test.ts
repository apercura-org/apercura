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
