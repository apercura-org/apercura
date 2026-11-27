import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneNo, normalizeNoPostcode, toE164No } from "../phone-no";
import { slugifyNo } from "../slugify";
import {
	isValidNoOrgNumber,
	isValidNoSourceId,
	NO_ID_SCHEMES,
	noFacilitySlug,
	noOrgNumber,
	noUrlKey,
	parseAtPractitionerSegment,
	parseNoFacilitySegment,
	parseNoKey,
} from "../slugs";
import { isNoListingSlug } from "../taxonomy/no";
import { adapterOfSegment, NO_COUNTIES, NO_SCHEME_IDS, norway, OSLO_MUNICIPALITY } from "./index";

describe("the Norwegian adapter", () => {
	it("is a Norwegian-language directory market without booking or e-identity claims", () => {
		expect(norway.code).toBe("NO");
		expect(norway.segment).toBe("no");
		expect(norway.defaultLocale).toBe("nb");
		expect(norway.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("no")).toBe(norway);
		expect(claimPolicyOf("NO").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(norway.healthDataHosting.regime).not.toBe("HDS");
		expect(norway.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(norway.timeZones).toEqual(["Europe/Oslo"]);
		for (const code of ["03", "0301", "46", "4601", "5501"]) {
			expect(norway.timeZoneOf(code)).toBe("Europe/Oslo");
		}
		// Svalbard is not a county; an old county number (12, Hordaland) is not one either.
		for (const code of ["21", "2100", "12", "1201", "301", "NO", ""]) {
			expect(() => norway.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the fifteen counties of the 2024 reform, Oslo a municipality too", () => {
		expect(Object.keys(NO_COUNTIES)).toHaveLength(15);
		expect(NO_COUNTIES["46"]).toBe("Vestland");
		expect(NO_COUNTIES["32"]).toBe("Akershus");
		expect(OSLO_MUNICIPALITY.slice(0, 2)).toBe("03");
	});

	it("names every source with its licence and attribution, the register's under NLOD 2.0", () => {
		for (const registry of norway.registries) {
			expect(registry.licence).toBeTruthy();
			expect(registry.licenceUrl).toMatch(/^https:\/\//);
			expect(registry.attribution).toBeTruthy();
		}
		const brreg = norway.registries.find((r) => r.id === "no-brreg");
		expect(brreg?.licence).toBe("Norsk lisens for offentlige data (NLOD) 2.0");
		expect(brreg?.licenceUrl).toBe("https://data.norge.no/nlod/no/2.0");
		// NLOD 2.0 § 5: the licensor named as the licence words it, and the change said.
		expect(brreg?.attribution).toBe(
			"Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av Apercura",
		);
		expect(norway.registries.find((r) => r.id === "no-adresser")?.attribution).toMatch(
			/^Adresser: © Kartverket/,
		);
		expect(norway.practitionerIds.map((id) => id.id)).toEqual(NO_SCHEME_IDS);
	});

	it("prints an address the Norwegian way", () => {
		expect(
			norway.address.lines({ street: "Ragnar Strøms veg 10", postcode: "2067", city: "Jessheim" }),
		).toEqual(["Ragnar Strøms veg 10", "2067 Jessheim"]);
		expect(norway.address.lines({ street: null, postcode: null, city: "Ullensaker" })).toEqual([
			"Ullensaker",
		]);
		expect(norway.address.postcode.test("0150")).toBe(true);
		expect(norway.address.postcode.test("150")).toBe(false);
	});

	it("lists establishments under Norwegian slugs", () => {
		expect(norway.taxonomy.listingSlugFor("NO_HOSPITAL", null)).toBe("sykehus");
		expect(isNoListingSlug("apotek")).toBe(true);
		expect(isNoListingSlug("virksomhet")).toBe(false);
	});
});

describe("Norwegian phone numbers and postcodes", () => {
	it("reads the forms the register publishes", () => {
		expect(toE164No("+47 22 12 34 56")).toBe("+4722123456");
		expect(toE164No("22123456")).toBe("+4722123456");
		expect(toE164No("0047 412 34 567")).toBe("+4741234567");
		expect(toE164No("4741234567")).toBe("+4741234567");
		expect(toE164No("22 12 34 56 / 91 23 45 67")).toBe("+4722123456");
		expect(toE164No("+46 8 123 456 78")).toBe("+46812345678");
		expect(toE164No("113")).toBeNull();
		expect(toE164No("02800")).toBeNull();
		expect(toE164No("12345678")).toBeNull();
		expect(toE164No("")).toBeNull();
		expect(toE164No(null)).toBeNull();
	});

	it("prints a mobile number as three, two and three, a fixed line in pairs", () => {
		expect(formatPhoneNo("+4791234567")).toBe("912 34 567");
		expect(formatPhoneNo("+4741234567")).toBe("412 34 567");
		expect(formatPhoneNo("+4722123456")).toBe("22 12 34 56");
		expect(formatPhoneNo("+4780012345")).toBe("800 12 345");
		expect(formatPhoneNo("+46812345678")).toBe("+46812345678");
	});

	it("normalizes postcodes to four digits", () => {
		expect(normalizeNoPostcode("0150")).toBe("0150");
		expect(normalizeNoPostcode(" 50 21 ")).toBe("5021");
		expect(normalizeNoPostcode("NO-5021")).toBe("5021");
		expect(normalizeNoPostcode("N-5021")).toBe("5021");
		expect(normalizeNoPostcode("150")).toBeNull();
		expect(normalizeNoPostcode("0000")).toBeNull();
		expect(normalizeNoPostcode(null)).toBeNull();
	});
});

describe("Norwegian keys", () => {
	it("key an establishment by its organisation number, check digit verified", () => {
		expect(isValidNoOrgNumber("925781584")).toBe(true);
		expect(isValidNoOrgNumber("983971636")).toBe(true);
		expect(isValidNoOrgNumber("925781585")).toBe(false);
		expect(isValidNoOrgNumber("725781584")).toBe(false);
		expect(isValidNoOrgNumber("92578158")).toBe(false);
		expect(isValidNoSourceId("NO-ORGNR", "925781584")).toBe(true);
		expect(isValidNoSourceId("NO-XX", "925781584")).toBe(false);
		expect(Object.keys(NO_ID_SCHEMES)).toEqual(["NO-ORGNR"]);
		expect(noUrlKey("NO-ORGNR", "925781584")).toBe("925781584");
		expect(noOrgNumber("925781584")).toBe("925 781 584");
	});

	it("write and read a page segment, ø written o", () => {
		expect(slugifyNo("Tromsø Bærum Ålesund Guovdageaidnu Unjárga Dielddanuorri")).toBe(
			"tromso-baerum-alesund-guovdageaidnu-unjarga-dielddanuorri",
		);
		expect(noFacilitySlug("Eksempel Legesenter Tønsberg", "NO-ORGNR", "925781584")).toBe(
			"eksempel-legesenter-tonsberg-925781584",
		);
		expect(parseNoFacilitySegment("eksempel-legesenter-tonsberg-925781584")).toEqual({
			idScheme: "NO-ORGNR",
			nationalId: "925781584",
			namePart: "eksempel-legesenter-tonsberg",
		});
		expect(parseNoKey("925 781 584")).toEqual({ idScheme: "NO-ORGNR", nationalId: "925781584" });
		expect(parseNoFacilitySegment("eksempel-925781585")).toBeNull();
		expect(parseNoFacilitySegment("Eksempel-925781584")).toBeNull();
		expect(parseNoFacilitySegment("eksempel-n925781584")).toBeNull();
		// An Austrian key never reads as a Norwegian number, nor the other way round.
		expect(parseAtPractitionerSegment("eksempel-925781584")).toBeNull();
	});
});
