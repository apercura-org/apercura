import { describe, expect, it } from "vitest";
import {
	APOTEK_CASES,
	apotekWorkbook,
	fixtureGln,
	licenceJson,
	SOLE_TRADER_HOLDER,
	scbArchive,
	VC_CASES,
	vardcentralerCsv,
} from "../../../fixtures/generate-se";
import { checkSeSource, SE_LIMITS } from "../../guards";
import { writeXlsxSheets } from "../../lib/xlsx";
import { firstGln, legalPersonNumber, parseApotek } from "./apotek";
import { placeSeList, SeLocator } from "./locate";
import { buildSePlaceRows, parseScbBoundaries, scbShapeLink } from "./places";
import { checkSeLicence, cleanText, excelDate, placeKey } from "./text";
import { CC_BY_4_URI, CC0_1_URI } from "./types";
import { parseVardcentraler, swerefToLonLat } from "./vardcentraler";

describe("the Swedish lists' text", () => {
	it("collapses spaces and compares municipality names loosely", () => {
		expect(cleanText("\uFEFFApotek Hjärtat  AB ")).toBe("Apotek Hjärtat AB");
		expect(placeKey("Upplands-Väsby")).toBe(placeKey("Upplands väsby"));
		expect(placeKey("Malung-sälen")).toBe("malung sälen");
		expect(placeKey("Ale kommun")).toBe("ale");
		expect(placeKey("Ale - - kommun")).toBe("ale");
		expect(placeKey(`a${" -".repeat(50_000)}x`)).toBe("a x");
	});

	it("reads Excel serial days and ISO dates", () => {
		expect(excelDate("42248")).toBe("2015-09-01");
		expect(excelDate("43891")).toBe("2020-03-01");
		expect(excelDate("2020-03-01")).toBe("2020-03-01");
		expect(excelDate("")).toBeNull();
		expect(excelDate("12")).toBeNull();
		expect(excelDate("not a date")).toBeNull();
	});

	it("checks a list's licence in its DCAT distribution", () => {
		expect(() => checkSeLicence(licenceJson("x", CC_BY_4_URI), CC_BY_4_URI)).not.toThrow();
		expect(() =>
			checkSeLicence(licenceJson("x", "https://creativecommons.org/licenses/by/4.0"), CC_BY_4_URI),
		).not.toThrow();
		expect(() => checkSeLicence(licenceJson("x", CC0_1_URI), CC_BY_4_URI)).toThrow(
			/^licence changed/,
		);
		expect(() => checkSeLicence("{}", CC0_1_URI)).toThrow(/names no licence/);
		expect(() => checkSeLicence("<html>", CC0_1_URI)).toThrow(/not JSON/);
	});
});

describe("Läkemedelsverket's register of pharmacies", () => {
	it("keys a pharmacy by its first valid GLN", () => {
		expect(firstGln(`${fixtureGln(2)}, ${fixtureGln(3)}, 73599990`)).toBe(fixtureGln(2));
		expect(firstGln(`7359999000012,${fixtureGln(3)}`)).toBe(fixtureGln(3));
		expect(firstGln("73599990")).toBeNull();
	});

	it("keeps a holder's number only when it is a legal person's", () => {
		expect(legalPersonNumber("556773-8249")).toBe("556773-8249");
		expect(legalPersonNumber("165567738249")).toBe("556773-8249");
		expect(legalPersonNumber("969752-2747")).toBe("969752-2747");
		expect(legalPersonNumber("811218-9876")).toBeNull();
		expect(legalPersonNumber("")).toBeNull();
	});

	it("reads the export: closed pharmacies, repeated keys, holders and licences", async () => {
		const result = await parseApotek(apotekWorkbook());
		expect(result.skipped).toEqual({ "closed to the public": 1, "repeated GLN": 1 });
		expect(result.quarantined.map((line) => line.reason)).toEqual(["no valid GLN"]);
		expect(result.counters).toMatchObject({ severalGlns: 1, holdersOmitted: 1, noLicenceDate: 1 });
		const byGln = new Map(result.rows.map((row) => [row.nationalId, row]));
		expect(byGln.has(APOTEK_CASES.closed)).toBe(false);
		expect(byGln.get(APOTEK_CASES.stockholm)).toMatchObject({
			idScheme: "SE-GLN",
			professionCode: "SE_PHARMACY",
			name: "Exempelapoteket Centrum",
			street: "Exempelgatan 1",
			postcode: "111 22",
			city: "Stockholm",
			kommun: "Stockholm",
			qualifications: [
				{ source: "tillstand", code: expect.stringMatching(/^5\.9\.3-/), label: "2015-09-01" },
				{ source: "tillstandshavare", code: "559999-0016", label: "Exempel Apotek AB" },
			],
		});
		expect(byGln.has(APOTEK_CASES.severalGlns)).toBe(true);
		expect(byGln.has(APOTEK_CASES.severalGlnsOther)).toBe(false);
		const soleTrader = byGln.get(APOTEK_CASES.soleTrader);
		expect(soleTrader?.qualifications.map((item) => item.source)).toEqual(["tillstand"]);
		expect(JSON.stringify(result.rows)).not.toContain(SOLE_TRADER_HOLDER);
		expect(JSON.stringify(result.rows)).not.toContain("811218");
	});

	it("refuses a filtered export and one without its columns", async () => {
		await expect(parseApotek(apotekWorkbook({ filtered: true }))).rejects.toThrow(/filtered/);
		await expect(
			parseApotek(writeXlsxSheets([{ name: "x", rows: [["Län", "Kommun", "GLN-kod"]] }])),
		).rejects.toThrow(/missing columns/);
		await expect(parseApotek(writeXlsxSheets([{ name: "x", rows: [["a"]] }]))).rejects.toThrow(
			/no header row/,
		);
	});
});

