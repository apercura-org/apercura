import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneMt, normalizeMtPostcode, toE164Mt } from "../phone-mt";
import { slugify } from "../slugify";
import {
	isValidMtSourceId,
	MT_ID_SCHEMES,
	mtFacilitySlug,
	mtLicenceKey,
	mtLicenceNumber,
	mtUrlKey,
	parseIeFacilitySegment,
	parseMtFacilitySegment,
	parseMtKey,
} from "../slugs";
import { allGbListingSlugs } from "../taxonomy/gb";
import { allIeListingSlugs } from "../taxonomy/ie";
import {
	allMtListingSlugs,
	isMtListingSlug,
	MT_PHARMACY,
	MT_RESERVED_SEGMENTS,
	mtListingSlugFor,
	mtProfessionOfListingSlug,
} from "../taxonomy/mt";
import {
	adapterOfSegment,
	MT_DISTRICTS,
	MT_LOCALITIES,
	MT_REGIONS,
	malta,
	mtDistrictOf,
	mtLocalityOfName,
	mtRegionOf,
} from "./index";

describe("the Maltese adapter", () => {
	it("is an English directory market without booking or e-identity claims", () => {
		expect(malta.code).toBe("MT");
		expect(malta.segment).toBe("mt");
		expect(malta.defaultLocale).toBe("en");
		expect(malta.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("mt")).toBe(malta);
		expect(claimPolicyOf("MT").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification and names the IDPC", () => {
		expect(malta.healthDataHosting.regime).not.toBe("HDS");
		expect(malta.healthDataHosting.basis).toMatch(/^No hosting certification/);
		expect(malta.legalPages.find((page) => page.id === "privacy")?.basis).toMatch(
			/Cap\. 586.*Information and Data Protection Commissioner/,
		);
		expect(malta.legalPages.find((page) => page.id === "legal-notice")?.basis).toMatch(
			/Cap\. 426\), article 8C/,
		);
	});

	it("credits the Medicines Authority and the places' publishers under CC BY 4.0", () => {
		expect(malta.registries.map((registry) => registry.id)).toEqual([
			"mt-pharmacies",
			"mt-local-councils",
			"mt-localities",
		]);
		for (const registry of malta.registries) {
			expect(registry.licence, registry.id).toMatch(/CC BY 4\.0/);
			expect(registry.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
			expect(registry.attribution, registry.id).toMatch(/^Source: .*CC BY 4\.0/);
		}
		expect(malta.registries[0]?.attribution).toContain("Medicines Authority");
	});

	it("has one time zone and refuses codes that are not regions, districts or localities", () => {
		expect(malta.timeZones).toEqual(["Europe/Malta"]);
		for (const code of ["01", "02", "011", "026", "01101", "02666"]) {
			expect(malta.timeZoneOf(code)).toBe("Europe/Malta");
		}
		for (const code of ["03", "016", "01102", "MT01101", "MT", ""]) {
			expect(() => malta.timeZoneOf(code), code).toThrow(RangeError);
		}
	});

	it("knows the 68 localities in the six districts of the two regions", () => {
		expect(Object.keys(MT_LOCALITIES)).toHaveLength(68);
		expect(Object.keys(MT_DISTRICTS)).toHaveLength(6);
		expect(Object.keys(MT_REGIONS)).toEqual(["01", "02"]);
		for (const code of Object.keys(MT_LOCALITIES)) {
			expect(code, code).toMatch(/^\d{5}$/);
			expect(MT_DISTRICTS[mtDistrictOf(code)], code).toBeTruthy();
			expect(MT_REGIONS[mtRegionOf(code)], code).toBeTruthy();
		}
		for (const code of Object.keys(MT_DISTRICTS)) expect(MT_REGIONS[mtRegionOf(code)]).toBeTruthy();
		expect(MT_LOCALITIES["01101"]?.name).toBe("Valletta");
		expect(MT_LOCALITIES["02611"]).toMatchObject({
			name: "Rabat (Gozo)",
			maltese: "Ir-Rabat (Għawdex)",
		});
		// Every locality's slug is its own.
		const slugs = Object.values(MT_LOCALITIES).map((locality) => slugify(locality.name));
		expect(new Set(slugs).size).toBe(68);
		expect(slugify("Mellieħa")).toBe("mellieha");
		expect(slugify("Ħamrun")).toBe("hamrun");
	});

	it("reads a locality as the register writes it", () => {
		const cases: [string, string | null][] = [
			["Il-Belt Valletta", "01101"],
			["Ħal Luqa", "01133"],
			["Ħ'Attard", "01412"],
			["L-Imsida", "01241"],
			["L-Imsida (Tal-Pietà)", "01247"],
			["Tas-Sliema", "01259"],
			["Ir-Rabat, Għawdex", "02611"],
			["Ir-Rabat, Malta", "01450"],
			["Żebbuġ, Għawdex", "02666"],
			["L-Għarb Għawdex", "02623"],
			["L-Imġarr, Malta", "01538"],
			["St. Paul’s Bay", "01555"],
			["Buġibba", "01555"],
			["Pembroke, St. Andrews", "01246"],
			["St. Andrews (Swieqi)", "01260"],
			["Bulebel, Iż-Żejtun", "01310"],
			["Smart City, Kalkara", "01129"],
			["Raħal Ġdid", "01145"],
			["G'Mangia", "01247"],
			["Il-Furjana", "01118"],
			["St. Venera", "01258"],
			["l-Iklin", "01428"],
			["Rabat", null],
			["Atlantis", null],
			["", null],
		];
		for (const [raw, code] of cases) expect(mtLocalityOfName(raw), raw).toBe(code);
	});

	it("keys a pharmacy by its licence number", () => {
		expect(Object.keys(MT_ID_SCHEMES)).toEqual(["MT-MA"]);
		expect(mtLicenceKey("DL 001")).toBe("001");
		expect(mtLicenceKey("dl256")).toBe("256");
		expect(mtLicenceKey("DL 1234")).toBe("1234");
		for (const raw of ["001", "DL", "DL 12", "PL 001", null]) expect(mtLicenceKey(raw)).toBeNull();
		expect(mtLicenceNumber("001")).toBe("DL 001");
		expect(isValidMtSourceId("MT-MA", "001")).toBe(true);
		expect(isValidMtSourceId("MT-MA", "1")).toBe(false);
		expect(isValidMtSourceId("IE-PSI", "001")).toBe(false);
		expect(mtUrlKey("001")).toBe("dl001");
		expect(mtFacilitySlug("Example Għajnsielem Pharmacy", "001")).toBe(
			"example-ghajnsielem-pharmacy-dl001",
		);
		expect(mtFacilitySlug("", "001")).toBe("dl001");
		expect(parseMtKey("DL256")).toEqual({ idScheme: "MT-MA", nationalId: "256" });
		expect(parseMtKey("dl12")).toBeNull();
		expect(parseMtFacilitySegment("example-pharmacy-dl001")).toEqual({
			idScheme: "MT-MA",
			nationalId: "001",
			namePart: "example-pharmacy",
		});
		expect(parseMtFacilitySegment("example-pharmacy-p1234")).toBeNull();
		// An Irish key is never read as a Maltese one, nor the other way round.
		expect(parseIeFacilitySegment("example-pharmacy-dl001")).toBeNull();
	});

	it("normalizes and prints Maltese phone numbers", () => {
		expect(toE164Mt("21652226")).toBe("+35621652226");
		expect(toE164Mt("2123 4567")).toBe("+35621234567");
		expect(toE164Mt("+356 7955 5536")).toBe("+35679555536");
		expect(toE164Mt("00356 99123456")).toBe("+35699123456");
		expect(toE164Mt("21682251 / 79555536")).toBe("+35621682251");
		expect(toE164Mt("21419070/1/2")).toBe("+35621419070");
		expect(toE164Mt("21571649// 27571649/ 77571649")).toBe("+35621571649");
		for (const raw of ["2165222", "216522260", "11234567", "", null]) {
			expect(toE164Mt(raw), String(raw)).toBeNull();
		}
		expect(toE164Mt("+44 20 7946 0000")).toBe("+442079460000");
		expect(formatPhoneMt("+35621652226")).toBe("2165 2226");
		expect(formatPhoneMt("+35679555536")).toBe("7955 5536");
		expect(formatPhoneMt("+442079460000")).toBe("+442079460000");
		expect(malta.phone.callingCodes).toEqual(["356"]);
	});

	it("normalizes postcodes and writes an address the Maltese way", () => {
		expect(normalizeMtPostcode("BBG 2412")).toBe("BBG 2412");
		expect(normalizeMtPostcode("bbg2412")).toBe("BBG 2412");
		expect(normalizeMtPostcode("ŻRQ 1012")).toBe("ZRQ 1012");
		expect(normalizeMtPostcode("AĠA 1234")).toBe("AGA 1234");
		for (const raw of ["123", "BB 2412", "BBGG 2412", "", null]) {
			expect(normalizeMtPostcode(raw), String(raw)).toBeNull();
		}
		expect(
			malta.address.lines({ street: "Triq il-Gurgier", postcode: "BBG 2412", city: "Birżebbuġa" }),
		).toEqual(["Triq il-Gurgier", "Birżebbuġa BBG 2412"]);
	});
});

describe("the Maltese taxonomy", () => {
	it("lists community pharmacies under a slug no other English market uses", () => {
		expect(allMtListingSlugs()).toEqual(new Set(["community-pharmacies"]));
		expect(mtListingSlugFor(MT_PHARMACY)).toBe("community-pharmacies");
		expect(mtListingSlugFor("IE_PHARMACY")).toBeNull();
		expect(mtProfessionOfListingSlug("community-pharmacies")).toBe(MT_PHARMACY);
		expect(isMtListingSlug("community-pharmacies")).toBe(true);
		for (const slug of MT_RESERVED_SEGMENTS) expect(isMtListingSlug(slug)).toBe(false);
		for (const slug of allMtListingSlugs()) {
			expect(allGbListingSlugs().has(slug), slug).toBe(false);
			expect(allIeListingSlugs().has(slug), slug).toBe(false);
		}
	});
});
