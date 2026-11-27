import { describe, expect, it } from "vitest";
import {
	HIQA_CASES,
	HSE_CASES,
	hiqaExport,
	hseHealthCentres,
	hseHospitals,
	hseItem,
	PSI_CASES,
	psiWorkbook,
	TWIN_EIRCODE,
} from "../../../fixtures/generate-ie";
import { combineIeLists, placeIeList } from "./combine";
import { hiqaOperator, hiqaPageSlug, parseHiqa, splitHiqaAddress } from "./hiqa";
import {
	checkHseItem,
	healthCentreName,
	hospitalName,
	hseAddress,
	isNotCare,
	parseHseLayer,
} from "./hse";
import { IeLocator } from "./locate";
import {
	compoundParts,
	derivedKeyIe,
	facilityMatchKey,
	facilityNameIe,
	repairMojibake,
	titleCaseIfUpper,
	townCandidates,
	townKey,
	townName,
} from "./names";
import { townAliases } from "./places";
import { parsePsi, psiCorrectAt, psiStreet } from "./psi";
import type { IeFacility } from "./types";

describe("Irish names", () => {
	it("repairs text encoded twice and leaves the rest alone", () => {
		expect(repairMojibake("Ionad SlÃƒÂ¡inte Sampla")).toBe("Ionad Sláinte Sampla");
		expect(repairMojibake("Ionad SlÃ¡inte")).toBe("Ionad Sláinte");
		expect(repairMojibake("Baile Átha Cliath")).toBe("Baile Átha Cliath");
		expect(repairMojibake("Example Â£ shop")).toBe("Example £ shop");
	});

	it("cases a name only when it is all in capitals", () => {
		expect(titleCaseIfUpper("SAMPLE CHEMIST")).toBe("Sample Chemist");
		expect(titleCaseIfUpper("O'BRIEN'S PHARMACY OF THE SQUARE")).toBe(
			"O'Brien's Pharmacy of the Square",
		);
		expect(titleCaseIfUpper("McCabe's Pharmacy")).toBe("McCabe's Pharmacy");
		expect(facilityNameIe(" Example Health Centre,  ")).toBe("Example Health Centre");
	});

	it("keys towns the way the lists write them", () => {
		expect(townKey("St. Mary's")).toBe(townKey("Saint Marys"));
		expect(townKey("Dublin 15")).toBe("dublin");
		expect(townKey("Dublin 6W")).toBe("dublin");
		expect(townKey("Galway City")).toBe("galway");
		expect(townKey("Newcastlewest")).toBe(townKey("Newcastle West"));
		expect(townKey("An Spidéal")).toBe("anspideal");
		expect(townKey("Co. Cork")).not.toBe(townKey("Cork"));
	});

	it("names the census's towns and their compound parts", () => {
		expect(townName("Dublin city and suburbs")).toBe("Dublin");
		expect(townName("Mullingar and environs")).toBe("Mullingar");
		expect(compoundParts("Ballybofey-Stranorlar")).toEqual(["Ballybofey", "Stranorlar"]);
		expect(compoundParts("Muinebeag (Bagenalstown)")).toEqual(["Bagenalstown", "Muinebeag"]);
		expect(compoundParts("Carrick-on-Suir")).toEqual([]);
		expect(compoundParts("Laytown-Bettystown-Mornington-Donacarney")).toHaveLength(4);
	});

	it("reads several towns out of one", () => {
		expect(townCandidates("Bishopstown, Cork")).toEqual([
			"Bishopstown, Cork",
			"Cork",
			"Bishopstown",
		]);
		expect(townCandidates("Kilkenny via Waterford")).toContain("Waterford");
		expect(townCandidates("Finglas West")).toEqual(["Finglas West", "Finglas"]);
	});

	it("matches a community hospital's name to a nursing unit's", () => {
		expect(facilityMatchKey("St Joseph's Community Hospital")).toBe(
			facilityMatchKey("Saint Josephs Nursing Home"),
		);
		expect(facilityMatchKey("Sample Community Nursing Unit")).toBe("sample");
	});

	it("derives stable nine-digit keys", () => {
		const key = derivedKeyIe(["40000", "Example Clinic", "Example Road"]);
		expect(key).toMatch(/^[1-9]\d{8}$/);
		expect(derivedKeyIe(["40000", "Example  Clinic", "Example Road"])).toBe(key);
		expect(derivedKeyIe(["40000", "Example Clinic", "Other Road"])).not.toBe(key);
	});

	it("keeps a town's other names apart from its own", () => {
		expect(
			townAliases("Dublin city and suburbs", ["Tallaght", "Dublin", "Tamhlacht"], "02341"),
		).toEqual(expect.arrayContaining(["Tallaght", "Tamhlacht", "Glenageary"]));
		expect(townAliases("Dublin city and suburbs", ["Dublin"], "02341")).not.toContain("Dublin");
	});
});

