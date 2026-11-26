import { describe, expect, it } from "vitest";
import { formatPhoneAt, toE164At } from "../phone-at";
import { slugifyDe } from "../slugify";
import {
	atPractitionerSlug,
	isValidAtSourceId,
	parseAtPractitionerSegment,
	parsePractitionerSegment,
} from "../slugs";
import { adapterOfSegment, austria, COUNTRY_ADAPTERS, france } from "./index";

describe("the Austrian adapter", () => {
	it("is a German-language directory market without booking or e-identity claims", () => {
		expect(austria.code).toBe("AT");
		expect(austria.segment).toBe("at");
		expect(austria.defaultLocale).toBe("de");
		expect(austria.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("at")).toBe(austria);
		expect(adapterOfSegment("fr")).toBe(france);
		expect(adapterOfSegment("pl")).toBeUndefined();
	});

	it("has one time zone and refuses unknown state codes", () => {
		expect(austria.timeZones).toEqual(["Europe/Vienna"]);
		for (const code of ["1", "6", "9"]) expect(austria.timeZoneOf(code)).toBe("Europe/Vienna");
		expect(() => austria.timeZoneOf("10")).toThrow(RangeError);
		expect(() => austria.timeZoneOf("75")).toThrow(RangeError);
	});

	it("names every source with its CC BY 4.0 attribution, word for word", () => {
		expect(austria.registries.map((source) => [source.id, source.attribution])).toEqual([
			["at-wien", "Datenquelle: Stadt Wien – data.wien.gv.at"],
			["at-stmk", "Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at"],
			["at-sbg", "Datenquelle: Land Salzburg – data.salzburg.gv.at"],
			["at-sbg-zahn", "Datenquelle: Land Salzburg – data.salzburg.gv.at"],
			["at-places", "Datenquelle: Statistik Austria - data.statistik.gv.at"],
		]);
		for (const source of austria.registries) {
			expect(source.licence).toContain("CC BY 4.0");
			expect(source.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/deed.de");
		}
	});

	it("identifies doctors by the key of their regional list", () => {
		expect(austria.practitionerIds.map((scheme) => scheme.id)).toEqual([
			"AT-WIEN",
			"AT-STMK",
			"AT-SBG",
			"AT-SBGZ",
		]);
		expect(isValidAtSourceId("7983")).toBe(true);
		expect(isValidAtSourceId("0798")).toBe(false);
		expect(isValidAtSourceId("12345678901")).toBe(false);
		expect(isValidAtSourceId("")).toBe(false);
	});

	it("prints an Austrian address in two lines and checks 4-digit postcodes", () => {
		expect(
			austria.address.lines({ street: "Beispielgasse 1/2", postcode: "1090", city: "Wien" }),
		).toEqual(["Beispielgasse 1/2", "1090 Wien"]);
		expect(austria.address.postcode.test("8010")).toBe(true);
		expect(austria.address.postcode.test("69001")).toBe(false);
	});

	it("never shares a listing slug with France", () => {
		const slugsOf = (adapter: typeof austria) => {
			const slugs = new Set<string>();
			for (const code of Object.keys(adapter.taxonomy.professions)) {
				const slug = adapter.taxonomy.listingSlugFor(code, null);
				if (slug) slugs.add(slug);
			}
			return slugs;
		};
		expect(Object.keys(COUNTRY_ADAPTERS)).toContain("AT");
		for (const slug of slugsOf(austria)) expect(france.taxonomy.isListingSlug(slug)).toBe(false);
		expect(austria.taxonomy.isListingSlug("allgemeinmedizin")).toBe(true);
		expect(austria.taxonomy.isListingSlug("medecin-generaliste")).toBe(false);
		expect(france.taxonomy.isListingSlug("allgemeinmedizin")).toBe(false);
	});
});

describe("Austrian phone numbers", () => {
	it("normalizes published numbers to E.164", () => {
		expect(toE164At("01 7673315")).toBe("+4317673315");
		expect(toE164At("+43 1 7673315")).toBe("+4317673315");
		expect(toE164At("+43 (0)1 7673315")).toBe("+4317673315");
		expect(toE164At("0043 664 1234567")).toBe("+436641234567");
		expect(toE164At("0677 12345678")).toBe("+4367712345678");
		expect(toE164At("018904520")).toBe("+4318904520");
	});

	it("completes local numbers only with the source's area code", () => {
		expect(toE164At("9971732")).toBeNull();
		expect(toE164At("9971732", { localAreaCode: "1" })).toBe("+4319971732");
	});

	it("keeps foreign numbers and refuses implausible ones", () => {
		expect(toE164At("+49 30 1234567")).toBe("+49301234567");
		expect(toE164At("")).toBeNull();
		expect(toE164At(null)).toBeNull();
		expect(toE164At("0")).toBeNull();
		expect(toE164At("00 1")).toBeNull();
		expect(toE164At("+43 0 123")).toBeNull();
	});

	it("prints the national form with the area code apart", () => {
		expect(formatPhoneAt("+4317673315")).toBe("01 7673315");
		expect(formatPhoneAt("+436641458428")).toBe("0664 1458428");
		expect(formatPhoneAt("+43316123456")).toBe("0316 123456");
		expect(formatPhoneAt("+433842123456")).toBe("03842 123456");
		expect(formatPhoneAt("+43555512345")).toBe("0555512345");
		expect(formatPhoneAt("+33155347620")).toBe("+33155347620");
	});
});

describe("Austrian practitioner slugs", () => {
	it("spells umlauts out in slugs", () => {
		expect(slugifyDe("Jürgen Müller-Weiß")).toBe("juergen-mueller-weiss");
		expect(slugifyDe("Döbling")).toBe("doebling");
		expect(slugifyDe("Kärnten")).toBe("kaernten");
	});

	it("ends with the list letter and number, and parses back", () => {
		const slug = atPractitionerSlug("Jürgen", "Beispiel", "AT-WIEN", "7983");
		expect(slug).toBe("juergen-beispiel-w7983");
		expect(parseAtPractitionerSegment(slug)).toEqual({
			idScheme: "AT-WIEN",
			nationalId: "7983",
			namePart: "juergen-beispiel",
		});
		expect(atPractitionerSlug("Anna", "Muster", "AT-STMK", "45")).toBe("anna-muster-st45");
		expect(parseAtPractitionerSegment("st45")).toEqual({
			idScheme: "AT-STMK",
			nationalId: "45",
			namePart: "",
		});
	});

	it("refuses unknown lists, leading zeros and French slugs", () => {
		expect(parseAtPractitionerSegment("anna-muster-x45")).toBeNull();
		expect(parseAtPractitionerSegment("anna-muster-w045")).toBeNull();
		expect(parseAtPractitionerSegment("anna-muster-w")).toBeNull();
		expect(parseAtPractitionerSegment("jean-dupont-19999990013")).toBeNull();
		expect(parsePractitionerSegment("anna-muster-w7983")).toBeNull();
	});
});
