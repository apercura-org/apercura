import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { findEircode, formatPhoneIe, normalizeEircode, toE164Ie } from "../phone-ie";
import {
	IE_ID_SCHEMES,
	ieFacilitySlug,
	ieUrlKey,
	isValidIeSourceId,
	parseChFacilitySegment,
	parseDeFacilitySegment,
	parseIeFacilitySegment,
	parseIeKey,
} from "../slugs";
import { isIeListingSlug } from "../taxonomy/ie";
import {
	adapterOfSegment,
	IE_COUNTIES,
	IE_HSE_ATLAS_DATE,
	IE_PROVINCES,
	ieCountyOfName,
	ireland,
} from "./index";

describe("the Irish adapter", () => {
	it("is an English directory market without booking or e-identity claims", () => {
		expect(ireland.code).toBe("IE");
		expect(ireland.segment).toBe("ie");
		expect(ireland.defaultLocale).toBe("en");
		expect(ireland.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("ie")).toBe(ireland);
		expect(claimPolicyOf("IE").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(ireland.healthDataHosting.regime).not.toBe("HDS");
		expect(ireland.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not provinces, counties or towns", () => {
		expect(ireland.timeZones).toEqual(["Europe/Dublin"]);
		for (const code of ["L", "U", "40000", "260000", "13200", "08175"]) {
			expect(ireland.timeZoneOf(code)).toBe("Europe/Dublin");
		}
		for (const code of ["XX", "l", "0", "1234", "270000", "IE", ""]) {
			expect(() => ireland.timeZoneOf(code), code).toThrow(RangeError);
		}
	});

	it("knows the 26 counties in their four provinces", () => {
		expect(Object.keys(IE_COUNTIES)).toHaveLength(26);
		expect(Object.keys(IE_PROVINCES)).toEqual(["L", "M", "C", "U"]);
		for (const county of Object.values(IE_COUNTIES))
			expect(IE_PROVINCES[county.province]).toBeTruthy();
		expect(IE_COUNTIES["260000"]).toEqual({
			name: "Dublin",
			irish: "Baile Átha Cliath",
			province: "L",
		});
		expect(Object.values(IE_COUNTIES).filter((county) => county.province === "U")).toHaveLength(3);
	});

	it("reads a county as the lists write it", () => {
		expect(ieCountyOfName("Co. Cork")).toBe("40000");
		expect(ieCountyOfName("Co.Cork")).toBe("40000");
		expect(ieCountyOfName("Cork")).toBe("40000");
		expect(ieCountyOfName("CORK")).toBe("40000");
		expect(ieCountyOfName("County Galway")).toBe("60000");
		expect(ieCountyOfName("Dublin 15")).toBe("260000");
		expect(ieCountyOfName("Dublin 6W")).toBe("260000");
		expect(ieCountyOfName("Galway City")).toBe("60000");
		expect(ieCountyOfName("Antrim")).toBeNull();
		expect(ieCountyOfName("")).toBeNull();
		expect(ieCountyOfName(null)).toBeNull();
	});

	it("names each source with the credit its publisher asks for, and how old the HSE's lists are", () => {
		const ids = ireland.registries.map((source) => source.id);
		expect(ids).toEqual([
			"ie-psi",
			"ie-hiqa",
			"ie-hse-hospitals",
			"ie-hse-health-centres",
			"ie-counties",
			"ie-towns",
			"ie-placenames",
		]);
		for (const source of ireland.registries) expect(source.attribution).toBeTruthy();
		const psi = ireland.registries[0];
		expect(psi?.attribution).toContain("© Pharmaceutical Society of Ireland");
		expect(ireland.registries[1]?.attribution).toContain("© HIQA");
		expect(ireland.registries[2]?.name).toContain("March 2020");
		expect(ireland.registries[2]?.licence).toContain("CC BY 4.0");
		expect(IE_HSE_ATLAS_DATE).toBe("2020-03");
	});

	it("writes Irish numbers in E.164 and prints them the Irish way", () => {
		expect(toE164Ie("071 967 0111")).toBe("+353719670111");
		expect(toE164Ie("01 846 2115")).toBe("+35318462115");
		expect(toE164Ie("+353 (0)1 846 2115")).toBe("+35318462115");
		expect(toE164Ie("00353 86 215 1054")).toBe("+353862151054");
		expect(toE164Ie("045 880 400")).toBe("+35345880400");
		expect(toE164Ie("071 967 0111 / 071 967 0112")).toBe("+353719670111");
		expect(toE164Ie("1800 123 456")).toBe("+3531800123456");
		expect(toE164Ie("+44 20 7946 0000")).toBe("+442079460000");
		expect(toE164Ie("053 915 782")).toBe("+35353915782");
		expect(toE164Ie("12345")).toBeNull();
		expect(toE164Ie("")).toBeNull();
		expect(toE164Ie(null)).toBeNull();
		expect(formatPhoneIe("+35318462115")).toBe("01 846 2115");
		expect(formatPhoneIe("+353719670111")).toBe("071 967 0111");
		expect(formatPhoneIe("+353862151054")).toBe("086 215 1054");
		expect(formatPhoneIe("+35345880400")).toBe("045 880 400");
		expect(formatPhoneIe("+35340467108")).toBe("0404 67108");
		expect(formatPhoneIe("+3531800123456")).toBe("1800 123 456");
		expect(formatPhoneIe("+442079460000")).toBe("+442079460000");
		expect(ireland.phone.callingCodes).toEqual(["353"]);
	});

	it("reads Eircodes without ever placing by them", () => {
		expect(normalizeEircode("d02x285")).toBe("D02 X285");
		expect(normalizeEircode("F52  AX24")).toBe("F52 AX24");
		expect(normalizeEircode("D6W1234")).toBe("D6W 1234");
		expect(normalizeEircode("H12T996")).toBe("H12 T996");
		expect(normalizeEircode("H12 T99")).toBeNull();
		expect(normalizeEircode("SW1A 1AA")).toBeNull();
		expect(normalizeEircode(null)).toBeNull();
		expect(findEircode("Old Hospital Road, Y35 HK84")).toBe("Y35 HK84");
		expect(findEircode("Main Street, Boyle")).toBeNull();
		expect(ireland.address.postcode.test("F52 AX24")).toBe(true);
		expect(
			ireland.address.lines({ street: "Main Street", postcode: "F52 AX24", city: "Boyle" }),
		).toEqual(["Main Street", "Boyle", "F52 AX24"]);
		expect(ireland.address.lines({ street: null, postcode: null, city: "Boyle" })).toEqual([
			"Boyle",
		]);
	});

	it("keys a page by its list's number, or a derived key, after the list's letter", () => {
		expect(Object.keys(IE_ID_SCHEMES)).toEqual(["IE-PSI", "IE-HIQA", "IE-HSE-HOSP", "IE-HSE-HC"]);
		expect(isValidIeSourceId("IE-PSI", "10000612")).toBe(true);
		expect(isValidIeSourceId("IE-PSI", "012")).toBe(false);
		expect(isValidIeSourceId("IE-HIQA", "738")).toBe(true);
		expect(isValidIeSourceId("IE-HSE-HOSP", "123456789")).toBe(true);
		expect(isValidIeSourceId("IE-HSE-HOSP", "12345")).toBe(false);
		expect(isValidIeSourceId("XX", "1")).toBe(false);
		expect(ieUrlKey("IE-PSI", "10000612")).toBe("p10000612");
		expect(ieFacilitySlug("Example Pharmacy", "IE-PSI", "10000612")).toBe(
			"example-pharmacy-p10000612",
		);
		expect(ieFacilitySlug("Teach Altranais Dún Laoghaire", "IE-HIQA", "738")).toBe(
			"teach-altranais-dun-laoghaire-n738",
		);
		expect(ieFacilitySlug("", "IE-HSE-HC", "123456789")).toBe("c123456789");
		expect(parseIeKey("N738")).toEqual({ idScheme: "IE-HIQA", nationalId: "738" });
		expect(parseIeKey("x738")).toBeNull();
		expect(parseIeFacilitySegment("example-pharmacy-p10000612")).toEqual({
			idScheme: "IE-PSI",
			nationalId: "10000612",
			namePart: "example-pharmacy",
		});
		expect(parseIeFacilitySegment("h123456789")).toEqual({
			idScheme: "IE-HSE-HOSP",
			nationalId: "123456789",
			namePart: "",
		});
		expect(parseIeFacilitySegment("example-hospital-h12")).toBeNull();
		expect(parseIeFacilitySegment("Example-p10000612")).toBeNull();
		// Another market's keys are not Irish ones.
		expect(parseDeFacilitySegment("example-p10000612")).toBeNull();
		expect(parseChFacilitySegment("example-n738")).toBeNull();
	});

	it("serves its listings and legal pages", () => {
		expect(ireland.taxonomy.isListingSlug).toBe(isIeListingSlug);
		expect(ireland.legalPages.map((page) => page.id)).toEqual([
			"legal-notice",
			"privacy",
			"terms",
			"accessibility",
		]);
		expect(ireland.legalPages[0]?.basis).toContain("S.I. No. 68 of 2003");
		expect(ireland.legalPages[1]?.basis).toContain("Data Protection Act 2018");
	});
});