describe("the PSI's register", () => {
	it("reads the extract by its header, its date, and never the owner", async () => {
		const result = await parsePsi(psiWorkbook());
		expect(result.facts.correctAt).toBe("2026-11-02");
		expect(result.quarantined).toEqual([
			{ lineNo: 11, reason: "invalid registration number", sample: "PSI-X" },
		]);
		expect(JSON.stringify(result.rows)).not.toContain("Fixture Owner");
		const district = result.rows.find((row) => row.nationalId === PSI_CASES.district);
		expect(district).toMatchObject({
			countyCode: "260000",
			townColumn: "Dublin 15",
			street: "Unit 1, Example Centre",
			eircode: "D15 X901",
		});
		const upper = result.rows.find((row) => row.nationalId === PSI_CASES.upperCase);
		expect(upper).toMatchObject({ name: "Sample Chemist", street: "1 Example Square" });
		expect(result.counters.namesCased).toBe(1);
	});

	it("leaves the list out when its terms changed", async () => {
		await expect(parsePsi(psiWorkbook({ terms: false }))).rejects.toThrow(/terms changed/);
	});

	it("reads its date and joins its streets without the town", () => {
		expect(psiCorrectAt("This data is correct at: 02.11.2026")).toBe("2026-11-02");
		expect(psiCorrectAt("This data is correct at: 31.02.2026")).toBeNull();
		expect(psiStreet(["Unit 2", "69 Main Street", "Lusk"], "Lusk")).toBe("Unit 2, 69 Main Street");
	});
});

describe("HIQA's register", () => {
	it("shows the HSE and companies as operators, never people", () => {
		expect(hiqaOperator("Health Service Executive", "")).toMatchObject({ code: "hse" });
		expect(hiqaOperator("Example Care Homes Limited", "999001")).toEqual({
			source: "ie-operator",
			code: "company",
			label: "Example Care Homes Limited",
		});
		expect(hiqaOperator("A. N. Example", "")).toBeNull();
		expect(hiqaOperator("Example One and Example Two", "999001")).toBeNull();
		expect(hiqaOperator("Sisters of Example with A, B as members", "999001")).toBeNull();
		expect(hiqaOperator("Example Ltd trading as Example House", "999001")).toBeNull();
	});

	it("keeps a centre's page slug on HIQA's own site only", () => {
		expect(hiqaPageSlug("https://www.hiqa.ie/areas-we-work/find-a-centre/abbey-example")).toBe(
			"abbey-example",
		);
		expect(
			hiqaPageSlug("https://example.org/areas-we-work/find-a-centre/abbey-example"),
		).toBeNull();
		expect(hiqaPageSlug("https://www.hiqa.ie/areas-we-work/find-a-centre/<script>")).toBeNull();
	});

	it("splits an address and finds its Eircode", () => {
		expect(splitHiqaAddress("Saint Example's Avenue, Boyle, F52 X911")).toEqual({
			parts: ["Saint Example's Avenue", "Boyle"],
			eircode: "F52 X911",
		});
		expect(splitHiqaAddress("Example Road, Swords, K67F5D0")).toEqual({
			parts: ["Example Road", "Swords"],
			eircode: "K67 F5D0",
		});
	});

	it("reads the export and nothing of a person", () => {
		const result = parseHiqa(hiqaExport());
		expect(result.rows).toHaveLength(67);
		expect(result.quarantined).toHaveLength(1);
		const text = JSON.stringify(result);
		for (const never of [
			"Fixture Person",
			"Fixture Manager",
			"Fixture Provider",
			"Fixture condition",
			"Fixture note",
			"A. N. Example",
			"087 999",
		]) {
			expect(text).not.toContain(never);
		}
		expect(result.counters.inspectorNotes).toBe(1);
		const company = result.rows.find((row) => row.nationalId === HIQA_CASES.company);
		expect(company?.qualifications).toEqual([
			{ source: "ie-capacity", code: "63", label: null },
			{ source: "ie-operator", code: "company", label: "Example Care Homes Limited" },
			{ source: "ie-hiqa-page", code: "sample-nursing-home-boyle", label: null },
		]);
		expect(company?.phone).toBe("+353719990111");
		const individual = result.rows.find((row) => row.nationalId === HIQA_CASES.individual);
		expect(individual?.qualifications).toEqual([
			{ source: "ie-hiqa-page", code: "example-house-nursing-home", label: null },
		]);
	});
});

