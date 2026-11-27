import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneLv, normalizeLvPostcode, toE164Lv } from "../phone-lv";
import {
	isValidLvSourceId,
	LV_ID_SCHEMES,
	lvFacilitySlug,
	parseDeFacilitySegment,
	parseLvFacilitySegment,
	parseLvKey,
} from "../slugs";
import { isLvListingSlug } from "../taxonomy/lv";
import {
	adapterOfSegment,
	LV_DEPARTMENT_REGIONS,
	LV_REGIONS,
	LV_SCHEME_IDS,
	LV_STATE_CITIES,
	latvia,
	lvRegionOf,
	RIGA_CODE,
} from "./index";

describe("the Latvian adapter", () => {
	it("is a Latvian-language directory market without booking or e-identity claims", () => {
		expect(latvia.code).toBe("LV");
		expect(latvia.segment).toBe("lv");
		expect(latvia.defaultLocale).toBe("lv");
		expect(latvia.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("lv")).toBe(latvia);
		expect(claimPolicyOf("LV").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(latvia.healthDataHosting.regime).not.toBe("HDS");
		expect(latvia.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("names its sources with their licence and credit", () => {
		const ids = latvia.registries.map((registry) => registry.id);
		expect(ids).toEqual(["lv-nvd-gp", "lv-vkcp", "lv-zva", "lv-var"]);
		for (const registry of latvia.registries) {
			expect(registry.attribution).toBeTruthy();
			expect(registry.licenceUrl).toMatch(/^https:\/\/creativecommons\.org\//);
		}
		const places = latvia.registries.find((registry) => registry.id === "lv-var");
		expect(places?.licence).toMatch(/CC BY 4\.0/);
		// VZD's terms: name the source, link the licence, say the data were changed.
		expect(places?.attribution).toMatch(
			/^Izmantoti Valsts adrešu reģistra informācijas sistēmas dati/,
		);
		expect(places?.attribution).toMatch(/apvienoti ar citiem avotiem/);
		for (const id of ["lv-nvd-gp", "lv-vkcp", "lv-zva"]) {
			expect(latvia.registries.find((registry) => registry.id === id)?.licence).toMatch(
				/^CC0 1\.0/,
			);
		}
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(latvia.timeZones).toEqual(["Europe/Riga"]);
		for (const code of ["LV00A", "LV005", RIGA_CODE, "0054000", "0054010", "0038001", "0038010"]) {
			expect(latvia.timeZoneOf(code)).toBe("Europe/Riga");
		}
		for (const code of ["LV001", "0099000", "54000", "LV", ""]) {
			expect(() => latvia.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("places every territory of the 2021 reform in one of the five statistical regions", () => {
		expect(Object.keys(LV_REGIONS).sort()).toEqual(["LV005", "LV009", "LV00A", "LV00B", "LV00C"]);
		expect(Object.keys(LV_DEPARTMENT_REGIONS)).toHaveLength(42);
		for (const region of Object.values(LV_DEPARTMENT_REGIONS))
			expect(LV_REGIONS[region]).toBeTruthy();
		expect(LV_STATE_CITIES).toHaveLength(7);
		for (const code of LV_STATE_CITIES) expect(LV_DEPARTMENT_REGIONS[code]).toBeTruthy();
		expect(lvRegionOf("0001000")).toBe("LV00A");
		expect(lvRegionOf("0054010")).toBe("LV00C");
		expect(lvRegionOf("0002000")).toBe("LV005");
		expect(lvRegionOf("9999999")).toBeNull();
	});

	it("prints an address the Latvian way, street first, postcode last", () => {
		expect(
			latvia.address.lines({ street: "Parauga iela 5", postcode: "LV-2150", city: "Sigulda" }),
		).toEqual(["Parauga iela 5", "Sigulda, LV-2150"]);
		expect(latvia.address.lines({ street: null, postcode: null, city: "Rīga" })).toEqual(["Rīga"]);
		expect(latvia.address.postcode.test("LV-1050")).toBe(true);
		expect(latvia.address.postcode.test("1050")).toBe(false);
	});

	it("lists only Latvian listing slugs", () => {
		expect(latvia.taxonomy.isListingSlug("aptiekas")).toBe(true);
		expect(latvia.taxonomy.isListingSlug("apotheken")).toBe(false);
		expect(isLvListingSlug("dati")).toBe(false);
	});
});

describe("Latvian phone numbers and postcodes", () => {
	it("normalises published numbers to E.164", () => {
		expect(toE164Lv("67123456")).toBe("+37167123456");
		expect(toE164Lv("+371 29 123 456")).toBe("+37129123456");
		expect(toE164Lv("00371 6712 3456")).toBe("+37167123456");
		expect(toE164Lv("371 80 001 234")).toBe("+37180001234");
		expect(toE164Lv("67123456, 29123456")).toBe("+37167123456");
		expect(toE164Lv("+370 5 2123456")).toBe("+37052123456");
		for (const raw of ["1234567", "47123456", "671234567", "", null, undefined]) {
			expect(toE164Lv(raw)).toBeNull();
		}
	});

	it("prints a number in groups of two, three and three digits", () => {
		expect(formatPhoneLv("+37167123456")).toBe("67 123 456");
		expect(formatPhoneLv("+37129123456")).toBe("29 123 456");
		expect(formatPhoneLv("+37052123456")).toBe("+37052123456");
	});

	it("writes a postcode with its LV- prefix", () => {
		expect(normalizeLvPostcode("LV-1050")).toBe("LV-1050");
		expect(normalizeLvPostcode("lv 4601")).toBe("LV-4601");
		expect(normalizeLvPostcode("3612")).toBe("LV-3612");
		expect(normalizeLvPostcode("LV-6000")).toBeNull();
		expect(normalizeLvPostcode("10500")).toBeNull();
		expect(normalizeLvPostcode(null)).toBeNull();
	});
});

describe("Latvian page keys", () => {
	it("names the list in the URL and keeps an institution code's leading zeros", () => {
		expect(lvFacilitySlug("Ilzes Paraugas ģimenes ārsta prakse", "LV-GP", "010000006")).toBe(
			"ilzes-paraugas-gimenes-arsta-prakse-g010000006",
		);
		expect(lvFacilitySlug("Paraugu slimnīca", "LV-SLIM", "8958")).toBe("paraugu-slimnica-s8958");
		expect(lvFacilitySlug("Ķekavas aptieka „Paraugs”", "LV-APT", "324")).toBe(
			"kekavas-aptieka-paraugs-a324",
		);
		expect(lvFacilitySlug("", "LV-APT", "324")).toBe("a324");
	});

	it("reads a key back, and refuses anything else", () => {
		expect(parseLvKey("g010000006")).toEqual({ idScheme: "LV-GP", nationalId: "010000006" });
		expect(parseLvKey("s8958")).toEqual({ idScheme: "LV-SLIM", nationalId: "8958" });
		expect(parseLvKey("a324")).toEqual({ idScheme: "LV-APT", nationalId: "324" });
		for (const token of ["g10000006", "a0324", "x324", "324", "s0", "g0100000061"]) {
			expect(parseLvKey(token)).toBeNull();
		}
		expect(parseLvFacilitySegment("paraugu-aptieka-a324")).toEqual({
			idScheme: "LV-APT",
			nationalId: "324",
			namePart: "paraugu-aptieka",
		});
		expect(parseLvFacilitySegment("Paraugu-aptieka-a324")).toBeNull();
		expect(parseLvFacilitySegment("paraugu-aptieka")).toBeNull();
		// A German key never reads as a Latvian one, nor the reverse.
		expect(parseDeFacilitySegment("paraugu-aptieka-a324")).toBeNull();
	});

	it("checks keys per scheme", () => {
		expect(LV_SCHEME_IDS).toEqual(Object.keys(LV_ID_SCHEMES));
		expect(isValidLvSourceId("LV-GP", "001000006")).toBe(true);
		expect(isValidLvSourceId("LV-GP", "1000006")).toBe(false);
		expect(isValidLvSourceId("LV-APT", "73438")).toBe(true);
		expect(isValidLvSourceId("LV-XX", "1")).toBe(false);
		for (const scheme of latvia.practitionerIds) expect(LV_SCHEME_IDS).toContain(scheme.id);
	});
});
