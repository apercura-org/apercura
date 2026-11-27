import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhonePl, normalizePlPostcode, toE164Pl } from "../phone-pl";
import { slugifyPl } from "../slugify";
import {
	isValidPlSourceId,
	PL_ID_SCHEME,
	parseCzFacilitySegment,
	parsePlFacilitySegment,
	plFacilitySlug,
} from "../slugs";
import { isPlListingSlug } from "../taxonomy/pl";
import { adapterOfSegment, PL_VOIVODESHIPS, poland } from "./index";

describe("the Polish adapter", () => {
	it("is a Polish-language directory market without booking or e-identity claims", () => {
		expect(poland.code).toBe("PL");
		expect(poland.segment).toBe("pl");
		expect(poland.defaultLocale).toBe("pl");
		expect(poland.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("pl")).toBe(poland);
		expect(claimPolicyOf("PL").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(poland.healthDataHosting.regime).not.toBe("HDS");
		expect(poland.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not TERYT codes", () => {
		expect(poland.timeZones).toEqual(["Europe/Warsaw"]);
		for (const code of ["12", "1261", "1261011", "0201022"]) {
			expect(poland.timeZoneOf(code)).toBe("Europe/Warsaw");
		}
		expect(() => poland.timeZoneOf("01")).toThrow(RangeError);
		expect(() => poland.timeZoneOf("CZ010")).toThrow(RangeError);
		expect(() => poland.timeZoneOf("12610")).toThrow(RangeError);
	});

	it("knows the sixteen voivodeships", () => {
		expect(Object.keys(PL_VOIVODESHIPS)).toHaveLength(16);
		expect(PL_VOIVODESHIPS["12"]).toBe("małopolskie");
		expect(PL_VOIVODESHIPS["14"]).toBe("mazowieckie");
	});

	it("names its sources under CC BY 4.0, RPWDL's with the times of production and obtaining", () => {
		expect(poland.registries.map((source) => source.id)).toEqual([
			"pl-rpwdl",
			"pl-teryt",
			"pl-prg",
		]);
		for (const source of poland.registries) {
			expect(source.licence).toContain("CC BY 4.0");
			expect(source.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/deed.pl");
			expect(source.attribution).toBeTruthy();
		}
		const [rpwdl] = poland.registries;
		expect(rpwdl?.attribution).toContain("Centrum e-Zdrowia");
		expect(rpwdl?.attribution).toContain("{produced}");
		expect(rpwdl?.attribution).toContain("{obtained}");
		expect(poland.registries[2]?.attribution).toMatch(
			/^Opracowano na podstawie materiałów państwowego zasobu geodezyjnego i kartograficznego/,
		);
	});

	it("keys an establishment by its RPWDL number, never the entity's tax number", () => {
		const [scheme] = poland.practitionerIds;
		expect(poland.practitionerIds).toHaveLength(1);
		expect(scheme?.id).toBe(PL_ID_SCHEME);
		expect(scheme?.isValid("290629")).toBe(true);
		expect(isValidPlSourceId("0290629")).toBe(false);
		expect(isValidPlSourceId("6911051353x")).toBe(false);
		expect(plFacilitySlug("Przychodnia Przykładowa „Łąka”", "900001")).toBe(
			"przychodnia-przykladowa-laka-900001",
		);
		expect(parsePlFacilitySegment("przychodnia-przykladowa-900001")).toEqual({
			idScheme: PL_ID_SCHEME,
			nationalId: "900001",
			namePart: "przychodnia-przykladowa",
		});
		expect(parsePlFacilitySegment("900001")?.nationalId).toBe("900001");
		expect(parsePlFacilitySegment("przychodnia-0900001")).toBeNull();
		expect(parsePlFacilitySegment("Przychodnia-900001")).toBeNull();
		// A Polish segment reads like a Czech one: the market of the page tells them apart.
		expect(parseCzFacilitySegment("przychodnia-przykladowa-900001")).not.toBeNull();
		expect(slugifyPl("Łódź, Białystok")).toBe("lodz-bialystok");
	});

	it("normalizes and prints Polish numbers", () => {
		expect(toE164Pl("+48 74 868 02 42")).toBe("+48748680242");
		expect(toE164Pl("0048748680242")).toBe("+48748680242");
		expect(toE164Pl("74/8680242")).toBe("+48748680242");
		expect(toE164Pl("071 338-00-78")).toBe("+48713380078");
		expect(toE164Pl("509-308-757")).toBe("+48509308757");
		expect(toE164Pl("74 86-81-513, 74 8680 242")).toBe("+48748681513");
		expect(toE164Pl("74/8681513 74/8680242")).toBe("+48748681513");
		expect(toE164Pl("12 345 67 89 wew. 123")).toBe("+48123456789");
		expect(toE164Pl("+420 326 357 125")).toBe("+420326357125");
		expect(toE164Pl("12345")).toBeNull();
		expect(toE164Pl("")).toBeNull();
		expect(toE164Pl(null)).toBeNull();
		expect(formatPhonePl("+48748680242")).toBe("74 868 02 42");
		expect(formatPhonePl("+48509308757")).toBe("509 308 757");
		expect(formatPhonePl("+48800100100")).toBe("800 100 100");
		expect(formatPhonePl("+420326357125")).toBe("+420326357125");
	});

	it("writes postcodes NN-NNN and addresses street first", () => {
		expect(normalizePlPostcode("59220")).toBe("59-220");
		expect(normalizePlPostcode("59-220")).toBe("59-220");
		expect(normalizePlPostcode("592")).toBeNull();
		expect(poland.address.postcode.test("00-950")).toBe(true);
		expect(poland.address.postcode.test("00950")).toBe(false);
		expect(
			poland.address.lines({ street: "Przykładowa 9/1", postcode: "59-220", city: "Legnica" }),
		).toEqual(["Przykładowa 9/1", "59-220 Legnica"]);
	});

	it("serves the four legal pages and Polish listing slugs only", () => {
		expect(poland.legalPages.map((page) => page.id)).toEqual([
			"legal-notice",
			"privacy",
			"terms",
			"accessibility",
		]);
		expect(poland.taxonomy.isListingSlug).toBe(isPlListingSlug);
		expect(poland.taxonomy.listingSlugFor("PL_HOSPITAL", null)).toBe("szpitale");
	});
});
