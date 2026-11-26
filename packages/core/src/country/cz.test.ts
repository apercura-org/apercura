import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneCz, normalizeCzPostcode, toE164Cz } from "../phone-cz";
import {
	CZ_ID_SCHEME,
	czFacilitySlug,
	isValidCzSourceId,
	parseAtPractitionerSegment,
	parseCzFacilitySegment,
	parseGbPracticeSegment,
	parsePractitionerSegment,
} from "../slugs";
import { isCzListingSlug } from "../taxonomy/cz";
import {
	adapterOfSegment,
	austria,
	CZ_REGIONS,
	czechia,
	france,
	PRAGUE_DISTRICT_CODE,
	unitedKingdom,
} from "./index";

describe("the Czech adapter", () => {
	it("is a Czech-language directory market without booking or e-identity claims", () => {
		expect(czechia.code).toBe("CZ");
		expect(czechia.segment).toBe("cz");
		expect(czechia.defaultLocale).toBe("cs");
		expect(czechia.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("cz")).toBe(czechia);
		expect(adapterOfSegment("cs")).toBeUndefined();
		expect(claimPolicyOf("CZ").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(czechia.healthDataHosting.regime).not.toBe("HDS");
		expect(czechia.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not Czech NUTS or LAU codes", () => {
		expect(czechia.timeZones).toEqual(["Europe/Prague"]);
		for (const code of ["CZ010", "CZ080", PRAGUE_DISTRICT_CODE, "CZ0642", "CZ020C"]) {
			expect(czechia.timeZoneOf(code)).toBe("Europe/Prague");
		}
		expect(() => czechia.timeZoneOf("75")).toThrow(RangeError);
		expect(() => czechia.timeZoneOf("SK010")).toThrow(RangeError);
	});

	it("knows the fourteen regions", () => {
		expect(Object.keys(CZ_REGIONS)).toHaveLength(14);
		expect(CZ_REGIONS.CZ010).toBe("Hlavní město Praha");
	});

	it("names its two sources under CC BY 4.0 with their attribution", () => {
		expect(czechia.registries.map((source) => source.id)).toEqual(["cz-nrpzs", "cz-ruian"]);
		for (const source of czechia.registries) {
			expect(source.licence).toContain("CC BY 4.0");
			expect(source.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/deed.cs");
			expect(source.attribution).toBeTruthy();
		}
		expect(czechia.registries[1]?.attribution).toMatch(/^ČÚZK, \d{4}$/);
	});

	it("identifies facilities by their NRPZS number", () => {
		expect(czechia.practitionerIds.map((scheme) => scheme.id)).toEqual([CZ_ID_SCHEME]);
		expect(isValidCzSourceId("39781")).toBe(true);
		expect(isValidCzSourceId("7")).toBe(true);
		expect(isValidCzSourceId("039781")).toBe(false);
		expect(isValidCzSourceId("1234567890")).toBe(false);
		expect(isValidCzSourceId("ab")).toBe(false);
	});

	it("prints an address street, then postcode and town", () => {
		expect(
			czechia.address.lines({ street: "Lidická 241", postcode: "407 21", city: "Česká Kamenice" }),
		).toEqual(["Lidická 241", "407 21 Česká Kamenice"]);
		expect(czechia.address.lines({ street: null, postcode: null, city: "Praha 8" })).toEqual([
			"Praha 8",
		]);
		expect(czechia.address.postcode.test("110 00")).toBe(true);
		expect(czechia.address.postcode.test("11000")).toBe(false);
		expect(czechia.address.postcode.test("69001")).toBe(false);
	});

	it("never shares a listing slug with France, Austria or the United Kingdom", () => {
		for (const code of Object.keys(czechia.taxonomy.professions)) {
			const slug = czechia.taxonomy.listingSlugFor(code, null) ?? "";
			expect(slug).toBeTruthy();
			expect(france.taxonomy.isListingSlug(slug)).toBe(false);
			expect(austria.taxonomy.isListingSlug(slug)).toBe(false);
			expect(unitedKingdom.taxonomy.isListingSlug(slug)).toBe(false);
			expect(isCzListingSlug(slug)).toBe(true);
		}
	});
});

describe("Czech phone numbers", () => {
	it("normalizes published numbers to E.164", () => {
		expect(toE164Cz("+420326357125")).toBe("+420326357125");
		expect(toE164Cz("+420 326 357 125")).toBe("+420326357125");
		expect(toE164Cz("00420 603 422 530")).toBe("+420603422530");
		expect(toE164Cz("326357125")).toBe("+420326357125");
		expect(toE164Cz("420603422530")).toBe("+420603422530");
		expect(toE164Cz("603422530/603422531")).toBe("+420603422530");
		expect(toE164Cz("+421 2 1234 5678")).toBe("+421212345678");
		expect(toE164Cz("123456789")).toBeNull();
		expect(toE164Cz("32635712")).toBeNull();
		expect(toE164Cz("")).toBeNull();
		expect(toE164Cz(null)).toBeNull();
	});

	it("prints numbers in three groups of three", () => {
		expect(formatPhoneCz("+420326357125")).toBe("326 357 125");
		expect(formatPhoneCz("+420603422530")).toBe("603 422 530");
		expect(formatPhoneCz("+33472000000")).toBe("+33472000000");
	});
});

describe("Czech postcodes", () => {
	it("are written with a space after the third digit", () => {
		expect(normalizeCzPostcode("40721")).toBe("407 21");
		expect(normalizeCzPostcode("110 00")).toBe("110 00");
		expect(normalizeCzPostcode("1100")).toBeNull();
		expect(normalizeCzPostcode("90001")).toBeNull();
		expect(normalizeCzPostcode(null)).toBeNull();
	});
});

describe("Czech facility slugs", () => {
	it("end with the NRPZS number", () => {
		expect(czFacilitySlug("MUDr. Hana Boháčková", "39781")).toBe("mudr-hana-bohackova-39781");
		expect(czFacilitySlug("PharmDr. Jarmila Chytrá, Lékárna U České koruny", "54227")).toBe(
			"pharmdr-jarmila-chytra-lekarna-u-ceske-koruny-54227",
		);
		expect(czFacilitySlug("", "7")).toBe("7");
		expect(czFacilitySlug("x".repeat(200), "7")).toBe(`${"x".repeat(80)}-7`);
	});

	it("parse back to the number, and nothing else", () => {
		expect(parseCzFacilitySegment("mudr-hana-bohackova-39781")).toEqual({
			idScheme: CZ_ID_SCHEME,
			nationalId: "39781",
			namePart: "mudr-hana-bohackova",
		});
		expect(parseCzFacilitySegment("poliklinika-praha-4-12345")?.namePart).toBe(
			"poliklinika-praha-4",
		);
		expect(parseCzFacilitySegment("39781")?.namePart).toBe("");
		for (const invalid of ["", "x-0123", "x-", "X-39781", "x--39781", "x-1234567890", "x-a1"]) {
			expect(parseCzFacilitySegment(invalid)).toBeNull();
		}
	});

	it("are never read as a French page, and keep their market on the other markets' parsers", () => {
		expect(parsePractitionerSegment("mudr-hana-bohackova-39781")).toBeNull();
		expect(parseAtPractitionerSegment("mudr-hana-bohackova-39781")).toBeNull();
		expect(parseGbPracticeSegment("mudr-hana-bohackova-39781")).toBeNull();
	});
});
