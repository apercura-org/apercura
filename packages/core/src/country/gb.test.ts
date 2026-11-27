import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneGb, normalizeGbPostcode, toE164Gb } from "../phone-gb";
import {
	gbPracticeSlug,
	isValidGbSourceId,
	parseAtPractitionerSegment,
	parseGbKey,
	parseGbPracticeSegment,
	parsePractitionerSegment,
} from "../slugs";
import { gbProfessionOfListingSlug, isGbListingSlug } from "../taxonomy/gb";
import {
	adapterOfSegment,
	austria,
	COUNTRY_ADAPTERS,
	france,
	GB_REGIONS,
	gbNationOf,
	unitedKingdom,
} from "./index";

describe("the United Kingdom adapter", () => {
	it("is an English-language directory market without booking or e-identity claims", () => {
		expect(unitedKingdom.code).toBe("GB");
		expect(unitedKingdom.segment).toBe("gb");
		expect(unitedKingdom.defaultLocale).toBe("en");
		expect(unitedKingdom.features).toEqual({
			directory: true,
			booking: false,
			eIdentityClaim: false,
		});
		expect(adapterOfSegment("gb")).toBe(unitedKingdom);
		expect(adapterOfSegment("uk")).toBeUndefined();
		expect(claimPolicyOf("GB").methods).toEqual(["document"]);
	});

	it("has one time zone and refuses codes that are not ONS area codes", () => {
		expect(unitedKingdom.timeZones).toEqual(["Europe/London"]);
		for (const code of ["E12000007", "W92000004", "S92000003", "N92000002", "E09000007"]) {
			expect(unitedKingdom.timeZoneOf(code)).toBe("Europe/London");
		}
		expect(() => unitedKingdom.timeZoneOf("75")).toThrow(RangeError);
		expect(() => unitedKingdom.timeZoneOf("X12000001")).toThrow(RangeError);
	});

	it("groups England's nine regions and the three other nations", () => {
		expect(Object.keys(GB_REGIONS)).toHaveLength(12);
		expect(gbNationOf("E09000007")).toBe("E92000001");
		expect(gbNationOf("S12000033")).toBe("S92000003");
		expect(gbNationOf("N09000003")).toBe("N92000002");
		expect(gbNationOf("W06000015")).toBe("W92000004");
		expect(gbNationOf("X1")).toBeNull();
	});

	it("names every source under the Open Government Licence with its attribution", () => {
		for (const source of unitedKingdom.registries) {
			expect(source.licence).toBe("Open Government Licence v3.0");
			expect(source.licenceUrl).toBe(
				"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
			);
			expect(source.attribution).toBeTruthy();
		}
		expect(unitedKingdom.registries.map((source) => source.id)).toEqual([
			"gb-ods-gp",
			"gb-ods-dent",
			"gb-ods-pharm",
			"gb-phs-gp",
			"gb-phs-dent",
			"gb-phs-pharm",
			"gb-bso-gp",
			"gb-bso-dent",
			"gb-postcodes",
			"gb-towns",
			"gb-local-authorities",
			"gb-ni-towns",
		]);
	});

	it("identifies practices by the key of their list", () => {
		expect(unitedKingdom.practitionerIds.map((scheme) => scheme.id)).toEqual([
			"GB-ODS-GP",
			"GB-ODS-DENT",
			"GB-ODS-PHARM",
			"GB-PHS-GP",
			"GB-PHS-DENT",
			"GB-PHS-PHARM",
			"GB-BSO-GP",
			"GB-BSO-DENT",
		]);
		expect(isValidGbSourceId("GB-ODS-GP", "A81001")).toBe(true);
		expect(isValidGbSourceId("GB-ODS-GP", "W00045")).toBe(true);
		expect(isValidGbSourceId("GB-ODS-GP", "V00003")).toBe(false);
		expect(isValidGbSourceId("GB-ODS-DENT", "V00003")).toBe(true);
		expect(isValidGbSourceId("GB-ODS-DENT", "V012345")).toBe(true);
		expect(isValidGbSourceId("GB-ODS-PHARM", "FM474")).toBe(true);
		expect(isValidGbSourceId("GB-ODS-PHARM", "FA123")).toBe(true);
		expect(isValidGbSourceId("GB-PHS-GP", "10002")).toBe(true);
		expect(isValidGbSourceId("GB-BSO-DENT", "0a1b2c3d4e")).toBe(true);
		expect(isValidGbSourceId("GB-BSO-DENT", "0a1b2c")).toBe(false);
		expect(isValidGbSourceId("GB-XX", "1")).toBe(false);
	});

	it("prints an address street, town, postcode, and checks UK postcodes", () => {
		expect(
			unitedKingdom.address.lines({
				street: "1 Example Street",
				postcode: "TS18 1HU",
				city: "Stockton-on-Tees",
			}),
		).toEqual(["1 Example Street", "Stockton-on-Tees", "TS18 1HU"]);
		for (const postcode of ["SW1A 1AA", "M1 1AE", "BT4 1NS", "EC1A 1BB", "W1A 0AX"]) {
			expect(unitedKingdom.address.postcode.test(postcode)).toBe(true);
		}
		expect(unitedKingdom.address.postcode.test("69001")).toBe(false);
		expect(unitedKingdom.address.postcode.test("SW1A1AA")).toBe(false);
	});

	it("never shares a listing slug with France or Austria", () => {
		for (const code of Object.keys(unitedKingdom.taxonomy.professions)) {
			const slug = unitedKingdom.taxonomy.listingSlugFor(code, null);
			expect(slug).toBeTruthy();
			expect(france.taxonomy.isListingSlug(slug ?? "")).toBe(false);
			expect(austria.taxonomy.isListingSlug(slug ?? "")).toBe(false);
			expect(isGbListingSlug(slug ?? "")).toBe(true);
		}
		expect(isGbListingSlug("practice")).toBe(false);
		expect(isGbListingSlug("allgemeinmedizin")).toBe(false);
		expect(gbProfessionOfListingSlug("dental-practices")).toBe("GB_DENTAL");
		expect(Object.keys(COUNTRY_ADAPTERS)).toEqual([
			"FR",
			"AT",
			"GB",
			"CZ",
			"ES",
			"IT",
			"DE",
			"CH",
			"EE",
			"PL",
			"NO",
		]);
	});
});

