import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneDe, normalizeDePostcode, toE164De } from "../phone-de";
import {
	DE_ID_SCHEMES,
	deFacilitySlug,
	isValidDeSourceId,
	parseDeFacilitySegment,
	parseDeKey,
	parseEsCentreSegment,
} from "../slugs";
import { isDeListingSlug } from "../taxonomy/de";
import { adapterOfSegment, DE_PHARMACY_STATES, DE_SCHEME_IDS, DE_STATES, germany } from "./index";

describe("the German adapter", () => {
	it("is a German-language directory market without booking or e-identity claims", () => {
		expect(germany.code).toBe("DE");
		expect(germany.segment).toBe("de");
		expect(germany.defaultLocale).toBe("de");
		expect(germany.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("de")).toBe(germany);
		expect(claimPolicyOf("DE").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(germany.healthDataHosting.regime).not.toBe("HDS");
		expect(germany.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses unknown region codes", () => {
		expect(germany.timeZones).toEqual(["Europe/Berlin"]);
		for (const code of ["01", "09", "16", "09162", "11000000", "09162000"]) {
			expect(germany.timeZoneOf(code)).toBe("Europe/Berlin");
		}
		for (const code of ["00", "17", "9", "091620", "AT1", ""]) {
			expect(() => germany.timeZoneOf(code)).toThrow(RangeError);
		}
	});

	it("knows the sixteen Länder and the ones whose pharmacies are open data", () => {
		expect(Object.keys(DE_STATES)).toHaveLength(16);
		expect(DE_STATES["09"]).toBe("Bayern");
		for (const state of DE_PHARMACY_STATES) expect(DE_STATES[state]).toBeTruthy();
	});

	it("names every source with its licence and attribution", () => {
		for (const registry of germany.registries) {
			expect(registry.licence).toBeTruthy();
			expect(registry.attribution).toBeTruthy();
		}
		expect(germany.registries.find((r) => r.id === "de-destatis-khv")?.attribution).toMatch(
			/^© Statistisches Bundesamt \(Destatis\), \d{4}$/,
		);
		expect(germany.practitionerIds.map((id) => id.id)).toEqual(DE_SCHEME_IDS);
	});

	it("prints an address the German way", () => {
		expect(
			germany.address.lines({ street: "Musterstraße 1", postcode: "24939", city: "Flensburg" }),
		).toEqual(["Musterstraße 1", "24939 Flensburg"]);
		expect(germany.address.lines({ street: null, postcode: null, city: "Flensburg" })).toEqual([
			"Flensburg",
		]);
	});
});

describe("German phone numbers", () => {
	it("reads the published forms into E.164", () => {
		expect(toE164De("0461 812-0")).toBe("+494618120");
		expect(toE164De("040 1818-850")).toBe("+49401818850");
		expect(toE164De("(0351) 458-0")).toBe("+493514580");
		expect(toE164De("0461 / 812-0")).toBe("+494618120");
		expect(toE164De("+49 (0)30 4505-0")).toBe("+493045050");
		expect(toE164De("0049 89 12345")).toBe("+498912345");
		expect(toE164De("0461 812-0, 0461 812-1")).toBe("+494618120");
		expect(toE164De("+43 1 7673315")).toBe("+4317673315");
		for (const value of ["812-0", "0", "00", "", null, undefined, "0461 1"]) {
			expect(toE164De(value)).toBeNull();
		}
	});

	it("prints the area code apart when it can be told", () => {
		expect(formatPhoneDe("+493045050")).toBe("030 45050");
		expect(formatPhoneDe("+498912345")).toBe("089 12345");
		expect(formatPhoneDe("+494618120")).toBe("0461 8120");
		expect(formatPhoneDe("+492215550")).toBe("0221 5550");
		expect(formatPhoneDe("+492281234")).toBe("0228 1234");
		expect(formatPhoneDe("+4935145800")).toBe("0351 45800");
		expect(formatPhoneDe("+49467140800")).toBe("04671 40800");
		expect(formatPhoneDe("+4915112345678")).toBe("01511 2345678");
		expect(formatPhoneDe("+491701234567")).toBe("0170 1234567");
		expect(formatPhoneDe("+49800123456")).toBe("0800 123456");
		// Four or five digits in the 03 zone: no guessed space.
		expect(formatPhoneDe("+4933203123")).toBe("033203123");
		expect(formatPhoneDe("+4317673315")).toBe("+4317673315");
	});

	it("reads postcodes", () => {
		expect(normalizeDePostcode("24939")).toBe("24939");
		expect(normalizeDePostcode(" 1067 ")).toBe("01067");
		expect(normalizeDePostcode("D-01067")).toBe("01067");
		for (const value of ["00123", "1234567", "ABCDE", "", null]) {
			expect(normalizeDePostcode(value)).toBeNull();
		}
	});
});

describe("German facility keys", () => {
	it("checks every scheme's syntax", () => {
		expect(isValidDeSourceId("DE-KHV", "0a1b2c3d4e")).toBe(true);
		expect(isValidDeSourceId("DE-KHV", "0a1b2c3d4")).toBe(false);
		expect(isValidDeSourceId("DE-KHV", "0A1B2C3D4E")).toBe(false);
		expect(isValidDeSourceId("DE-APO-TH", "420")).toBe(true);
		expect(isValidDeSourceId("DE-APO-TH", "0420")).toBe(false);
		expect(isValidDeSourceId("DE-XX", "420")).toBe(false);
		expect(Object.keys(DE_ID_SCHEMES)).toEqual(DE_SCHEME_IDS);
	});

	it("builds and reads a page segment that names its source", () => {
		const slug = deFacilitySlug("Klinikum Süd – Mütterzentrum", "DE-KHV", "0a1b2c3d4e");
		expect(slug).toBe("klinikum-sued-muetterzentrum-k0a1b2c3d4e");
		expect(parseDeFacilitySegment(slug)).toEqual({
			idScheme: "DE-KHV",
			nationalId: "0a1b2c3d4e",
			namePart: "klinikum-sued-muetterzentrum",
		});
		expect(deFacilitySlug("Rosen-Apotheke am Markt", "DE-APO-TH", "420")).toBe(
			"rosen-apotheke-am-markt-th420",
		);
		expect(parseDeFacilitySegment("rosen-apotheke-am-markt-th420")?.idScheme).toBe("DE-APO-TH");
		expect(parseDeFacilitySegment("reha-r00ff00ff00")?.idScheme).toBe("DE-RHV");
		expect(parseDeFacilitySegment("bb0123456789")).toEqual({
			idScheme: "DE-APO-BB",
			nationalId: "0123456789",
			namePart: "",
		});
		expect(deFacilitySlug("", "DE-APO-BB", "00ff00ff00")).toBe("bb00ff00ff00");
		expect(parseDeKey("x0a1b2c3d4e")).toBeNull();
		for (const segment of [
			"klinikum-k0a1b2c3d4",
			"Klinikum-k0a1b2c3d4e",
			"th0",
			"klinik--th1",
			"",
		]) {
			expect(parseDeFacilitySegment(segment)).toBeNull();
		}
		// A Spanish centre code is never a German key, nor the reverse.
		expect(parseEsCentreSegment("klinikum-k0a1b2c3d4e")).toBeNull();
		expect(isDeListingSlug("krankenhaeuser")).toBe(true);
	});
});
