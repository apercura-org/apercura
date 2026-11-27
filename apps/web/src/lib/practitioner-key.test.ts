import { describe, expect, it } from "vitest";
import {
	displayId,
	marketAdapter,
	marketSegmentOf,
	parseAnyPractitionerKey,
	parsePractitionerKey,
} from "./practitioner-key";

describe("parsePractitionerKey", () => {
	it("reads an RPPS in France and its interface translations", () => {
		const key = { country: "FR", idScheme: "RPPS", nationalId: "19999990013", namePart: "camille" };
		expect(parsePractitionerKey("fr", "camille-19999990013")).toEqual(key);
		expect(parsePractitionerKey("de", "camille-19999990013")).toEqual(key);
		expect(parsePractitionerKey("fr", "camille-19999990014")).toBeNull();
	});

	it("reads a regional list key in Austria, and never an RPPS there", () => {
		expect(parsePractitionerKey("de-AT", "anna-muster-w7983")).toEqual({
			country: "AT",
			idScheme: "AT-WIEN",
			nationalId: "7983",
			namePart: "anna-muster",
		});
		expect(parsePractitionerKey("de-AT", "st45")?.idScheme).toBe("AT-STMK");
		expect(parsePractitionerKey("de-AT", "camille-19999990013")).toBeNull();
		expect(parsePractitionerKey("fr", "anna-muster-w7983")).toBeNull();
	});

	it("names the market's features", () => {
		expect(marketAdapter("fr").features.booking).toBe(true);
		expect(marketAdapter("de-AT").features).toEqual({
			directory: true,
			booking: false,
			eIdentityClaim: false,
		});
	});

	it("reads any market's segment outside a locale, and prints the identifier", () => {
		expect(parseAnyPractitionerKey("camille-19999990013")?.country).toBe("FR");
		expect(parseAnyPractitionerKey("anna-muster-sb123")?.idScheme).toBe("AT-SBG");
		expect(parseAnyPractitionerKey("anna-muster")).toBeNull();
		expect(displayId({ idScheme: "RPPS", nationalId: "19999990013" })).toBe("19999990013");
		expect(displayId({ idScheme: "AT-WIEN", nationalId: "7983" })).toBe("w7983");
	});
});

describe("UK practice keys", () => {
	it("read a practice page segment in the UK only", () => {
		expect(parsePractitionerKey("en-GB", "the-example-surgery-a99001")).toEqual({
			country: "GB",
			idScheme: "GB-ODS-GP",
			nationalId: "A99001",
			namePart: "the-example-surgery",
		});
		expect(parsePractitionerKey("en-GB", "anna-muster-w7983")).toBeNull();
		expect(parsePractitionerKey("de-AT", "the-example-surgery-a99001")).toBeNull();
		expect(marketAdapter("en-GB").features.booking).toBe(false);
	});

	it("mark a UK segment outside a locale, and print the NHS identifier", () => {
		expect(marketSegmentOf("GB", "meddygfa-w91234")).toBe("gb.meddygfa-w91234");
		expect(marketSegmentOf("AT", "anna-muster-w7983")).toBe("anna-muster-w7983");
		expect(parseAnyPractitionerKey("gb.meddygfa-w91234")).toMatchObject({
			country: "GB",
			nationalId: "W91234",
		});
		expect(parseAnyPractitionerKey("meddygfa-w91234")?.country).toBe("AT");
		expect(displayId({ idScheme: "GB-ODS-GP", nationalId: "A99001" })).toBe("A99001");
		expect(displayId({ idScheme: "GB-PHS-GP", nationalId: "89001" })).toBe("sg89001");
	});
});