describe("UK phone numbers", () => {
	it("normalizes published numbers to E.164", () => {
		expect(toE164Gb("01642 672351")).toBe("+441642672351");
		expect(toE164Gb("+44 (0)20 7946 0000")).toBe("+442079460000");
		expect(toE164Gb("0044 113 496 0000")).toBe("+441134960000");
		expect(toE164Gb("07966 769281")).toBe("+447966769281");
		expect(toE164Gb("0141 336 8114")).toBe("+441413368114");
		expect(toE164Gb("028 90603440")).toBe("+442890603440");
		expect(toE164Gb("+33 4 72 00 00 00")).toBe("+33472000000");
		expect(toE164Gb("672351")).toBeNull();
		expect(toE164Gb("00000 000000")).toBeNull();
		expect(toE164Gb("")).toBeNull();
		expect(toE164Gb(null)).toBeNull();
	});

	it("prints numbers grouped the UK way", () => {
		expect(formatPhoneGb("+442079460000")).toBe("020 7946 0000");
		expect(formatPhoneGb("+442890603440")).toBe("028 9060 3440");
		expect(formatPhoneGb("+441134960000")).toBe("0113 496 0000");
		expect(formatPhoneGb("+441413368114")).toBe("0141 336 8114");
		expect(formatPhoneGb("+441642672351")).toBe("01642 672351");
		expect(formatPhoneGb("+441381600000")).toBe("01381 600000");
		expect(formatPhoneGb("+447966769281")).toBe("07966 769281");
		expect(formatPhoneGb("+443001234567")).toBe("0300 123 4567");
		expect(formatPhoneGb("+33472000000")).toBe("+33472000000");
	});
});

describe("UK postcodes", () => {
	it("reads published postcodes in the standard form", () => {
		expect(normalizeGbPostcode("ab101qn")).toBe("AB10 1QN");
		expect(normalizeGbPostcode("TS18  1HU")).toBe("TS18 1HU");
		expect(normalizeGbPostcode("SW1A1AA")).toBe("SW1A 1AA");
		expect(normalizeGbPostcode("M1 1AE")).toBe("M1 1AE");
		expect(normalizeGbPostcode("BT4 1NS")).toBe("BT4 1NS");
		expect(normalizeGbPostcode("1234")).toBeNull();
		expect(normalizeGbPostcode("NOTAPOSTCODE")).toBeNull();
		expect(normalizeGbPostcode(null)).toBeNull();
	});
});

describe("UK practice slugs", () => {
	it("end with the key of the practice's list", () => {
		expect(gbPracticeSlug("The Densham Surgery", "GB-ODS-GP", "A81001")).toBe(
			"the-densham-surgery-a81001",
		);
		expect(gbPracticeSlug("Muirhead Medical Centre", "GB-PHS-GP", "10002")).toBe(
			"muirhead-medical-centre-sg10002",
		);
		expect(gbPracticeSlug("", "GB-BSO-DENT", "0a1b2c3d4e")).toBe("nd0a1b2c3d4e");
	});

	it("parse back to the scheme and identifier, and nothing else", () => {
		expect(parseGbPracticeSegment("the-densham-surgery-a81001")).toEqual({
			idScheme: "GB-ODS-GP",
			nationalId: "A81001",
			namePart: "the-densham-surgery",
		});
		expect(parseGbPracticeSegment("dental-surgery-v012345")?.idScheme).toBe("GB-ODS-DENT");
		expect(parseGbPracticeSegment("st-margarets-pharmacy-fm474")?.idScheme).toBe("GB-ODS-PHARM");
		expect(parseGbPracticeSegment("a-practice-sg10002")).toEqual({
			idScheme: "GB-PHS-GP",
			nationalId: "10002",
			namePart: "a-practice",
		});
		expect(parseGbPracticeSegment("sd2")?.idScheme).toBe("GB-PHS-DENT");
		expect(parseGbPracticeSegment("x-sp1030")?.idScheme).toBe("GB-PHS-PHARM");
		expect(parseGbPracticeSegment("x-ng1")?.idScheme).toBe("GB-BSO-GP");
		expect(parseGbPracticeSegment("x-nd0a1b2c3d4e")?.nationalId).toBe("0a1b2c3d4e");
		expect(parseGbKey("A81001")?.nationalId).toBe("A81001");
		for (const invalid of ["", "x-v1", "x-a8100", "x-zz123", "X-A81001", "x--a81001", "nd12"]) {
			expect(parseGbPracticeSegment(invalid)).toBeNull();
		}
	});

	it("are never read as a French or Austrian page", () => {
		for (const segment of ["the-densham-surgery-a81001", "a-practice-sg10002", "x-ng1"]) {
			expect(parsePractitionerSegment(segment)).toBeNull();
			expect(parseAtPractitionerSegment(segment)).toBeNull();
		}
	});
});
