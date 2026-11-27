import { describe, expect, it } from "vitest";
import { formatPhoneFr, toE164Fr } from "../normalize";
import { isValidRpps } from "../rpps";
import { FR_PROFESSIONS, isListingSlug, listingSlugFor } from "../taxonomy/fr";
import { timeZoneForDepartment } from "../time/departments";
import { COUNTRY_ADAPTERS, COUNTRY_CODES, countryAdapter, france } from "./index";

describe("country adapters", () => {
	it("serves France, Austria, the United Kingdom, Czechia, Spain, Italy, Germany and Switzerland and refuses markets that are not open", () => {
		expect(countryAdapter("FR")).toBe(france);
		expect(() => countryAdapter("XX")).toThrow(RangeError);
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
		]);
		expect(COUNTRY_CODES).toEqual(["FR", "AT", "DE", "GB", "ES", "IT", "CZ", "CH", "EE"]);
	});

	it("wraps the existing French rules without changing them", () => {
		const [rpps] = france.practitionerIds;
		expect(france.practitionerIds).toHaveLength(1);
		expect(rpps?.id).toBe("RPPS");
		expect(rpps?.isValid).toBe(isValidRpps);
		expect(rpps?.isValid("19999990013")).toBe(true);
		expect(rpps?.isValid("19999990014")).toBe(false);
		expect(france.timeZoneOf).toBe(timeZoneForDepartment);
		expect(france.timeZoneOf("974")).toBe("Indian/Reunion");
		expect(() => france.timeZoneOf("99")).toThrow(RangeError);
		expect(france.phone.toE164).toBe(toE164Fr);
		expect(france.phone.format).toBe(formatPhoneFr);
		expect(france.taxonomy.professions).toBe(FR_PROFESSIONS);
		expect(france.taxonomy.listingSlugFor).toBe(listingSlugFor);
		expect(france.taxonomy.isListingSlug).toBe(isListingSlug);
	});

	it("lists every time zone a French department can resolve to", () => {
		const codes = ["01", "2A", "75", "971", "972", "973", "974", "975", "976", "977", "978"];
		for (const code of codes) expect(france.timeZones).toContain(france.timeZoneOf(code));
		expect(france.timeZones).toContain(france.defaultTimeZone);
	});

	it("prints a French address in two lines", () => {
		expect(
			france.address.lines({ street: "1 rue de l’Exemple", postcode: "69001", city: "Lyon" }),
		).toEqual(["1 rue de l’Exemple", "69001 Lyon"]);
		expect(france.address.lines({ street: null, postcode: null, city: "Lyon" })).toEqual(["Lyon"]);
		expect(france.address.postcode.test("69001")).toBe(true);
		expect(france.address.postcode.test("6900")).toBe(false);
	});

	it("names the HDS regime and the pages the French market requires", () => {
		expect(france.healthDataHosting.regime).toBe("HDS");
		expect(france.legalPages.map((page) => page.pathname)).toEqual([
			"/mentions-legales",
			"/confidentialite",
			"/conditions",
			"/accessibilite",
		]);
		expect(france.defaultLocale).toBe("fr");
	});
});