describe("Czech facility keys", () => {
	it("read a facility page segment in Czechia only", () => {
		expect(parsePractitionerKey("cs-CZ", "mudr-jana-ukazkova-900001")).toEqual({
			country: "CZ",
			idScheme: "CZ-NRPZS",
			nationalId: "900001",
			namePart: "mudr-jana-ukazkova",
		});
		expect(parsePractitionerKey("cs-CZ", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("cs-CZ", "the-example-surgery-a99001")).toBeNull();
		expect(parsePractitionerKey("fr", "mudr-jana-ukazkova-900001")).toBeNull();
		expect(marketAdapter("cs-CZ").features.booking).toBe(false);
	});

	it("mark a Czech segment outside a locale, and print the NRPZS number", () => {
		expect(marketSegmentOf("CZ", "mudr-jana-ukazkova-900001")).toBe("cz.mudr-jana-ukazkova-900001");
		expect(parseAnyPractitionerKey("cz.mudr-jana-ukazkova-900001")).toMatchObject({
			country: "CZ",
			nationalId: "900001",
		});
		expect(parseAnyPractitionerKey("mudr-jana-ukazkova-900001")).toBeNull();
		expect(displayId({ idScheme: "CZ-NRPZS", nationalId: "900001" })).toBe("900001");
	});
});

describe("Lithuanian institution keys", () => {
	it("read an institution page segment in Lithuania only, and mark it outside a locale", () => {
		expect(parsePractitionerKey("lt-LT", "uab-pavyzdine-klinika-9000-90000009")).toEqual({
			country: "LT",
			idScheme: "LT-VASPVT",
			nationalId: "9000-90000009",
			namePart: "uab-pavyzdine-klinika",
		});
		expect(parsePractitionerKey("lt-LT", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("fr", "uab-pavyzdine-klinika-9000-90000009")).toBeNull();
		expect(marketSegmentOf("LT", "uab-x-9000-v0a1b2c3d")).toBe("lt.uab-x-9000-v0a1b2c3d");
		expect(parseAnyPractitionerKey("lt.uab-x-9000-v0a1b2c3d")).toMatchObject({
			country: "LT",
			nationalId: "9000-v0a1b2c3d",
		});
		expect(displayId({ idScheme: "LT-VASPVT", nationalId: "9000-90000009" })).toBe("9000-90000009");
		expect(marketAdapter("lt-LT").features.booking).toBe(false);
	});
});

describe("Spanish centre keys", () => {
	it("read a centre page segment in Spain only", () => {
		expect(parsePractitionerKey("es-ES", "clinica-dental-ejemplo-centro-1328000001")).toEqual({
			country: "ES",
			idScheme: "ES-REGCESS",
			nationalId: "1328000001",
			namePart: "clinica-dental-ejemplo-centro",
		});
		expect(parsePractitionerKey("es-ES", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("es-ES", "mudr-jana-ukazkova-900001")).toBeNull();
		// France in Spanish keeps France's keys.
		expect(parsePractitionerKey("es", "camille-exemple-19999990013")?.country).toBe("FR");
		expect(parsePractitionerKey("es", "clinica-dental-ejemplo-centro-1328000001")).toBeNull();
		expect(marketAdapter("es-ES").features.booking).toBe(false);
	});

	it("mark a Spanish segment outside a locale, and print the REGCESS code", () => {
		expect(marketSegmentOf("ES", "clinica-1328000001")).toBe("es.clinica-1328000001");
		expect(parseAnyPractitionerKey("es.clinica-1328000001")).toMatchObject({
			country: "ES",
			nationalId: "1328000001",
		});
		expect(parseAnyPractitionerKey("clinica-1328000001")).toBeNull();
		expect(displayId({ idScheme: "ES-REGCESS", nationalId: "1328000001" })).toBe("1328000001");
	});
});

describe("Italian place keys", () => {
	it("read a place page segment in Italy only", () => {
		expect(parsePractitionerKey("it-IT", "farmacia-esempio-f9000001")).toEqual({
			country: "IT",
			idScheme: "IT-FARM",
			nationalId: "9000001",
			namePart: "farmacia-esempio",
		});
		expect(parsePractitionerKey("it-IT", "ospedale-esempio-s990001")?.idScheme).toBe("IT-HSP");
		expect(parsePractitionerKey("it-IT", "parafarmacia-esempio-p900001")?.idScheme).toBe(
			"IT-PFARM",
		);
		expect(parsePractitionerKey("it-IT", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("it-IT", "mudr-jana-ukazkova-900001")).toBeNull();
		// France in Italian keeps France's keys.
		expect(parsePractitionerKey("it", "camille-exemple-19999990013")?.country).toBe("FR");
		expect(parsePractitionerKey("it", "farmacia-esempio-f9000001")).toBeNull();
		expect(marketAdapter("it-IT").features.booking).toBe(false);
	});

	it("mark an Italian segment outside a locale, and print the ministry's code", () => {
		expect(marketSegmentOf("IT", "ospedale-esempio-s990001")).toBe("it.ospedale-esempio-s990001");
		expect(parseAnyPractitionerKey("it.ospedale-esempio-s990001")).toMatchObject({
			country: "IT",
			idScheme: "IT-HSP",
			nationalId: "990001",
		});
		expect(parseAnyPractitionerKey("farmacia-esempio-f9000001")).toBeNull();
		expect(displayId({ idScheme: "IT-FARM", nationalId: "9000001" })).toBe("9000001");
		expect(displayId({ idScheme: "IT-PFARM", nationalId: "002112" })).toBe("002112");
	});
});

describe("German facility keys", () => {
	it("read a facility page segment in Germany only", () => {
		expect(parsePractitionerKey("de-DE", "klinikum-beispiel-k0a1b2c3d4e")).toEqual({
			country: "DE",
			idScheme: "DE-KHV",
			nationalId: "0a1b2c3d4e",
			namePart: "klinikum-beispiel",
		});
		expect(parsePractitionerKey("de-DE", "beispiel-apotheke-th9001")).toMatchObject({
			idScheme: "DE-APO-TH",
			nationalId: "9001",
		});
		expect(parsePractitionerKey("de-DE", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("de-DE", "anna-muster-w7983")).toBeNull();
		// France in German and Austria keep their own keys.
		expect(parsePractitionerKey("de", "camille-exemple-19999990013")?.country).toBe("FR");
		expect(parsePractitionerKey("de", "klinikum-beispiel-k0a1b2c3d4e")).toBeNull();
		expect(parsePractitionerKey("de-AT", "anna-muster-w7983")?.country).toBe("AT");
		expect(parsePractitionerKey("de-AT", "beispiel-apotheke-th9001")).toBeNull();
		expect(marketAdapter("de-DE").features.booking).toBe(false);
	});

	it("mark a German segment outside a locale, and print the source letters and key", () => {
		expect(marketSegmentOf("DE", "apotheke-th9001")).toBe("de.apotheke-th9001");
		expect(parseAnyPractitionerKey("de.apotheke-th9001")).toMatchObject({
			country: "DE",
			idScheme: "DE-APO-TH",
			nationalId: "9001",
		});
		expect(parseAnyPractitionerKey("apotheke-th9001")).toBeNull();
		expect(displayId({ idScheme: "DE-KHV", nationalId: "0a1b2c3d4e" })).toBe("k0a1b2c3d4e");
		expect(displayId({ idScheme: "DE-APO-BB", nationalId: "ef2771a4ae" })).toBe("bbef2771a4ae");
	});
});
describe("Swiss facility keys", () => {
	it("read a facility page segment in Switzerland's three languages only", () => {
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			expect(parsePractitionerKey(locale, "kantonsspital-beispiel-h123456789")).toEqual({
				country: "CH",
				idScheme: "CH-BAG",
				nationalId: "123456789",
				namePart: "kantonsspital-beispiel",
			});
		}
		expect(parsePractitionerKey("de-CH", "apotheke-beispiel-blp7601001796874")?.idScheme).toBe(
			"CH-BL-PHARM",
		);
		expect(parsePractitionerKey("fr-CH", "ems-exemple-gee930225001723")?.idScheme).toBe(
			"CH-GE-EMS",
		);
		expect(parsePractitionerKey("de-CH", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("de-CH", "farmacia-esempio-f9000001")).toBeNull();
		// Other markets never read a Swiss key.
		expect(parsePractitionerKey("it-IT", "kantonsspital-beispiel-h123456789")).toBeNull();
		expect(parsePractitionerKey("fr", "kantonsspital-beispiel-h123456789")).toBeNull();
		expect(marketAdapter("fr-CH").features.booking).toBe(false);
	});

	it("mark a Swiss segment outside a locale, and print the page's key", () => {
		expect(marketSegmentOf("CH", "heim-beispiel-zhe1234")).toBe("ch.heim-beispiel-zhe1234");
		expect(parseAnyPractitionerKey("ch.heim-beispiel-zhe1234")).toMatchObject({
			country: "CH",
			idScheme: "CH-ZH-PH",
			nationalId: "1234",
		});
		expect(displayId({ idScheme: "CH-BAG", nationalId: "123456789" })).toBe("h123456789");
		expect(displayId({ idScheme: "CH-BL-PHARM", nationalId: "7601001796874" })).toBe(
			"blp7601001796874",
		);
	});
});

describe("Estonian provider and pharmacy keys", () => {
	it("read an Estonian page segment in Estonia only", () => {
		expect(parsePractitionerKey("et-EE", "naidise-perearstikeskus-l00009")).toEqual({
			country: "EE",
			idScheme: "EE-TTL",
			nationalId: "00009",
			namePart: "naidise-perearstikeskus",
		});
		expect(parsePractitionerKey("et-EE", "naidisapteek-ap25")).toMatchObject({
			idScheme: "EE-APT",
			nationalId: "25",
		});
		expect(parsePractitionerKey("et-EE", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("et-EE", "anna-muster-w7983")).toBeNull();
		expect(parsePractitionerKey("fr", "naidise-perearstikeskus-l00009")).toBeNull();
		expect(marketAdapter("et-EE").features.booking).toBe(false);
	});

	it("mark an Estonian segment outside a locale, and print the licence number", () => {
		expect(marketSegmentOf("EE", "naidisapteek-ap25")).toBe("ee.naidisapteek-ap25");
		expect(parseAnyPractitionerKey("ee.naidisapteek-ap25")).toMatchObject({
			country: "EE",
			idScheme: "EE-APT",
			nationalId: "25",
		});
		// A provider's identifier is its first activity licence, as the register writes it.
		expect(displayId({ idScheme: "EE-TTL", nationalId: "01909" })).toBe("L01909");
		expect(displayId({ idScheme: "EE-APT", nationalId: "457" })).toBe("ap457");
	});
});

describe("Norwegian establishment keys", () => {
	it("read a Norwegian page segment in Norway only, its check digit verified", () => {
		expect(parsePractitionerKey("nb-NO", "eksempel-legesenter-910000039")).toEqual({
			country: "NO",
			idScheme: "NO-ORGNR",
			nationalId: "910000039",
			namePart: "eksempel-legesenter",
		});
		expect(parsePractitionerKey("nb-NO", "eksempel-legesenter-910000038")).toBeNull();
		expect(parsePractitionerKey("nb-NO", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("nb-NO", "naidisapteek-ap25")).toBeNull();
		expect(parsePractitionerKey("fr", "eksempel-legesenter-910000039")).toBeNull();
		expect(marketAdapter("nb-NO").features.booking).toBe(false);
	});

	it("mark a Norwegian segment outside a locale, and print the organisation number", () => {
		expect(marketSegmentOf("NO", "apotek-1-eksempel-910000152")).toBe(
			"no.apotek-1-eksempel-910000152",
		);
		expect(parseAnyPractitionerKey("no.apotek-1-eksempel-910000152")).toMatchObject({
			country: "NO",
			idScheme: "NO-ORGNR",
			nationalId: "910000152",
		});
		// The number in groups of three, as Norway prints it.
		expect(displayId({ idScheme: "NO-ORGNR", nationalId: "910000039" })).toBe("910 000 039");
	});
});

describe("Irish facility keys", () => {
	it("read a facility page segment of each Irish list, in Ireland only", () => {
		expect(parsePractitionerKey("en-IE", "example-pharmacy-p1234")).toEqual({
			country: "IE",
			idScheme: "IE-PSI",
			nationalId: "1234",
			namePart: "example-pharmacy",
		});
		expect(parsePractitionerKey("en-IE", "example-nursing-home-n738")?.idScheme).toBe("IE-HIQA");
		expect(parsePractitionerKey("en-IE", "example-hospital-h123456789")?.idScheme).toBe(
			"IE-HSE-HOSP",
		);
		expect(parsePractitionerKey("en-IE", "example-health-centre-c123456789")?.idScheme).toBe(
			"IE-HSE-HC",
		);
		expect(parsePractitionerKey("en-IE", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("en-IE", "example-surgery-a81001")).toBeNull();
		// Other markets never read an Irish key as Ireland's.
		expect(parsePractitionerKey("en-GB", "example-pharmacy-p1234")?.country).not.toBe("IE");
		expect(parsePractitionerKey("de-CH", "example-hospital-h123456789")?.country).toBe("CH");
		expect(marketAdapter("en-IE").features.booking).toBe(false);
	});

	it("mark an Irish segment outside a locale, and print the page's key", () => {
		expect(marketSegmentOf("IE", "example-hospital-h123456789")).toBe(
			"ie.example-hospital-h123456789",
		);
		expect(parseAnyPractitionerKey("ie.example-hospital-h123456789")).toMatchObject({
			country: "IE",
			idScheme: "IE-HSE-HOSP",
			nationalId: "123456789",
		});
		expect(displayId({ idScheme: "IE-PSI", nationalId: "1234" })).toBe("p1234");
		expect(displayId({ idScheme: "IE-HIQA", nationalId: "738" })).toBe("n738");
		expect(displayId({ idScheme: "IE-HSE-HC", nationalId: "123456789" })).toBe("c123456789");
	});
});

describe("Finnish service location keys", () => {
	const key = "b18aa7f87eca4b97a8e8b438d2e29427";

	it("read a Finnish page segment in Finland only, and print the catalogue's id", () => {
		expect(parsePractitionerKey("fi-FI", `lapuan-terveyskeskus-${key}`)).toEqual({
			country: "FI",
			idScheme: "FI-PTV",
			nationalId: key,
			namePart: "lapuan-terveyskeskus",
		});
		expect(parsePractitionerKey("fi-FI", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("fr", `lapuan-terveyskeskus-${key}`)).toBeNull();
		expect(marketAdapter("fi-FI").features.booking).toBe(false);
		expect(marketSegmentOf("FI", `lapuan-terveyskeskus-${key}`)).toBe(
			`fi.lapuan-terveyskeskus-${key}`,
		);
		expect(parseAnyPractitionerKey(`fi.lapuan-terveyskeskus-${key}`)).toMatchObject({
			country: "FI",
			nationalId: key,
		});
		expect(displayId({ idScheme: "FI-PTV", nationalId: key })).toBe(
			"b18aa7f8-7eca-4b97-a8e8-b438d2e29427",
		);
	});
});

describe("Cypriot facility keys", () => {
	it("read a Cypriot page segment in Cyprus only", () => {
		expect(parsePractitionerKey("el-CY", "farmakeio-odos-paradeigmatos-12-lefkosia-f101")).toEqual({
			country: "CY",
			idScheme: "CY-FARM",
			nationalId: "101",
			namePart: "farmakeio-odos-paradeigmatos-12-lefkosia",
		});
		expect(parsePractitionerKey("el-CY", "geniko-nosokomeio-paradeigmatos-m00000000b2")).toEqual({
			country: "CY",
			idScheme: "CY-MOH",
			nationalId: "00000000b2",
			namePart: "geniko-nosokomeio-paradeigmatos",
		});
		expect(parsePractitionerKey("el-CY", "farmakeio-101")).toBeNull();
		expect(parsePractitionerKey("el-CY", "eksempel-legesenter-910000039")).toBeNull();
		expect(parsePractitionerKey("fr", "farmakeio-odos-paradeigmatos-12-lefkosia-f101")).toBeNull();
		expect(marketAdapter("el-CY").features.booking).toBe(false);
	});

	it("mark a Cypriot segment outside a locale, and print the page key", () => {
		expect(marketSegmentOf("CY", "farmakeio-paradeigmatos-f101")).toBe(
			"cy.farmakeio-paradeigmatos-f101",
		);
		expect(parseAnyPractitionerKey("cy.farmakeio-paradeigmatos-f101")).toMatchObject({
			country: "CY",
			idScheme: "CY-FARM",
			nationalId: "101",
		});
		expect(displayId({ idScheme: "CY-FARM", nationalId: "101" })).toBe("f101");
		expect(displayId({ idScheme: "CY-MOH", nationalId: "00000000b2" })).toBe("m00000000b2");
	});
});

describe("Latvian place keys", () => {
	it("read a place's page segment in Latvia only", () => {
		expect(parsePractitionerKey("lv-LV", "ilzes-paraugas-gimenes-arsta-prakse-g010000006")).toEqual(
			{
				country: "LV",
				idScheme: "LV-GP",
				nationalId: "010000006",
				namePart: "ilzes-paraugas-gimenes-arsta-prakse",
			},
		);
		expect(parsePractitionerKey("lv-LV", "paraugu-slimnica-s8958")).toMatchObject({
			idScheme: "LV-SLIM",
			nationalId: "8958",
		});
		expect(parsePractitionerKey("lv-LV", "paraugu-aptieka-a324")).toMatchObject({
			idScheme: "LV-APT",
			nationalId: "324",
		});
		expect(parsePractitionerKey("lv-LV", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("lv-LV", "beispiel-apotheke-th9001")).toBeNull();
		expect(parsePractitionerKey("fr", "paraugu-aptieka-a324")).toBeNull();
		expect(marketAdapter("lv-LV").features.booking).toBe(false);
	});

	it("mark a Latvian segment outside a locale, and print the list's letter and key", () => {
		expect(marketSegmentOf("LV", "paraugu-aptieka-a324")).toBe("lv.paraugu-aptieka-a324");
		expect(parseAnyPractitionerKey("lv.paraugu-aptieka-a324")).toMatchObject({
			country: "LV",
			idScheme: "LV-APT",
			nationalId: "324",
		});
		expect(parseAnyPractitionerKey("paraugu-aptieka-a324")).toBeNull();
		expect(displayId({ idScheme: "LV-GP", nationalId: "010000006" })).toBe("g010000006");
		expect(displayId({ idScheme: "LV-APT", nationalId: "324" })).toBe("a324");
	});
});

describe("Swedish facility keys", () => {
	it("read a Swedish page segment in Sweden only, a GLN's check digit verified", () => {
		expect(parsePractitionerKey("sv-SE", "exempelapoteket-storgatan-a7359999000014")).toEqual({
			country: "SE",
			idScheme: "SE-GLN",
			nationalId: "7359999000014",
			namePart: "exempelapoteket-storgatan",
		});
		expect(parsePractitionerKey("sv-SE", "exempel-vardcentral-v5560000000ex0001")).toEqual({
			country: "SE",
			idScheme: "SE-HSA",
			nationalId: "SE5560000000-EX0001",
			namePart: "exempel-vardcentral",
		});
		expect(parsePractitionerKey("sv-SE", "exempelapoteket-a7359999000015")).toBeNull();
		expect(parsePractitionerKey("sv-SE", "eksempel-legesenter-910000039")).toBeNull();
		expect(parsePractitionerKey("sv-SE", "camille-exemple-19999990013")).toBeNull();
		expect(parsePractitionerKey("nb-NO", "exempelapoteket-a7359999000014")).toBeNull();
		expect(marketAdapter("sv-SE").features.booking).toBe(false);
	});

	it("mark a Swedish segment outside a locale, and print the GLN or the HSA-id", () => {
		expect(marketSegmentOf("SE", "apotek-exempel-malmo-a7359999000021")).toBe(
			"se.apotek-exempel-malmo-a7359999000021",
		);
		expect(parseAnyPractitionerKey("se.apotek-exempel-malmo-a7359999000021")).toMatchObject({
			country: "SE",
			idScheme: "SE-GLN",
			nationalId: "7359999000021",
		});
		expect(displayId({ idScheme: "SE-GLN", nationalId: "7359999000014" })).toBe("7359999000014");
		expect(displayId({ idScheme: "SE-HSA", nationalId: "SE5560000000-EX0001" })).toBe(
			"SE5560000000-EX0001",
		);
	});
});
