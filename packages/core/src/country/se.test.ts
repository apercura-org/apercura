import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneSe, normalizeSePostcode, toE164Se } from "../phone-se";
import {
	isValidGln,
	isValidSeLegalPersonNumber,
	isValidSeSourceId,
	parseIeFacilitySegment,
	parseNoFacilitySegment,
	parseSeFacilitySegment,
	parseSeKey,
	SE_ID_SCHEMES,
	seFacilitySlug,
	seUrlKey,
} from "../slugs";
import { isSeListingSlug } from "../taxonomy/se";
import {
	adapterOfSegment,
	GOTLAND_MUNICIPALITY,
	SE_COUNTIES,
	SE_SCHEME_IDS,
	SE_VGR_COUNTY,
	seCountyOfName,
	sweden,
} from "./index";

describe("the Swedish adapter", () => {
	it("is a Swedish-language directory market without booking or e-identity claims", () => {
		expect(sweden.code).toBe("SE");
		expect(sweden.segment).toBe("se");
		expect(sweden.defaultLocale).toBe("sv");
		expect(sweden.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("se")).toBe(sweden);
		expect(claimPolicyOf("SE").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(sweden.healthDataHosting.regime).not.toBe("HDS");
		expect(sweden.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(sweden.timeZones).toEqual(["Europe/Stockholm"]);
		for (const code of ["01", "0180", "14", "1480", "25", "2584", "0980"]) {
			expect(sweden.timeZoneOf(code)).toBe("Europe/Stockholm");
		}
		// 02, 11, 15 and 16 are counties merged long ago (Skåne, Västra Götaland).
		for (const code of ["02", "0280", "11", "15", "1601", "180", "SE", ""]) {
			expect(() => sweden.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the 21 counties, Gotland a municipality too", () => {
		expect(Object.keys(SE_COUNTIES)).toHaveLength(21);
		expect(SE_COUNTIES["01"]).toBe("Stockholms län");
		expect(SE_COUNTIES[SE_VGR_COUNTY]).toBe("Västra Götalands län");
		expect(GOTLAND_MUNICIPALITY.slice(0, 2)).toBe("09");
	});

	it("reads a county as the register writes it", () => {
		expect(seCountyOfName("Stockholm")).toBe("01");
		expect(seCountyOfName("Västra götaland")).toBe("14");
		expect(seCountyOfName("Västra Götalands län")).toBe("14");
		expect(seCountyOfName("Skåne")).toBe("12");
		expect(seCountyOfName("Dalarna")).toBe("20");
		expect(seCountyOfName("Örebro")).toBe("18");
		expect(seCountyOfName("Gävleborg")).toBe("21");
		expect(seCountyOfName("Lappland")).toBeNull();
		expect(seCountyOfName("")).toBeNull();
	});

	it("names every source with its licence and attribution, the pharmacies' under CC BY 4.0", () => {
		for (const registry of sweden.registries) {
			expect(registry.licence).toBeTruthy();
			expect(registry.licenceUrl).toMatch(/^https:\/\//);
			expect(registry.attribution).toBeTruthy();
		}
		const pharmacies = sweden.registries.find((r) => r.id === "se-apotek");
		expect(pharmacies?.publisher).toBe("Läkemedelsverket");
		expect(pharmacies?.licence).toMatch(/CC BY 4\.0/);
		// CC BY 4.0 § 3(a): the creator, the licence and that the data was changed.
		expect(pharmacies?.attribution).toBe(
			"Apotek med tillstånd: © Läkemedelsverket, CC BY 4.0; bearbetat av Apercura",
		);
		expect(sweden.registries.find((r) => r.id === "se-vgr-vardcentraler")?.licence).toMatch(
			/CC0 1\.0/,
		);
		expect(sweden.registries.find((r) => r.id === "se-scb-granser")?.attribution).toMatch(
			/Källa: SCB/,
		);
		expect(sweden.practitionerIds.map((id) => id.id)).toEqual(SE_SCHEME_IDS);
	});

	it("prints an address the Swedish way", () => {
		expect(
			sweden.address.lines({ street: "Exempelgatan 1", postcode: "111 22", city: "Stockholm" }),
		).toEqual(["Exempelgatan 1", "111 22 Stockholm"]);
		expect(sweden.address.lines({ street: null, postcode: null, city: "Gotland" })).toEqual([
			"Gotland",
		]);
		expect(sweden.address.postcode.test("111 22")).toBe(true);
		expect(sweden.address.postcode.test("11122")).toBe(false);
		expect(sweden.address.postcode.test("011 22")).toBe(false);
	});

	it("lists facilities under Swedish slugs", () => {
		expect(sweden.taxonomy.listingSlugFor("SE_PHARMACY", null)).toBe("apoteken");
		expect(sweden.taxonomy.listingSlugFor("SE_HEALTH_CENTRE", null)).toBe("vardcentraler");
		expect(isSeListingSlug("apoteken")).toBe(true);
		expect(isSeListingSlug("verksamhet")).toBe(false);
	});
});

describe("Swedish phone numbers and postcodes", () => {
	it("reads the usual written forms", () => {
		expect(toE164Se("08-123 456 78")).toBe("+46812345678");
		expect(toE164Se("+46 8 123 456 78")).toBe("+46812345678");
		expect(toE164Se("+46 (0)8 123 456 78")).toBe("+46812345678");
		expect(toE164Se("0046 70 123 45 67")).toBe("+46701234567");
		expect(toE164Se("070-123 45 67")).toBe("+46701234567");
		expect(toE164Se("031-12 34 56, 070-123 45 67")).toBe("+4631123456");
		expect(toE164Se("+47 22 12 34 56")).toBe("+4722123456");
		expect(toE164Se("112")).toBeNull();
		expect(toE164Se("1177")).toBeNull();
		expect(toE164Se("0812")).toBeNull();
		expect(toE164Se("")).toBeNull();
		expect(toE164Se(null)).toBeNull();
	});

	it("prints the area code, a dash and the subscriber number in groups", () => {
		expect(formatPhoneSe("+46812345678")).toBe("08-123 456 78");
		expect(formatPhoneSe("+4681234567")).toBe("08-123 45 67");
		expect(formatPhoneSe("+46701234567")).toBe("070-123 45 67");
		expect(formatPhoneSe("+4631123456")).toBe("031-12 34 56");
		expect(formatPhoneSe("+46480123456")).toBe("0480-12 34 56");
		expect(formatPhoneSe("+4722123456")).toBe("+4722123456");
	});

	it("normalizes postcodes to three and two digits", () => {
		expect(normalizeSePostcode("11122")).toBe("111 22");
		expect(normalizeSePostcode("111 22")).toBe("111 22");
		expect(normalizeSePostcode("SE-111 22")).toBe("111 22");
		expect(normalizeSePostcode("S-41345")).toBe("413 45");
		expect(normalizeSePostcode("011 22")).toBeNull();
		expect(normalizeSePostcode("1112")).toBeNull();
		expect(normalizeSePostcode("111 222")).toBeNull();
		expect(normalizeSePostcode(null)).toBeNull();
	});
});

describe("Swedish keys", () => {
	it("key a pharmacy by its GLN, check digit verified", () => {
		expect(isValidGln("7312446003969")).toBe(true);
		expect(isValidGln("7312446000272")).toBe(true);
		expect(isValidGln("7312446000271")).toBe(false);
		expect(isValidGln("731244600027")).toBe(false);
		expect(isValidSeSourceId("SE-GLN", "7312446003969")).toBe(true);
		expect(isValidSeSourceId("SE-HSA", "SE2321000131-E000000007600")).toBe(true);
		expect(isValidSeSourceId("SE-HSA", "se2321000131-e000000007600")).toBe(false);
		expect(isValidSeSourceId("SE-XX", "7312446003969")).toBe(false);
		expect(Object.keys(SE_ID_SCHEMES)).toEqual(["SE-GLN", "SE-HSA"]);
	});

	it("tells a company's organisation number from a person's identity number", () => {
		expect(isValidSeLegalPersonNumber("5567738249")).toBe(true);
		expect(isValidSeLegalPersonNumber("2321000131")).toBe(true);
		expect(isValidSeLegalPersonNumber("9697522747")).toBe(true);
		expect(isValidSeLegalPersonNumber("5567738248")).toBe(false);
		// A personal identity number (year, month, day, number): never a legal person.
		expect(isValidSeLegalPersonNumber("8112189876")).toBe(false);
		expect(isValidSeLegalPersonNumber("556773824")).toBe(false);
	});

	it("write and read a page segment", () => {
		expect(seUrlKey("SE-GLN", "7312446003969")).toBe("a7312446003969");
		expect(seUrlKey("SE-HSA", "SE2321000131-E000000007600")).toBe("v2321000131e000000007600");
		expect(seFacilitySlug("Exempelapoteket Åre Östersund", "SE-GLN", "7312446003969")).toBe(
			"exempelapoteket-are-ostersund-a7312446003969",
		);
		expect(parseSeFacilitySegment("exempelapoteket-are-a7312446003969")).toEqual({
			idScheme: "SE-GLN",
			nationalId: "7312446003969",
			namePart: "exempelapoteket-are",
		});
		expect(parseSeFacilitySegment("exempel-vardcentral-v2321000016162m")).toEqual({
			idScheme: "SE-HSA",
			nationalId: "SE2321000016-162M",
			namePart: "exempel-vardcentral",
		});
		expect(parseSeKey("SE2321000131-E000000007600")).toEqual({
			idScheme: "SE-HSA",
			nationalId: "SE2321000131-E000000007600",
		});
		expect(parseSeKey("7312446003969")).toEqual({
			idScheme: "SE-GLN",
			nationalId: "7312446003969",
		});
		expect(parseSeFacilitySegment("exempel-a7312446003968")).toBeNull();
		expect(parseSeFacilitySegment("Exempel-a7312446003969")).toBeNull();
		expect(parseSeFacilitySegment("exempel-7312446003969")).toBeNull();
		expect(parseSeFacilitySegment("exempel-v232100013")).toBeNull();
		// Another market's key never reads as a Swedish one, nor the other way round.
		expect(parseNoFacilitySegment("exempel-a7312446003969")).toBeNull();
		expect(parseIeFacilitySegment("exempel-a7312446003969")).toBeNull();
		expect(parseSeFacilitySegment("example-pharmacy-p10000612")).toBeNull();
	});
});
