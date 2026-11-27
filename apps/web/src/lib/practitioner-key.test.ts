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
