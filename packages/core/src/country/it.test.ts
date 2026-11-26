import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneIt, normalizeItPostcode, toE164It } from "../phone-it";
import {
	IT_ID_SCHEMES,
	isValidItSourceId,
	itPlaceSlug,
	itUrlKey,
	parseCzFacilitySegment,
	parseItKey,
	parseItPlaceSegment,
	parsePractitionerSegment,
} from "../slugs";
import { isItListingSlug } from "../taxonomy/it";
import {
	adapterOfSegment,
	austria,
	czechia,
	france,
	IT_REGIONS,
	italy,
	itRegionOfMinistryCode,
	unitedKingdom,
} from "./index";

describe("the Italian adapter", () => {
	it("is an Italian-language directory market without booking or e-identity claims", () => {
		expect(italy.code).toBe("IT");
		expect(italy.segment).toBe("it");
		expect(italy.defaultLocale).toBe("it");
		expect(italy.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("it")).toBe(italy);
		expect(claimPolicyOf("IT").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(italy.healthDataHosting.regime).not.toBe("HDS");
		expect(italy.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not ISTAT codes", () => {
		expect(italy.timeZones).toEqual(["Europe/Rome"]);
		for (const code of ["12", "01", "20", "058", "258", "058091"]) {
			expect(italy.timeZoneOf(code)).toBe("Europe/Rome");
		}
		for (const code of ["21", "00", "1", "IT", "05809", "CZ010"]) {
			expect(() => italy.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the twenty regions and reads the ministry's region codes", () => {
		expect(Object.keys(IT_REGIONS)).toHaveLength(20);
		expect(IT_REGIONS["12"]).toBe("Lazio");
		expect(itRegionOfMinistryCode("120")).toBe("12");
		expect(itRegionOfMinistryCode("010")).toBe("01");
		expect(itRegionOfMinistryCode("200")).toBe("20");
		expect(itRegionOfMinistryCode("041")).toBe("04");
		expect(itRegionOfMinistryCode("042")).toBe("04");
		for (const code of ["043", "210", "000", "12", "1200", ""]) {
			expect(itRegionOfMinistryCode(code)).toBeNull();
		}
	});

	it("names the ministry's three lists under the IODL 2.0 and ISTAT's places under CC BY 4.0", () => {
		expect(italy.registries.map((source) => source.id)).toEqual([
			"it-farmacie",
			"it-parafarmacie",
			"it-posti-letto",
			"it-istat",
		]);
		for (const source of italy.registries.slice(0, 3)) {
			expect(source.publisher).toBe("Ministero della Salute");
			expect(source.licence).toContain("IODL 2.0");
			expect(source.licenceUrl).toBe("https://www.dati.gov.it/iodl/2.0/");
			expect(source.attribution).toMatch(/^Fonte: Ministero della Salute, .+, IODL 2\.0$/);
		}
		const istat = italy.registries[3];
		expect(istat?.licence).toBe("CC BY 4.0");
		expect(istat?.attribution).toMatch(/^Fonte: Istat, .+ al 1° gennaio \d{4}, CC BY 4\.0/);
		expect(istat?.provides).toEqual(["places"]);
	});

	it("identifies places by the ministry's codes, one scheme per list", () => {
		expect(italy.practitionerIds.map((scheme) => scheme.id)).toEqual([
			"IT-FARM",
			"IT-PFARM",
			"IT-HSP",
		]);
		expect(isValidItSourceId("IT-FARM", "12345")).toBe(true);
		expect(isValidItSourceId("IT-FARM", "012345")).toBe(false);
		expect(isValidItSourceId("IT-PFARM", "002112")).toBe(true);
		expect(isValidItSourceId("IT-PFARM", "2112")).toBe(false);
		expect(isValidItSourceId("IT-HSP", "010030")).toBe(true);
		expect(isValidItSourceId("IT-HSP", "10030")).toBe(false);
		expect(isValidItSourceId("IT-XX", "1")).toBe(false);
		for (const scheme of italy.practitionerIds) expect(scheme.isValid("abc")).toBe(false);
	});

	it("prints an address street, then CAP and municipality", () => {
		expect(
			italy.address.lines({ street: "Via del Corso, 10", postcode: "00186", city: "Roma" }),
		).toEqual(["Via del Corso, 10", "00186 Roma"]);
		expect(italy.address.lines({ street: null, postcode: null, city: "Milano" })).toEqual([
			"Milano",
		]);
		expect(italy.address.postcode.test("00186")).toBe(true);
		expect(italy.address.postcode.test("0018")).toBe(false);
	});

	it("never shares a listing slug with another market", () => {
		for (const code of Object.keys(italy.taxonomy.professions)) {
			const slug = italy.taxonomy.listingSlugFor(code, null) ?? "";
			expect(slug).toBeTruthy();
			for (const other of [france, austria, unitedKingdom, czechia]) {
				expect(other.taxonomy.isListingSlug(slug)).toBe(false);
			}
			expect(isItListingSlug(slug)).toBe(true);
		}
	});
});

describe("Italian page addresses", () => {
	it("end with the list letter and the ministry's code", () => {
		expect(itUrlKey("IT-FARM", "12345")).toBe("f12345");
		expect(itPlaceSlug("Farmacia San Carlo", "IT-FARM", "12345")).toBe("farmacia-san-carlo-f12345");
		expect(itPlaceSlug("Parafarmacia Eurosan", "IT-PFARM", "002113")).toBe(
			"parafarmacia-eurosan-p002113",
		);
		expect(itPlaceSlug("Ospedali Riuniti Pinerolo", "IT-HSP", "010030")).toBe(
			"ospedali-riuniti-pinerolo-s010030",
		);
		expect(itPlaceSlug("", "IT-HSP", "010030")).toBe("s010030");
		expect(itPlaceSlug("Università di Pavia", "IT-HSP", "030001")).toBe(
			"universita-di-pavia-s030001",
		);
	});

	it("are read back to the scheme and the code, never guessed", () => {
		expect(parseItPlaceSegment("farmacia-san-carlo-f12345")).toEqual({
			idScheme: "IT-FARM",
			nationalId: "12345",
			namePart: "farmacia-san-carlo",
		});
		expect(parseItPlaceSegment("p002113")).toEqual({
			idScheme: "IT-PFARM",
			nationalId: "002113",
			namePart: "",
		});
		expect(parseItPlaceSegment("ospedale-s010030")?.idScheme).toBe("IT-HSP");
		expect(parseItKey("F12345")).toEqual({ idScheme: "IT-FARM", nationalId: "12345" });
		for (const segment of ["farmacia-12345", "p2113", "s01003", "x123", "Farmacia-f1", ""]) {
			expect(parseItPlaceSegment(segment), segment).toBeNull();
		}
		for (const scheme of Object.keys(IT_ID_SCHEMES)) expect(scheme).toMatch(/^IT-/);
	});

	it("are not France's or Czechia's (a segment is read in the market of its page)", () => {
		expect(parsePractitionerSegment("farmacia-san-carlo-f12345")).toBeNull();
		expect(parseCzFacilitySegment("ospedale-s010030")).toBeNull();
	});
});

describe("Italian phone numbers", () => {
	it("normalizes published numbers to E.164, keeping a fixed line's leading 0", () => {
		expect(toE164It("06 1234 5678")).toBe("+390612345678");
		expect(toE164It("+39 06 12345678")).toBe("+390612345678");
		expect(toE164It("0039 333 1234567")).toBe("+393331234567");
		expect(toE164It("39 011 5612345")).toBe("+390115612345");
		expect(toE164It("333/1234567")).toBe("+393331234567");
		expect(toE164It("0471 123456 - 0471 654321")).toBe("+390471123456");
		expect(toE164It("800 123456")).toBe("+39800123456");
		expect(toE164It("+33 4 72 00 00 00")).toBe("+33472000000");
		expect(toE164It("12345")).toBeNull();
		expect(toE164It("5123456789")).toBeNull();
		expect(toE164It("")).toBeNull();
		expect(toE164It(null)).toBeNull();
	});

	it("prints numbers as Italians write them", () => {
		expect(formatPhoneIt("+390612345678")).toBe("06 12345678");
		expect(formatPhoneIt("+390115612345")).toBe("011 5612345");
		expect(formatPhoneIt("+390471123456")).toBe("0471 123456");
		expect(formatPhoneIt("+393331234567")).toBe("333 123 4567");
		expect(formatPhoneIt("+39800123456")).toBe("800 123456");
		expect(formatPhoneIt("+33472000000")).toBe("+33472000000");
	});
});

describe("Italian postcodes", () => {
	it("are five digits, with the zeros a spreadsheet dropped", () => {
		expect(normalizeItPostcode("00186")).toBe("00186");
		expect(normalizeItPostcode(" 20121 ")).toBe("20121");
		expect(normalizeItPostcode("186")).toBe("00186");
		expect(normalizeItPostcode("00000")).toBeNull();
		expect(normalizeItPostcode("12")).toBeNull();
		expect(normalizeItPostcode("1234567")).toBeNull();
		expect(normalizeItPostcode("ABCDE")).toBeNull();
		expect(normalizeItPostcode(null)).toBeNull();
	});
});