describe("Västra Götaland's health centres", () => {
	it("converts SWEREF 99 TM to WGS 84", () => {
		// Gothenburg's Central Station is about 6,399,900 N, 319,800 E.
		const point = swerefToLonLat("6399900", "319800");
		expect(point?.latitude).toBeCloseTo(57.709, 2);
		expect(point?.longitude).toBeCloseTo(11.973, 2);
		expect(swerefToLonLat("0", "0")).toBeNull();
		expect(swerefToLonLat("", "320000")).toBeNull();
	});

	it("reads the CSV with its byte-order mark, operator and point", () => {
		const result = parseVardcentraler(vardcentralerCsv());
		expect(result.skipped).toEqual({ "repeated HSA-id": 1 });
		expect(result.quarantined.map((line) => line.reason)).toEqual(["invalid HSA-id"]);
		const company = result.rows.find((row) => row.nationalId === VC_CASES.company);
		expect(company).toMatchObject({
			idScheme: "SE-HSA",
			professionCode: "SE_HEALTH_CENTRE",
			name: "Exempel Vårdcentral Centrum",
			postcode: "411 03",
			city: "Göteborg",
			kommun: null,
			qualifications: [{ source: "vardgivare", code: "exempel-vard-ab", label: "Exempel Vård AB" }],
		});
		expect(company?.latitude).toBeGreaterThan(57);
		expect(() => parseVardcentraler("a,b\n1,2\n")).toThrow(/missing columns/);
	});
});

describe("SCB's boundaries and placing", () => {
	it("reads the nested shapefiles and names the counties from the adapter", () => {
		const sources = parseScbBoundaries(scbArchive(), { minMunicipalities: 1 });
		expect(sources.municipalities.map((area) => area.code)).toContain("0980");
		expect(sources.municipalities.find((area) => area.code === "0114")?.name).toBe(
			"Upplands Väsby",
		);
		expect(() => parseScbBoundaries(scbArchive())).toThrow(/at least 280/);
		const rows = buildSePlaceRows(
			sources,
			[{ code: "0180", longitude: 18.06, latitude: 59.33 }],
			[],
		);
		expect(rows.filter((row) => row.kind === "department")).toHaveLength(21);
		expect(rows.find((row) => row.code === "01")).toMatchObject({
			name: "Stockholms län",
			slug: "stockholms-lan",
		});
		expect(rows.find((row) => row.code === "0114")).toMatchObject({
			slug: "upplands-vasby",
			department_code: "01",
			parent_kind: "department",
			parent_code: "01",
		});
		expect(rows.find((row) => row.code === "0180")).toMatchObject({ longitude: 18.06 });
	});

	it("finds the current archive on SCB's page", () => {
		expect(scbShapeLink('<a href="/contentassets/abc/shape_svenska_270101.zip">Zip</a>')).toBe(
			"https://www.scb.se/contentassets/abc/shape_svenska_270101.zip",
		);
		expect(scbShapeLink("<a href='/x.zip'>")).toBeNull();
	});

	it("places a pharmacy by its municipality and a health centre by its point, post town or the nearest", async () => {
		const locator = new SeLocator([
			{ code: "0114", name: "Upplands Väsby", county: "01" },
			{ code: "1480", name: "Göteborg", county: "14" },
			{ code: "1488", name: "Trollhättan", county: "14" },
			{ code: "0180", name: "Stockholm", county: "01" },
		]);
		const pharmacies = await parseApotek(apotekWorkbook());
		const placedPharmacies = placeSeList(pharmacies, locator, new Map(), null);
		const vasby = placedPharmacies.rows.find((row) => row.nationalId === APOTEK_CASES.townCasing);
		expect(vasby?.location).toEqual({ code: "0114", by: "kommun", city: "Upplands Väsby" });
		const centres = parseVardcentraler(vardcentralerCsv());
		const placed = placeSeList(
			centres,
			locator,
			new Map([
				[VC_CASES.company, { boundary: "1480", nearest: "1480" }],
				[VC_CASES.nearest, { boundary: null, nearest: "1480" }],
			]),
			["14"],
		);
		const by = (id: string) => placed.rows.find((row) => row.nationalId === id)?.location.by;
		expect(by(VC_CASES.company)).toBe("boundary");
		expect(by(VC_CASES.postTown)).toBe("postTown");
		expect(by(VC_CASES.nearest)).toBe("nearest");
		// Stockholm is a municipality, but not of the region's counties.
		expect(by(VC_CASES.outside)).toBeUndefined();
		expect(centres.quarantined.map((line) => line.sample)).toContain(VC_CASES.outside);
	});
});

describe("the Swedish guards", () => {
	const stats = (rows: number, quarantined = 0) => ({
		lines: rows + quarantined,
		rows,
		people: rows,
		quarantined,
		bytes: 100_000,
	});

	it("hold the floors on real files only", () => {
		const real = checkSeSource("apotek", stats(500), null);
		expect(real.find((check) => check.name === "apotek.rows")?.ok).toBe(false);
		const fixtures = checkSeSource("apotek", stats(20), null, { fixtures: true });
		expect(fixtures.every((check) => check.ok)).toBe(true);
		expect(SE_LIMITS.floors.vardcentraler?.minRows).toBe(150);
	});

	it("allow a small change, and ask approval for a large one", () => {
		const small = checkSeSource("apotek", stats(1_451), stats(1_445));
		expect(small.every((check) => check.ok)).toBe(true);
		const large = checkSeSource("apotek", stats(1_200), stats(1_451));
		const facilities = large.find((check) => check.name === "apotek.facilities");
		expect(facilities).toMatchObject({ ok: false, approvable: true });
	});
});
