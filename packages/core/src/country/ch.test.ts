import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneCh, normalizeChPostcode, toE164Ch } from "../phone-ch";
import {
	CH_ID_SCHEMES,
	chFacilitySlug,
	chUrlKey,
	isValidChSourceId,
	parseChFacilitySegment,
	parseChKey,
	parseItPlaceSegment,
	parsePractitionerSegment,
} from "../slugs";
import { isChListingSlug } from "../taxonomy/ch";
import {
	adapterOfSegment,
	austria,
	CH_CANTONS,
	chCantonOfNumber,
	czechia,
	france,
	germany,
	italy,
	spain,
	switzerland,
	unitedKingdom,
} from "./index";

describe("the Swiss adapter", () => {
	it("is a trilingual directory market without booking or e-identity claims", () => {
		expect(switzerland.code).toBe("CH");
		expect(switzerland.segment).toBe("ch");
		expect(switzerland.defaultLocale).toBe("de");
		expect(switzerland.features).toEqual({
			directory: true,
			booking: false,
			eIdentityClaim: false,
		});
		expect(adapterOfSegment("ch")).toBe(switzerland);
		expect(claimPolicyOf("CH").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(switzerland.healthDataHosting.regime).not.toBe("HDS");
		expect(switzerland.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not cantons, districts or communes", () => {
		expect(switzerland.timeZones).toEqual(["Europe/Zurich"]);
		for (const code of ["ZH", "GE", "TI", "JU", "101", "261", "6621", "2500"]) {
			expect(switzerland.timeZoneOf(code)).toBe("Europe/Zurich");
		}
		for (const code of ["XX", "zh", "0", "12345", "CH", "", "LI"]) {
			expect(() => switzerland.timeZoneOf(code), code).toThrow(RangeError);
		}
	});

	it("knows the 26 cantons by abbreviation and BFS number", () => {
		expect(Object.keys(CH_CANTONS)).toHaveLength(26);
		expect(CH_CANTONS.ZH).toEqual({ number: 1, name: "Zürich" });
		expect(CH_CANTONS.GE?.number).toBe(25);
		expect(chCantonOfNumber(26)).toBe("JU");
		expect(chCantonOfNumber("12")).toBe("BS");
		expect(chCantonOfNumber(27)).toBeNull();
		const numbers = Object.values(CH_CANTONS).map((canton) => canton.number);
		expect(numbers).toEqual(Array.from({ length: 26 }, (_, index) => index + 1));
	});

	it("names each source with the attribution its publisher asks for", () => {
		const [bag] = switzerland.registries;
		expect(bag?.id).toBe("ch-bag-kzp");
		expect(bag?.publisher).toBe("Bundesamt für Gesundheit (BAG)");
		expect(bag?.attribution).toBe(
			"Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler 2023",
		);
		expect(bag?.attributions?.fr).toBe(
			"Source : © Office fédéral de la santé publique (OFSP), Chiffres-clés des hôpitaux suisses 2023",
		);
		expect(bag?.attributions?.it).toMatch(/^Fonte: © Ufficio federale della sanità pubblica/);
		const sitg = switzerland.registries.find((source) => source.id === "ch-ge-ems");
		expect(sitg?.attribution).toContain("Portail des données SITG (État de Genève)");
		expect(sitg?.attribution).toContain("{date}");
		const places = switzerland.registries.filter((source) => source.provides.includes("places"));
		expect(places.map((source) => source.id)).toEqual(["ch-bfs-gemeinden", "ch-swisstopo-plz"]);
		for (const source of switzerland.registries) {
			expect(source.attribution, source.id).toBeTruthy();
			expect(source.licenceUrl, source.id).toMatch(/^https:\/\//);
		}
		expect(new Set(switzerland.registries.map((source) => source.id)).size).toBe(
			switzerland.registries.length,
		);
	});

	it("identifies facilities by one scheme per list", () => {
		const ids = switzerland.practitionerIds.map((scheme) => scheme.id);
		expect(ids[0]).toBe("CH-BAG");
		for (const id of ids) expect(id).toMatch(/^CH-/);
		expect(isValidChSourceId("CH-BAG", "123456789")).toBe(true);
		expect(isValidChSourceId("CH-BAG", "12345678")).toBe(false);
		expect(isValidChSourceId("CH-BAG", "023456789")).toBe(false);
		expect(isValidChSourceId("CH-XX", "1")).toBe(false);
		for (const scheme of switzerland.practitionerIds) expect(scheme.isValid("abc")).toBe(false);
		const prefixes = Object.values(CH_ID_SCHEMES).map((scheme) => scheme.prefix);
		expect(new Set(prefixes).size).toBe(prefixes.length);
	});

	it("prints an address street, then postcode and locality", () => {
		expect(
			switzerland.address.lines({ street: "Rämistrasse 100", postcode: "8091", city: "Zürich" }),
		).toEqual(["Rämistrasse 100", "8091 Zürich"]);
		expect(switzerland.address.lines({ street: null, postcode: null, city: "Bern" })).toEqual([
			"Bern",
		]);
		expect(switzerland.address.postcode.test("8091")).toBe(true);
		expect(switzerland.address.postcode.test("0809")).toBe(false);
		expect(switzerland.address.postcode.test("80911")).toBe(false);
	});

	it("never shares a listing slug with another market", () => {
		for (const code of Object.keys(switzerland.taxonomy.professions)) {
			const slug = switzerland.taxonomy.listingSlugFor(code, null) ?? "";
			expect(slug).toBeTruthy();
			for (const other of [france, austria, unitedKingdom, czechia, spain, italy, germany]) {
				expect(other.taxonomy.isListingSlug(slug), slug).toBe(false);
			}
			expect(isChListingSlug(slug)).toBe(true);
		}
	});
});

describe("Swiss page addresses", () => {
	it("end with the list's letters and the key, umlauts spelled out", () => {
		expect(chUrlKey("CH-BAG", "123456789")).toBe("h123456789");
		expect(chFacilitySlug("Universitätsspital Zürich", "CH-BAG", "123456789")).toBe(
			"universitaetsspital-zuerich-h123456789",
		);
		expect(chFacilitySlug("Hôpital de la Tour", "CH-BAG", "223456789")).toBe(
			"hopital-de-la-tour-h223456789",
		);
		expect(chFacilitySlug("Apotheke am Bahnhof", "CH-BL-PHARM", "7601001406124")).toBe(
			"apotheke-am-bahnhof-blp7601001406124",
		);
		expect(chFacilitySlug("", "CH-BAG", "123456789")).toBe("h123456789");
	});

	it("are read back to the scheme and the key, never guessed", () => {
		expect(parseChFacilitySegment("universitaetsspital-zuerich-h123456789")).toEqual({
			idScheme: "CH-BAG",
			nationalId: "123456789",
			namePart: "universitaetsspital-zuerich",
		});
		expect(parseChFacilitySegment("gee930225001723")).toEqual({
			idScheme: "CH-GE-EMS",
			nationalId: "930225001723",
			namePart: "",
		});
		expect(parseChKey("zhe2547685")).toEqual({ idScheme: "CH-ZH-PH", nationalId: "2547685" });
		expect(parseChKey("blp1234567890123")).toBeNull();
		expect(parseChKey("H123456789")).toEqual({ idScheme: "CH-BAG", nationalId: "123456789" });
		for (const segment of ["spital-123456789", "h12345678", "xyz12", "Spital-h123456789", ""]) {
			expect(parseChFacilitySegment(segment), segment).toBeNull();
		}
	});

	it("are not France's or Italy's (a segment is read in the market of its page)", () => {
		expect(parsePractitionerSegment("spital-h123456789")).toBeNull();
		expect(parseItPlaceSegment("spital-h123456789")).toBeNull();
	});
});

describe("Swiss phone numbers", () => {
	it("normalizes published numbers to E.164, dropping the trunk 0", () => {
		expect(toE164Ch("044 268 31 11")).toBe("+41442683111");
		expect(toE164Ch("+41 44 268 31 11")).toBe("+41442683111");
		expect(toE164Ch("+41 (0)44 268 31 11")).toBe("+41442683111");
		expect(toE164Ch("0041 22 372 33 11")).toBe("+41223723311");
		expect(toE164Ch("41 91 811 11 11")).toBe("+41918111111");
		expect(toE164Ch("044/268.31.11")).toBe("+41442683111");
		expect(toE164Ch("079 123 45 67; 044 268 31 11")).toBe("+41791234567");
		expect(toE164Ch("0800 123 456")).toBe("+41800123456");
		expect(toE164Ch("+49 30 1234567")).toBe("+49301234567");
		expect(toE164Ch("268 31 11")).toBeNull();
		expect(toE164Ch("044 268 31 1")).toBeNull();
		expect(toE164Ch("")).toBeNull();
		expect(toE164Ch(null)).toBeNull();
	});

	it("prints numbers as the Swiss write them", () => {
		expect(formatPhoneCh("+41442683111")).toBe("044 268 31 11");
		expect(formatPhoneCh("+41791234567")).toBe("079 123 45 67");
		expect(formatPhoneCh("+41800123456")).toBe("0800 123 456");
		expect(formatPhoneCh("+41848123456")).toBe("0848 123 456");
		expect(formatPhoneCh("+49301234567")).toBe("+49301234567");
	});
});

describe("Swiss postcodes", () => {
	it("are four digits from 1000, Liechtenstein's left out", () => {
		expect(normalizeChPostcode("8001")).toBe("8001");
		expect(normalizeChPostcode(" 1204 ")).toBe("1204");
		expect(normalizeChPostcode("CH-6900")).toBe("6900");
		expect(normalizeChPostcode("5404 Baden")).toBe("5404");
		expect(normalizeChPostcode("9490")).toBeNull();
		expect(normalizeChPostcode("0800")).toBeNull();
		expect(normalizeChPostcode("80011")).toBeNull();
		expect(normalizeChPostcode(null)).toBeNull();
	});
});
