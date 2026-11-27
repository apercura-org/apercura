import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneLt, normalizeLtPostcode, toE164Lt } from "../phone-lt";
import { isValidLtSourceId, LT_ID_SCHEME, ltFacilitySlug, parseLtFacilitySegment } from "../slugs";
import { isLtListingSlug } from "../taxonomy/lt";
import { adapterOfSegment, LT_CITY_MUNICIPALITIES, LT_COUNTIES, lithuania } from "./index";

describe("the Lithuanian adapter", () => {
	it("is a Lithuanian-language directory market without booking or e-identity claims", () => {
		expect(lithuania.code).toBe("LT");
		expect(lithuania.segment).toBe("lt");
		expect(lithuania.defaultLocale).toBe("lt");
		expect(lithuania.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("lt")).toBe(lithuania);
		expect(claimPolicyOf("LT").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification and names the supervisory authority", () => {
		expect(lithuania.healthDataHosting.regime).not.toBe("HDS");
		expect(lithuania.healthDataHosting.basis).toMatch(/^No hosting certification/);
		expect(lithuania.healthDataHosting.basis).toContain("Valstybinė duomenų apsaugos inspekcija");
	});

	it("credits VASPVT and the Address Register under CC BY 4.0", () => {
		expect(lithuania.registries.map((registry) => registry.id)).toEqual([
			"lt-vaspvt",
			"lt-adresu-registras",
		]);
		for (const registry of lithuania.registries) {
			expect(registry.licence).toContain("CC BY 4.0");
			expect(registry.attribution).toMatch(/^Šaltinis: /);
			expect(registry.attribution).toContain("CC BY 4.0");
		}
		expect(lithuania.registries[0]?.provides).toContain("practitioners");
		expect(lithuania.registries[1]?.provides).toEqual(["places"]);
	});

	it("has one time zone and refuses codes that are not Lithuanian", () => {
		expect(lithuania.timeZones).toEqual(["Europe/Vilnius"]);
		expect(lithuania.timeZoneOf("10")).toBe("Europe/Vilnius");
		expect(lithuania.timeZoneOf("13")).toBe("Europe/Vilnius");
		expect(lithuania.timeZoneOf("31003")).toBe("Europe/Vilnius");
		expect(() => lithuania.timeZoneOf("LT")).toThrow(RangeError);
		expect(() => lithuania.timeZoneOf("1234567")).toThrow(RangeError);
	});

	it("names the ten counties and the cities that are a municipality of their own", () => {
		expect(Object.keys(LT_COUNTIES)).toHaveLength(10);
		for (const name of Object.values(LT_COUNTIES)) expect(name).toMatch(/ apskritis$/);
		expect(LT_CITY_MUNICIPALITIES["31003"]).toBe("13");
		expect(Object.keys(LT_CITY_MUNICIPALITIES)).toHaveLength(8);
	});

	it("prints an address as the street, then the postcode and the settlement", () => {
		expect(
			lithuania.address.lines({ street: "Pavyzdžio g. 12", postcode: null, city: "Vilnius" }),
		).toEqual(["Pavyzdžio g. 12", "Vilnius"]);
		expect(
			lithuania.address.lines({ street: "Pavyzdžio g. 12", postcode: "LT-01100", city: "Vilnius" }),
		).toEqual(["Pavyzdžio g. 12", "LT-01100 Vilnius"]);
		expect(lithuania.address.postcode.test("LT-01100")).toBe(true);
		expect(lithuania.address.postcode.test("01100")).toBe(false);
	});

	it("serves only Lithuanian listing slugs", () => {
		expect(lithuania.taxonomy.isListingSlug("odontologijos-klinikos")).toBe(true);
		expect(isLtListingSlug("istaiga")).toBe(false);
		expect(isLtListingSlug("dentistas")).toBe(false);
	});
});

describe("Lithuanian phone numbers and postcodes", () => {
	it("reads the forms numbers are published in", () => {
		expect(toE164Lt("+370 5 212 3456")).toBe("+37052123456");
		expect(toE164Lt("8 5 212 3456")).toBe("+37052123456");
		expect(toE164Lt("(8 5) 212 3456")).toBe("+37052123456");
		expect(toE164Lt("00370 612 34567")).toBe("+37061234567");
		expect(toE164Lt("861234567")).toBe("+37061234567");
		expect(toE164Lt("61234567")).toBe("+37061234567");
		expect(toE164Lt("8 37 123 456, 8 612 34567")).toBe("+37037123456");
		expect(toE164Lt("+33 4 72 00 00 00")).toBe("+33472000000");
		expect(toE164Lt("12345")).toBeNull();
		expect(toE164Lt("")).toBeNull();
		expect(toE164Lt(null)).toBeNull();
	});

	it("prints a number with its area code apart", () => {
		expect(formatPhoneLt("+37052123456")).toBe("+370 5 212 3456");
		expect(formatPhoneLt("+37037123456")).toBe("+370 37 123 456");
		expect(formatPhoneLt("+37031512345")).toBe("+370 315 12345");
		expect(formatPhoneLt("+37061234567")).toBe("+370 612 34567");
		expect(formatPhoneLt("+33472000000")).toBe("+33472000000");
	});

	it("writes a postcode with its country prefix", () => {
		expect(normalizeLtPostcode("LT-01100")).toBe("LT-01100");
		expect(normalizeLtPostcode("lt 01100")).toBe("LT-01100");
		expect(normalizeLtPostcode("01100")).toBe("LT-01100");
		expect(normalizeLtPostcode("0110")).toBeNull();
		expect(normalizeLtPostcode(null)).toBeNull();
	});
});

describe("Lithuanian page keys", () => {
	it("are the institution's number and the address code, or the address GUID's start", () => {
		expect(LT_ID_SCHEME).toBe("LT-VASPVT");
		expect(isValidLtSourceId("5271-12679435")).toBe(true);
		expect(isValidLtSourceId("5271-v00141024")).toBe(true);
		expect(isValidLtSourceId("5271")).toBe(false);
		expect(isValidLtSourceId("0271-12679435")).toBe(false);
		expect(isValidLtSourceId("5271-V00141024")).toBe(false);
		expect(isValidLtSourceId("5271-v0014102")).toBe(false);
	});

	it("end a page's URL, after its name", () => {
		const slug = ltFacilitySlug("UAB „Pavyzdinė klinika“", "5271-12679435");
		expect(slug).toBe("uab-pavyzdine-klinika-5271-12679435");
		expect(parseLtFacilitySegment(slug)).toEqual({
			idScheme: LT_ID_SCHEME,
			nationalId: "5271-12679435",
			namePart: "uab-pavyzdine-klinika",
		});
		// A name that ends with a number keeps it: the key is always the last two parts.
		expect(parseLtFacilitySegment("dantu-studija-32-5271-v00141024")).toEqual({
			idScheme: LT_ID_SCHEME,
			nationalId: "5271-v00141024",
			namePart: "dantu-studija-32",
		});
		expect(parseLtFacilitySegment("5271-12679435")?.namePart).toBe("");
		expect(parseLtFacilitySegment("klinika-5271")).toBeNull();
		expect(parseLtFacilitySegment("Klinika-5271-12679435")).toBeNull();
	});
});
