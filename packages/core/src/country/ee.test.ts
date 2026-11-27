import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneEe, normalizeEePostcode, toE164Ee } from "../phone-ee";
import {
	EE_ID_SCHEMES,
	eeFacilitySlug,
	eeLicenceNumber,
	eeUrlKey,
	isValidEeSourceId,
	parseAtPractitionerSegment,
	parseEeFacilitySegment,
	parseEeKey,
} from "../slugs";
import { isEeListingSlug } from "../taxonomy/ee";
import { adapterOfSegment, EE_COUNTIES, EE_SCHEME_IDS, estonia } from "./index";

describe("the Estonian adapter", () => {
	it("is an Estonian-language directory market without booking or e-identity claims", () => {
		expect(estonia.code).toBe("EE");
		expect(estonia.segment).toBe("ee");
		expect(estonia.defaultLocale).toBe("et");
		expect(estonia.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("ee")).toBe(estonia);
		expect(claimPolicyOf("EE").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(estonia.healthDataHosting.regime).not.toBe("HDS");
		expect(estonia.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(estonia.timeZones).toEqual(["Europe/Tallinn"]);
		for (const code of ["0037", "0784", "8151"]) {
			expect(estonia.timeZoneOf(code)).toBe("Europe/Tallinn");
		}
		for (const code of ["37", "07840", "EE1", ""]) {
			expect(() => estonia.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the fifteen counties", () => {
		expect(Object.keys(EE_COUNTIES)).toHaveLength(15);
		expect(EE_COUNTIES["0037"]).toBe("Harju maakond");
	});

	it("names every source with its licence and attribution, the Health Board's under CC BY-NC-SA 3.0", () => {
		for (const registry of estonia.registries) {
			expect(registry.licence).toBeTruthy();
			expect(registry.licenceUrl).toMatch(/^https:\/\//);
			expect(registry.attribution).toBeTruthy();
		}
		const medre = estonia.registries.find((r) => r.id === "ee-medre");
		expect(medre?.licence).toMatch(/\(CC BY-NC-SA 3\.0\)$/);
		expect(medre?.licenceUrl).toBe("https://creativecommons.org/licenses/by-nc-sa/3.0/deed.et");
		expect(medre?.attribution).toMatch(
			/^Terviseamet, .*CC BY-NC-SA 3\.0; Apercura on andmeid muutnud$/,
		);
		expect(estonia.registries.find((r) => r.id === "ee-ehak")?.attribution).toMatch(
			/^Haldus- ja asustusjaotus: Maa- ja Ruumiamet \d{2}\.\d{2}\.\d{4}$/,
		);
		expect(estonia.practitionerIds.map((id) => id.id)).toEqual(EE_SCHEME_IDS);
	});

	it("prints an address the Estonian way", () => {
		expect(
			estonia.address.lines({ street: "Ülase tn 16", postcode: "50412", city: "Tartu" }),
		).toEqual(["Ülase tn 16", "50412 Tartu"]);
		expect(estonia.address.lines({ street: null, postcode: null, city: "Haabneeme" })).toEqual([
			"Haabneeme",
		]);
		expect(estonia.address.postcode.test("10117")).toBe(true);
		expect(estonia.address.postcode.test("01011")).toBe(false);
	});

	it("lists providers under Estonian slugs", () => {
		expect(estonia.taxonomy.listingSlugFor("EE_HOSPITAL", null)).toBe("haiglad");
		expect(isEeListingSlug("apteegid")).toBe(true);
		expect(isEeListingSlug("asutus")).toBe(false);
	});
});

describe("Estonian phone numbers and postcodes", () => {
	it("reads the forms the registers publish", () => {
		expect(toE164Ee("+372 605 9600")).toBe("+3726059600");
		expect(toE164Ee("+3726208200")).toBe("+3726208200");
		expect(toE164Ee("6109490")).toBe("+3726109490");
		expect(toE164Ee("5135 780")).toBe("+3725135780");
		expect(toE164Ee("58557201")).toBe("+37258557201");
		expect(toE164Ee("+372 586 51158")).toBe("+37258651158");
		expect(toE164Ee("00372 5123 4567")).toBe("+37251234567");
		expect(toE164Ee("6566411; 6507237")).toBe("+3726566411");
		expect(toE164Ee("37251234567")).toBe("+37251234567");
		expect(toE164Ee("+358 9 1234567")).toBe("+35891234567");
		expect(toE164Ee("112")).toBeNull();
		expect(toE164Ee("1234567")).toBeNull();
		expect(toE164Ee("612345")).toBeNull();
		expect(toE164Ee("")).toBeNull();
		expect(toE164Ee(null)).toBeNull();
	});

	it("prints seven digits as three and four, eight as four and four", () => {
		expect(formatPhoneEe("+3726109490")).toBe("610 9490");
		expect(formatPhoneEe("+37251234567")).toBe("5123 4567");
		expect(formatPhoneEe("+35891234567")).toBe("+35891234567");
	});

	it("normalizes postcodes to five digits", () => {
		expect(normalizeEePostcode("50412")).toBe("50412");
		expect(normalizeEePostcode(" 50 412 ")).toBe("50412");
		expect(normalizeEePostcode("EE-10117")).toBe("10117");
		expect(normalizeEePostcode("5041")).toBeNull();
		expect(normalizeEePostcode("01234")).toBeNull();
		expect(normalizeEePostcode(null)).toBeNull();
	});
});

describe("Estonian keys", () => {
	it("key a provider by its first licence and a pharmacy by its place of business", () => {
		expect(isValidEeSourceId("EE-TTL", "01909")).toBe(true);
		expect(isValidEeSourceId("EE-TTL", "1909")).toBe(false);
		expect(isValidEeSourceId("EE-APT", "457")).toBe(true);
		expect(isValidEeSourceId("EE-APT", "0457")).toBe(false);
		expect(isValidEeSourceId("EE-XX", "1")).toBe(false);
		expect(Object.keys(EE_ID_SCHEMES)).toEqual(["EE-TTL", "EE-APT"]);
		expect(eeUrlKey("EE-TTL", "01909")).toBe("l01909");
		expect(eeLicenceNumber("01909")).toBe("L01909");
	});

	it("write and read a page segment", () => {
		expect(eeFacilitySlug("Perearstikeskus Näide OÜ", "EE-TTL", "01909")).toBe(
			"perearstikeskus-naide-ou-l01909",
		);
		expect(eeFacilitySlug("Õunapuu Näidisapteek", "EE-APT", "457")).toBe(
			"ounapuu-naidisapteek-ap457",
		);
		expect(parseEeFacilitySegment("perearstikeskus-naide-l01909")).toEqual({
			idScheme: "EE-TTL",
			nationalId: "01909",
			namePart: "perearstikeskus-naide",
		});
		expect(parseEeFacilitySegment("naidisapteek-ap457")).toMatchObject({
			idScheme: "EE-APT",
			nationalId: "457",
		});
		expect(parseEeKey("L01909")).toEqual({ idScheme: "EE-TTL", nationalId: "01909" });
		expect(parseEeFacilitySegment("naide-l1909")).toBeNull();
		expect(parseEeFacilitySegment("naide-x01909")).toBeNull();
		expect(parseEeFacilitySegment("Naide-l01909")).toBeNull();
		// An Austrian key never reads as an Estonian licence (its digits never start with 0).
		expect(parseAtPractitionerSegment("naide-l01909")).toBeNull();
	});
});
