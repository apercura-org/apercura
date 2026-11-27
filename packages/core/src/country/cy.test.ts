import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneCy, isCyMobile, normalizeCyPostcode, toE164Cy } from "../phone-cy";
import { slugifyEl, transliterateGreek } from "../slugify";
import {
	CY_ID_SCHEMES,
	cyFacilitySlug,
	cyUrlKey,
	isValidCySourceId,
	parseCyFacilitySegment,
	parseCyKey,
	parseEeFacilitySegment,
} from "../slugs";
import { isCyListingSlug } from "../taxonomy/cy";
import { adapterOfSegment, CY_DISTRICTS, CY_SCHEME_IDS, cyprus } from "./index";

describe("the Cypriot adapter", () => {
	it("is a Greek-language directory market without booking or e-identity claims", () => {
		expect(cyprus.code).toBe("CY");
		expect(cyprus.segment).toBe("cy");
		expect(cyprus.defaultLocale).toBe("el");
		expect(cyprus.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("cy")).toBe(cyprus);
		expect(claimPolicyOf("CY").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(cyprus.healthDataHosting.regime).not.toBe("HDS");
		expect(cyprus.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and knows only the five districts the Government controls", () => {
		expect(cyprus.timeZones).toEqual(["Europe/Nicosia"]);
		for (const code of ["1", "3", "4", "5", "6", "1000", "5000", "6367"]) {
			expect(cyprus.timeZoneOf(code)).toBe("Europe/Nicosia");
		}
		// Kyrenia (2) has no data; nor is any other code a district.
		for (const code of ["2", "2000", "7", "0", "10", "100", "CY", ""]) {
			expect(() => cyprus.timeZoneOf(code)).toThrow(RangeError);
		}
		expect(Object.keys(CY_DISTRICTS)).toEqual(["1", "3", "4", "5", "6"]);
		expect(CY_DISTRICTS["5"]).toBe("Επαρχία Λεμεσού");
	});

	it("names every source with its licence and attribution, all under CC BY 4.0", () => {
		for (const registry of cyprus.registries) {
			expect(registry.licence).toBe("Creative Commons Attribution 4.0 International (CC BY 4.0)");
			expect(registry.licenceUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by\/4\.0/);
			expect(registry.attribution).toMatch(/CC BY 4\.0/);
			expect(registry.url).toMatch(/^https:\/\/www\.data\.gov\.cy\/el\/dataset\//);
		}
		expect(cyprus.registries.map((registry) => registry.id)).toEqual([
			"cy-farmakeia",
			"cy-nosokomeia",
			"cy-kentra-ygeias",
			"cy-tk",
			"cy-apografi",
		]);
		// The lists the pages are built from say they were changed, as CC BY 4.0 asks.
		expect(cyprus.registries.find((r) => r.id === "cy-farmakeia")?.attribution).toBe(
			"Κατάλογος Ιδιωτικών Φαρμακείων: Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura",
		);
		expect(cyprus.practitionerIds.map((id) => id.id)).toEqual(CY_SCHEME_IDS);
	});

	it("prints an address the Cypriot way", () => {
		expect(
			cyprus.address.lines({ street: "Ερμού 51Γ", postcode: "6023", city: "Λάρνακα" }),
		).toEqual(["Ερμού 51Γ", "6023 Λάρνακα"]);
		expect(cyprus.address.lines({ street: null, postcode: null, city: "Κοφίνου" })).toEqual([
			"Κοφίνου",
		]);
		expect(cyprus.address.postcode.test("1010")).toBe(true);
		expect(cyprus.address.postcode.test("0101")).toBe(false);
		expect(cyprus.address.postcode.test("101")).toBe(false);
	});

	it("lists facilities under Greek slugs in Latin letters", () => {
		expect(cyprus.taxonomy.listingSlugFor("CY_PHARMACY", null)).toBe("farmakeia");
		expect(isCyListingSlug("nosokomeia")).toBe(true);
		expect(isCyListingSlug("monada")).toBe(false);
	});
});

describe("Cypriot phone numbers and postcodes", () => {
	it("reads the forms the lists publish", () => {
		expect(toE164Cy("22603000")).toBe("+35722603000");
		expect(toE164Cy("22 603000")).toBe("+35722603000");
		expect(toE164Cy("+357 22 603000")).toBe("+35722603000");
		expect(toE164Cy("00357 99 123456")).toBe("+35799123456");
		expect(toE164Cy("35722603000")).toBe("+35722603000");
		// A health centre's several numbers: the first.
		expect(toE164Cy("22347780; 22347188; 22348313")).toBe("+35722347780");
		expect(toE164Cy("77787071")).toBe("+35777787071");
		expect(toE164Cy("+30 210 1234567")).toBe("+302101234567");
		// Seven digits (a typo of the list), a short number, nothing.
		expect(toE164Cy("2203860")).toBeNull();
		expect(toE164Cy("112")).toBeNull();
		expect(toE164Cy("12345678")).toBeNull();
		expect(toE164Cy("")).toBeNull();
		expect(toE164Cy(null)).toBeNull();
	});

	it("prints the area code or mobile prefix, then six digits", () => {
		expect(formatPhoneCy("+35722603000")).toBe("22 603000");
		expect(formatPhoneCy("+35799123456")).toBe("99 123456");
		expect(formatPhoneCy("+35780012345")).toBe("800 12345");
		expect(formatPhoneCy("+302101234567")).toBe("+302101234567");
		expect(isCyMobile("+35799123456")).toBe(true);
		expect(isCyMobile("+35722603000")).toBe(false);
	});

	it("normalizes postcodes to four digits", () => {
		expect(normalizeCyPostcode("1010")).toBe("1010");
		expect(normalizeCyPostcode(" 30 11 ")).toBe("3011");
		expect(normalizeCyPostcode("CY-3011")).toBe("3011");
		expect(normalizeCyPostcode("Τ.Κ. 3011")).toBe("3011");
		expect(normalizeCyPostcode("0101")).toBeNull();
		expect(normalizeCyPostcode("101")).toBeNull();
		expect(normalizeCyPostcode(null)).toBeNull();
	});
});

describe("Greek in Latin letters", () => {
	it("transliterates as ELOT 743 writes the Cypriot place names", () => {
		const cases: [string, string][] = [
			["Λευκωσία", "lefkosia"],
			["Λεμεσός", "lemesos"],
			["Αμμόχωστος", "ammochostos"],
			["Στρόβολος", "strovolos"],
			["Δερύνεια", "deryneia"],
			["Αυγόρου", "avgorou"],
			["Ευαγγελίστριας", "evangelistrias"],
			["Ευρύχου", "evrychou"],
			["Καϊμακλί", "kaimakli"],
			["Ταΰγετος", "taygetos"],
			["Μπογάζι", "bogazi"],
			["Λέμπα", "lempa"],
			["Ψημολόφου", "psimolofou"],
			["Θεοτόκου", "theotokou"],
		];
		for (const [greek, latin] of cases) expect(transliterateGreek(greek), greek).toBe(latin);
	});

	it("slugs a Greek name, Latin letters and digits kept", () => {
		expect(slugifyEl("Φαρμακείο, Ερμού 51Γ, Λάρνακα")).toBe("farmakeio-ermou-51g-larnaka");
		expect(slugifyEl("Κέντρο Υγείας Κοφίνου")).toBe("kentro-ygeias-kofinou");
		expect(slugifyEl("Sandy Beach A, Kατ. 4")).toBe("sandy-beach-a-kat-4");
	});
});

describe("Cypriot keys", () => {
	it("key a pharmacy by its registration number, a state facility by a derived key", () => {
		expect(Object.keys(CY_ID_SCHEMES)).toEqual(["CY-FARM", "CY-MOH"]);
		expect(isValidCySourceId("CY-FARM", "1197")).toBe(true);
		expect(isValidCySourceId("CY-FARM", "0197")).toBe(false);
		expect(isValidCySourceId("CY-MOH", "3fa9c01b2e")).toBe(true);
		expect(isValidCySourceId("CY-MOH", "3fa9c01b2")).toBe(false);
		expect(isValidCySourceId("CY-XX", "1197")).toBe(false);
		expect(cyUrlKey("CY-FARM", "1197")).toBe("f1197");
		expect(cyUrlKey("CY-MOH", "3fa9c01b2e")).toBe("m3fa9c01b2e");
	});

	it("write and read a page segment", () => {
		expect(cyFacilitySlug("Φαρμακείο, Παραδείγματος 12, Λάρνακα", "CY-FARM", "1197")).toBe(
			"farmakeio-paradeigmatos-12-larnaka-f1197",
		);
		expect(parseCyFacilitySegment("farmakeio-paradeigmatos-12-larnaka-f1197")).toEqual({
			idScheme: "CY-FARM",
			nationalId: "1197",
			namePart: "farmakeio-paradeigmatos-12-larnaka",
		});
		expect(parseCyFacilitySegment("nosokomeio-paradeigmatos-m3fa9c01b2e")).toEqual({
			idScheme: "CY-MOH",
			nationalId: "3fa9c01b2e",
			namePart: "nosokomeio-paradeigmatos",
		});
		expect(parseCyKey("F1197")).toEqual({ idScheme: "CY-FARM", nationalId: "1197" });
		expect(parseCyFacilitySegment("farmakeio-1197")).toBeNull();
		expect(parseCyFacilitySegment("Farmakeio-f1197")).toBeNull();
		expect(parseCyFacilitySegment("nosokomeio-m3fa9c01b2")).toBeNull();
		// An Estonian pharmacy's key never reads as a Cypriot one, nor the other way round.
		expect(parseCyFacilitySegment("naidisapteek-ap457")).toBeNull();
		expect(parseEeFacilitySegment("farmakeio-f1197")).toBeNull();
	});
});
