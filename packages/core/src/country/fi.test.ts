import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneFi, normalizeFiPostcode, toE164Fi } from "../phone-fi";
import {
	FI_ID_SCHEMES,
	fiFacilitySlug,
	fiPtvChannelId,
	fiPtvKey,
	isValidFiSourceId,
	parseAtPractitionerSegment,
	parseEeFacilitySegment,
	parseFiFacilitySegment,
	parseFiKey,
} from "../slugs";
import { isFiListingSlug } from "../taxonomy/fi";
import {
	adapterOfSegment,
	FI_COUNTIES,
	FI_PLACES_YEAR,
	FI_SCHEME_IDS,
	finland,
	HELSINKI_CODE,
} from "./index";

const KEY = "b18aa7f87eca4b97a8e8b438d2e29427";

describe("the Finnish adapter", () => {
	it("is a Finnish-language directory market without booking or e-identity claims", () => {
		expect(finland.code).toBe("FI");
		expect(finland.segment).toBe("fi");
		expect(finland.defaultLocale).toBe("fi");
		expect(finland.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("fi")).toBe(finland);
		expect(claimPolicyOf("FI").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification and names Kanta's act for booking", () => {
		expect(finland.healthDataHosting.regime).not.toBe("HDS");
		expect(finland.healthDataHosting.basis).toMatch(/^No hosting certification/);
		expect(finland.healthDataHosting.basis).toMatch(/784\/2021/);
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(finland.timeZones).toEqual(["Europe/Helsinki"]);
		for (const code of ["06", "90", "837", HELSINKI_CODE]) {
			expect(finland.timeZoneOf(code)).toBe("Europe/Helsinki");
		}
		for (const code of ["6", "0837", "FI1", ""]) {
			expect(() => finland.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the 21 wellbeing services counties, Helsinki and Åland", () => {
		expect(Object.keys(FI_COUNTIES)).toHaveLength(23);
		expect(FI_COUNTIES["08"]).toBe("Pirkanmaan hyvinvointialue");
		expect(FI_COUNTIES["90"]).toBe("Helsinki");
		expect(FI_COUNTIES["91"]).toBe("Ahvenanmaa");
	});

	it("names the catalogue under CC0 and Statistics Finland's places under CC BY 4.0", () => {
		for (const registry of finland.registries) {
			expect(registry.licence).toBeTruthy();
			expect(registry.licenceUrl).toMatch(/^https:\/\//);
			expect(registry.attribution).toBeTruthy();
		}
		const ptv = finland.registries.find((r) => r.id === "fi-ptv");
		expect(ptv?.licence).toMatch(/\(CC0 1\.0\)$/);
		expect(ptv?.attribution).toBe(
			"Lähde: Suomi.fi-palvelutietovaranto, Digi- ja väestötietovirasto (CC0 1.0)",
		);
		const places = finland.registries.find((r) => r.id === "fi-tilastokeskus");
		expect(places?.licence).toMatch(/\(CC BY 4\.0\)$/);
		expect(places?.attribution).toBe(
			`Lähde: Tilastokeskus, kuntapohjaiset tilastointialueet ${FI_PLACES_YEAR}`,
		);
		expect(finland.practitionerIds.map((id) => id.id)).toEqual(FI_SCHEME_IDS);
	});

	it("prints an address the Finnish way", () => {
		expect(
			finland.address.lines({ street: "Sairaalantie 3", postcode: "62100", city: "Lapua" }),
		).toEqual(["Sairaalantie 3", "62100 Lapua"]);
		expect(finland.address.lines({ street: null, postcode: null, city: "Inari" })).toEqual([
			"Inari",
		]);
		expect(finland.address.postcode.test("00100")).toBe(true);
		expect(finland.address.postcode.test("0010")).toBe(false);
	});

	it("lists locations under Finnish slugs", () => {
		expect(finland.taxonomy.listingSlugFor("FI_HEALTH_CENTRE", null)).toBe("terveysasemat");
		expect(isFiListingSlug("neuvolat")).toBe(true);
		expect(isFiListingSlug("toimipiste")).toBe(false);
	});
});

describe("Finnish phone numbers and postcodes", () => {
	it("reads the forms the catalogue publishes", () => {
		expect(toE164Fi("064384844")).toBe("+35864384844");
		expect(toE164Fi("09 310 5015")).toBe("+35893105015");
		expect(toE164Fi("+358 9 310 5015")).toBe("+35893105015");
		expect(toE164Fi("+358 (0)9 310 5015")).toBe("+35893105015");
		expect(toE164Fi("040 123 4567")).toBe("+358401234567");
		expect(toE164Fi("00358 40 1234567")).toBe("+358401234567");
		expect(toE164Fi("0295 000 000")).toBe("+358295000000");
		expect(toE164Fi("09 123 456, 09 654 321")).toBe("+3589123456");
		expect(toE164Fi("+46 8 123 456 78")).toBe("+46812345678");
		expect(toE164Fi("112")).toBeNull();
		expect(toE164Fi("1234567")).toBeNull();
		expect(toE164Fi("0012")).toBeNull();
		expect(toE164Fi("")).toBeNull();
		expect(toE164Fi(null)).toBeNull();
	});

	it("prints the trunk prefix and the code apart, then the subscriber's digits", () => {
		expect(formatPhoneFi("+35893105015")).toBe("09 310 5015");
		expect(formatPhoneFi("+35864384844")).toBe("06 438 4844");
		expect(formatPhoneFi("+358401234567")).toBe("040 123 4567");
		expect(formatPhoneFi("+358295000000")).toBe("0295 000 000");
		expect(formatPhoneFi("+358171234567")).toBe("017 123 4567");
		expect(formatPhoneFi("+3726109490")).toBe("+3726109490");
	});

	it("normalizes postcodes to five digits", () => {
		expect(normalizeFiPostcode("33100")).toBe("33100");
		expect(normalizeFiPostcode(" 00 100 ")).toBe("00100");
		expect(normalizeFiPostcode("FI-22100")).toBe("22100");
		expect(normalizeFiPostcode("3310")).toBeNull();
		expect(normalizeFiPostcode(null)).toBeNull();
	});
});

describe("Finnish keys", () => {
	it("key a location by the catalogue's channel id, without its dashes", () => {
		expect(Object.keys(FI_ID_SCHEMES)).toEqual(["FI-PTV"]);
		expect(fiPtvKey("B18AA7F8-7ECA-4B97-A8E8-B438D2E29427")).toBe(KEY);
		expect(fiPtvKey("not-a-uuid")).toBeNull();
		expect(fiPtvChannelId(KEY)).toBe("b18aa7f8-7eca-4b97-a8e8-b438d2e29427");
		expect(isValidFiSourceId("FI-PTV", KEY)).toBe(true);
		expect(isValidFiSourceId("FI-PTV", KEY.slice(1))).toBe(false);
		expect(isValidFiSourceId("FI-XX", KEY)).toBe(false);
	});

	it("write and read a page segment", () => {
		expect(fiFacilitySlug("Lapuan sosiaali- ja terveyskeskus", KEY)).toBe(
			`lapuan-sosiaali-ja-terveyskeskus-${KEY}`,
		);
		expect(fiFacilitySlug("Hämeenlinnan pääterveysasema", KEY)).toBe(
			`hameenlinnan-paaterveysasema-${KEY}`,
		);
		expect(parseFiFacilitySegment(`lapuan-terveyskeskus-${KEY}`)).toEqual({
			idScheme: "FI-PTV",
			nationalId: KEY,
			namePart: "lapuan-terveyskeskus",
		});
		expect(parseFiKey(KEY.toUpperCase())).toEqual({ idScheme: "FI-PTV", nationalId: KEY });
		expect(parseFiFacilitySegment(`terveyskeskus-${KEY.slice(2)}`)).toBeNull();
		expect(parseFiFacilitySegment(`Terveyskeskus-${KEY}`)).toBeNull();
		// No other market reads a Finnish key.
		expect(parseAtPractitionerSegment(`terveyskeskus-${KEY}`)).toBeNull();
		expect(parseEeFacilitySegment(`terveyskeskus-${KEY}`)).toBeNull();
	});
});