describe("the HSE's layers", () => {
	it("names a hospital its layer names by its town", () => {
		expect(hospitalName("Exampleton", "Community", "Example Road").name).toBe(
			"Exampleton Community Hospital",
		);
		expect(hospitalName("Sampleford", "Community", "Saint Example's Hospital")).toEqual({
			name: "Saint Example's Hospital",
			from: "line",
			usesLine: true,
		});
		expect(hospitalName("Example", "Community", "Community Hospital And Hospice").name).toBe(
			"Example Community Hospital And Hospice",
		);
		expect(hospitalName("Example", "Community", "Hospital Road").name).toBe(
			"Example Community Hospital",
		);
		expect(hospitalName("Peamount", "Mixed Use", null).name).toBe("Peamount Hospital");
		expect(hospitalName("Example Clinic", "Private General", null).name).toBe("Example Clinic");
	});

	it("names a health centre its layer names by its street", () => {
		expect(isNotCare("Materials Management Supplies Department")).toBe(true);
		expect(isNotCare("Example Health Centre")).toBe(false);
		expect(healthCentreName("Example Road")).toEqual({
			name: "Example Road Health Centre",
			completed: true,
		});
		expect(healthCentreName("HSE - Example Health Centre,  ")).toEqual({
			name: "Example Health Centre",
			completed: false,
		});
	});

	it("reads an address's lines", () => {
		expect(
			hseAddress(["Example Road", "Abbeyleix", "Co. Laois", null as unknown as string], "R32 X999"),
		).toEqual({
			parts: ["Example Road", "Abbeyleix"],
			eircode: "R32 X999",
			countyCode: "100000",
		});
		expect(hseAddress(["Example Road", "Dublin 9", "D09 X924"], "")).toMatchObject({
			parts: ["Example Road", "Dublin 9"],
			countyCode: "260000",
			eircode: "D09 X924",
		});
	});

	it("checks the layer's licence", () => {
		expect(checkHseItem(hseItem("Hospitals"))).toEqual({ modified: "2025-12-18T09:53:51.000Z" });
		expect(() => checkHseItem(hseItem("Hospitals", false))).toThrow(/licence changed/);
		expect(() => checkHseItem("<html>")).toThrow(/licence changed/);
	});

	it("reads the hospitals and health centres, the geometry being the point", () => {
		const hospitals = parseHseLayer("hse-hospitals", hseHospitals());
		expect(hospitals.rows).toHaveLength(19);
		expect(
			hospitals.rows.find((row) => row.name === "Exampleton Community Hospital")?.qualifications,
		).toEqual([{ source: "ie-hospital-kind", code: "Community", label: "Community hospital" }]);
		const centres = parseHseLayer("hse-health-centres", hseHealthCentres());
		expect(centres.rows).toHaveLength(104);
		expect(centres.quarantined).toEqual([
			expect.objectContaining({ reason: "no point in Ireland" }),
		]);
		expect(centres.counters.swappedLatLon).toBe(104);
		expect(centres.rows.map((row) => row.name)).toEqual(
			expect.arrayContaining([
				"Ionad Sláinte Sampla",
				"Example Road Health Centre",
				"Sample Health Centre",
			]),
		);
		const first = centres.rows[0];
		expect(first?.longitude).toBeLessThan(-5);
		expect(first?.latitude).toBeGreaterThan(51);
		expect(HSE_CASES.mojibake).toContain("Ã");
	});
});

const facility = (overrides: Partial<IeFacility>): IeFacility => ({
	source: "psi",
	lineNo: 1,
	idScheme: "IE-PSI",
	nationalId: "1000",
	professionCode: "IE_PHARMACY",
	name: "Example Pharmacy",
	qualifications: [],
	street: "Main Street",
	townColumn: null,
	addressParts: [],
	eircode: null,
	countyCode: "40000",
	towns: [],
	latitude: null,
	longitude: null,
	phone: null,
	matchNames: [],
	kind: null,
	...overrides,
});

describe("placing the Irish facilities", () => {
	const locator = new IeLocator(
		[
			{
				code: "17364",
				name: "Cork",
				countyCode: "40000",
				aliases: ["Ballincollig", "Douglas"],
				counties: ["40000"],
			},
			{
				code: "13200",
				name: "Athlone",
				countyCode: "230000",
				aliases: [],
				counties: ["190000", "230000"],
			},
			{ code: "30247", name: "Roscommon", countyCode: "190000", aliases: [], counties: ["190000"] },
			{ code: "31149", name: "Grange", countyCode: "200000", aliases: [], counties: ["200000"] },
			{
				code: "33094",
				name: "Ballybofey-Stranorlar",
				countyCode: "50000",
				aliases: [],
				counties: ["50000"],
			},
		],
		["40000", "230000", "190000", "200000", "50000", "260000"],
	);

	it("places by town, other name, compound part, across a border, else in the county", () => {
		const place = (towns: string[], countyCode = "40000") =>
			locator.placeByName(facility({ towns, countyCode, townColumn: towns[0] ?? null }));
		expect(place(["Cork"])).toMatchObject({ kind: "commune", code: "17364", by: "town" });
		expect(place(["Ballincollig"])).toMatchObject({
			code: "17364",
			by: "alias",
			city: "Ballincollig",
		});
		expect(place(["Stranorlar"], "50000")).toMatchObject({ code: "33094", by: "town" });
		expect(place(["Athlone"], "190000")).toMatchObject({ code: "13200", by: "otherCounty" });
		// A unique name elsewhere that does not reach the county is not a guess worth making.
		expect(place(["Grange"], "260000")).toMatchObject({
			kind: "department",
			code: "260000",
			by: "county",
		});
		expect(place(["Nowhere"], "")).toBeNull();
	});

	it("finds the town among an address's parts and prints the rest as the street", () => {
		const row = facility({
			street: null,
			addressParts: ["Example Avenue", "Ballincollig"],
			towns: ["Ballincollig", "Example Avenue"],
		});
		expect(locator.placeByName(row)).toMatchObject({
			code: "17364",
			street: "Example Avenue",
			city: "Ballincollig",
		});
	});

	it("places an HSE facility by its point, else by its address in the point's county", () => {
		const row = facility({
			street: null,
			addressParts: ["Example Road", "Cork"],
			towns: ["Cork", "Example Road"],
			latitude: 51.9,
			longitude: -8.4,
		});
		expect(locator.placeByPoint(row, { town: "17364", county: "40000" })).toMatchObject({
			by: "point",
			city: "Cork",
			street: "Example Road",
		});
		expect(locator.placeByPoint(row, { town: null, county: "40000" })).toMatchObject({
			by: "addressTown",
			code: "17364",
		});
		expect(
			locator.placeByPoint({ ...row, towns: [] }, { town: null, county: "40000" }),
		).toMatchObject({
			kind: "department",
			by: "pointCounty",
		});
	});

	it("drops an HSE community hospital that is a HIQA centre, and holds them back without HIQA", () => {
		const hiqa = facility({
			source: "hiqa",
			idScheme: "IE-HIQA",
			nationalId: "905",
			eircode: TWIN_EIRCODE,
			towns: ["Cork"],
			matchNames: ["sample"],
		});
		const twin = facility({
			source: "hse-hospitals",
			idScheme: "IE-HSE-HOSP",
			nationalId: "123456789",
			kind: "Community",
			eircode: TWIN_EIRCODE,
			towns: ["Cork"],
			matchNames: ["sample"],
		});
		const acute = { ...twin, nationalId: "223456789", kind: "General/Acute" };
		const lists = (withHiqa: boolean) => {
			const result = (source: IeFacility["source"], rows: IeFacility[]) =>
				placeIeList(
					{
						source,
						lines: rows.length,
						rows,
						quarantined: [],
						skipped: {},
						counters: {},
						facts: {},
					},
					locator,
					new Map(),
				);
			return [
				...(withHiqa ? [result("hiqa", [hiqa])] : []),
				result("hse-hospitals", [twin, acute]),
			];
		};
		const both = combineIeLists(lists(true), locator);
		expect(both.facilities.map((row) => row.nationalId)).toEqual(["905", "223456789"]);
		expect(both.stats.duplicateExamples).toEqual([
			{ key: "123456789", hiqa: "905", by: "eircode", name: "Example Pharmacy" },
		]);
		const alone = combineIeLists(lists(false), locator);
		expect(alone.facilities.map((row) => row.nationalId)).toEqual(["223456789"]);
		expect(alone.spared).toEqual([{ idScheme: "IE-HSE-HOSP", nationalId: "123456789" }]);
	});
});
