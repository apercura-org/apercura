import { describe, expect, it } from "vitest";
import {
	fixtureRows,
	listsPage,
	listWorkbook,
	registerLayers,
	SI_FIXTURE_PLACES_DATE,
} from "../../../fixtures/generate-si";
import { buildSiOptions, parseSiSources, SI_SOURCE_FILES } from "../../config";
import { checkSiPlaces, checkSiSource } from "../../guards";
import { buildSiBatch, siPracticeKind, siSiteKey } from "../../merge-si";
import { AreaIndex, bboxCentre, contains, type PolygonGeometry } from "./geometry";
import { SiLocatorIndex } from "./locate";
import { caseLabel, houseNumber, splitDoctorName, splitStreet } from "./names";
import {
	buildSiPlaceRows,
	buildSiPlaces,
	layerUrl,
	parseSiPlaceSources,
	SI_PLACE_LAYERS,
} from "./places";
import { SI_LIST_SOURCE } from "./types";
import { codeOf, listLinks, listOfTitle, parseZzzsList, sheetDate, splitPlace } from "./zzzs";

/** The fixtures' register, read as the places import reads it. */
function fixturePlaces() {
	const layers = registerLayers();
	const json = Object.fromEntries(
		Object.entries(SI_PLACE_LAYERS).map(([layer, { file }]) => [
			layer,
			JSON.parse(layers[file] ?? "{}"),
		]),
	) as Record<keyof typeof SI_PLACE_LAYERS, unknown>;
	return parseSiPlaceSources(json, SI_FIXTURE_PLACES_DATE);
}

describe("the insurer's page", () => {
	it("links the three lists that name doctors, and the run reads only those", () => {
		const links = listLinks(listsPage());
		expect(Object.keys(links).sort()).toEqual(["gin", "sa", "zob"]);
		expect(links.sa).toBe(
			"https://zavarovanec.zzzs.si/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov?stdatoteke=90803&tx_agzzzsapi_izvajalcidownloadfile%5Baction%5D=downloadfile&type=1249058992&cHash=90803abc",
		);
		expect(listOfTitle("Število opredeljenih v dodatnih ambulantah")).toBeNull();
		expect(listOfTitle("Število opredeljenih pri ginekologih")).toBe("gin");
		expect(() => listLinks("<html></html>")).toThrow(/no sa list/);
		const twice = listsPage().replace("pri ginekologih", "pri zobozdravnikih");
		expect(() => listLinks(twice)).toThrow(/twice/);
	});
});

describe("a list's workbook", () => {
	it("reads the sheet's cells the way the insurer writes them", () => {
		expect(sheetDate("26.11.2026")).toBe("2026-11-26");
		expect(sheetDate("27.11.2026 ob 07.00")).toBe("2026-11-27");
		expect(sheetDate("31.02.2026")).toBeNull();
		expect(codeOf("31225.0")).toBe("31225");
		expect(codeOf("0.0")).toBe("0");
		expect(codeOf("")).toBeNull();
		expect(codeOf("12a")).toBeNull();
		expect(splitPlace("3211 ŠKOFJA VAS")).toEqual({ postcode: "3211", postOffice: "ŠKOFJA VAS" });
		expect(splitPlace("6000 KOPER - CAPODISTRIA")).toEqual({
			postcode: "6000",
			postOffice: "KOPER - CAPODISTRIA",
		});
	});

	it("gives one row per doctor, practice and activity, without totals, with the list's date", async () => {
		const rows = fixtureRows();
		const sa = await parseZzzsList("sa", listWorkbook("sa", rows.sa));
		expect(sa.dataDate).toBe("2026-11-26");
		expect(sa.rows).toHaveLength(rows.sa.length);
		expect(sa.quarantined).toEqual([]);
		expect(sa.skipped).toEqual({ total: 1 });
		const first = sa.rows[0];
		expect(first).toMatchObject({
			nationalId: "90001",
			nameSource: "PRIMER  ANA",
			providerCode: "90001",
			street: "PRIMERNA ULICA 12",
			postcode: "1000",
			postOffice: "LJUBLJANA",
			activityCode: "302001",
			acceptance: "accepting",
		});
		// Never read: the employment share, the patient counts, the trainee column.
		expect(Object.keys(first ?? {})).not.toContain("workShare");
		expect(sa.rows.find((row) => row.nationalId === "90005")?.acceptance).toBeNull();
		const gin = await parseZzzsList("gin", listWorkbook("gin", rows.gin));
		expect(gin.dataDate).toBe("2026-11-27");
		expect(gin.skipped).toEqual({ total: 1 });
	});

	it("quarantines a line it cannot read, with codes only, and skips other activities", async () => {
		const [row] = fixtureRows().sa;
		if (!row) throw new Error("no fixture row");
		const workbook = listWorkbook("sa", [
			row,
			{ ...row, doctor: "x" },
			{ ...row, doctor: "90100", activity: "302069" },
			{ ...row, doctor: "90101", acceptance: "MORDA" as never },
		]);
		const result = await parseZzzsList("sa", workbook);
		expect(result.rows).toHaveLength(1);
		expect(result.quarantined.map((line) => line.reason)).toEqual(["doctor code", "acceptance"]);
		expect(result.quarantined[0]?.sample).not.toMatch(/PRIMER/);
		expect(result.skipped).toEqual({ total: 1, "activity 302069": 1 });
		await expect(parseZzzsList("sa", Buffer.from("not a workbook"))).rejects.toThrow();
	});
});

describe("names and addresses in capitals", () => {
	it("split a doctor's name on the two spaces after a family name, else by its words", () => {
		expect(splitDoctorName("KOLAR  MIRAN ")).toEqual({ firstName: "Miran", lastName: "Kolar" });
		expect(splitDoctorName("NOWAKOWSKA PREZELJ ANNA MARIA")).toEqual({
			firstName: "Anna Maria",
			lastName: "Nowakowska Prezelj",
		});
		expect(splitDoctorName("ŽITKO MASTNAK MILJANA")).toEqual({
			firstName: "Miljana",
			lastName: "Žitko Mastnak",
		});
		expect(splitDoctorName("ĐORĐEVIĆ  STEVAN")).toEqual({
			firstName: "Stevan",
			lastName: "Đorđević",
		});
		expect(splitDoctorName("NOVAK-KOS  ANA")).toEqual({ firstName: "Ana", lastName: "Novak-Kos" });
		expect(splitDoctorName("KRANJC MAJA")).toEqual({ firstName: "Maja", lastName: "Kranjc" });
	});

	it("write a provider's name with its proper names capitalised, the rest the Slovenian way", () => {
		const proper = new Map<string, string | null>([
			["celje", "Celje"],
			["koper", "Koper"],
			["muamer", "Muamer"],
			["music", "Mušić"],
			["dom", "Dom"],
		]);
		expect(caseLabel("ZDRAVSTVENI DOM CELJE", proper)).toBe("Zdravstveni dom Celje");
		expect(
			caseLabel(
				"ZASEBNA ORDINACIJA DRUŽINSKE MEDICINE MUAMER MUŠIĆ, DR. MED., SPECIALIST DRUŽINSKE MEDICINE",
				proper,
			),
		).toBe(
			"Zasebna ordinacija družinske medicine Muamer Mušić, dr. med., specialist družinske medicine",
		);
		expect(caseLabel("MEDIKMIKO, STORITVE IN SVETOVANJE D.O.O.", proper)).toBe(
			"Medikmiko, storitve in svetovanje d.o.o.",
		);
		expect(caseLabel("UKC MARIBOR", proper)).toBe("UKC maribor");
		expect(caseLabel("AMBULANTA EMIR ČOLIĆ DR.MED.SPEC.", proper)).toBe(
			"Ambulanta emir čolić dr.med.spec.",
		);
	});

	it("split a street from its house number", () => {
		expect(splitStreet("CELJSKA CESTA 24 B")).toEqual({ name: "CELJSKA CESTA", number: "24 B" });
		expect(splitStreet("ZADOBROVA 49B")).toEqual({ name: "ZADOBROVA", number: "49B" });
		expect(splitStreet("TRG 4. JULIJA 7")).toEqual({ name: "TRG 4. JULIJA", number: "7" });
		expect(splitStreet("VAS BREZ ŠTEVILKE")).toEqual({ name: "VAS BREZ ŠTEVILKE", number: null });
		expect(houseNumber("24 B")).toBe("24 b");
	});
});

describe("the register's places", () => {
	it("asks the web feature service for every feature, in WGS 84, without outlines where none is needed", () => {
		const url = new URL(layerUrl("settlements"));
		expect(url.searchParams.get("typeNames")).toBe("SI.GURS.RPE:NASELJA");
		expect(url.searchParams.get("srsName")).toBe("EPSG:4326");
		expect(url.searchParams.get("propertyName")).toContain("SESTAVLJENA_SIFRA");
		expect(new URL(layerUrl("regions")).searchParams.get("propertyName")).toBeNull();
	});

	it("tells inside from outside, holes and boxes included", () => {
		const square: PolygonGeometry = {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[10, 0],
					[10, 10],
					[0, 10],
					[0, 0],
				],
				[
					[4, 4],
					[6, 4],
					[6, 6],
					[4, 6],
					[4, 4],
				],
			],
		};
		expect(contains(square, { longitude: 2, latitude: 2 })).toBe(true);
		expect(contains(square, { longitude: 5, latitude: 5 })).toBe(false);
		expect(contains(square, { longitude: 12, latitude: 2 })).toBe(false);
		expect(bboxCentre([0, 0, 2, 4])).toEqual({ longitude: 1, latitude: 2 });
		expect(
			new AreaIndex([{ item: "a", geometry: square }]).find({ longitude: 3, latitude: 3 }),
		).toBe("a");
	});

	it("put each municipality in its region, with its settlements' postcodes, and keep slugs", () => {
		const built = buildSiPlaces(fixturePlaces());
		const celje = built.municipalities.find((municipality) => municipality.name === "Celje");
		expect(celje).toMatchObject({ code: "11", region: "4", postcodes: ["3000", "3211"] });
		expect(built.locator.date).toBe(SI_FIXTURE_PLACES_DATE);
		expect(
			built.locator.settlements.find((settlement) => settlement.name === "Zadobrova"),
		).toMatchObject({ municipality: "11", postcodes: ["3211"] });
		const rows = buildSiPlaceRows(built.municipalities, []);
		expect(rows.filter((row) => row.kind === "department")).toHaveLength(12);
		expect(rows.find((row) => row.code === "12" && row.kind === "department")?.slug).toBe(
			"obalno-kraska",
		);
		expect(rows.find((row) => row.kind === "commune" && row.code === "103")).toMatchObject({
			kind: "commune",
			slug: "ravne-na-koroskem",
			department_code: "3",
		});
		const again = buildSiPlaceRows(built.municipalities, [
			{ kind: "commune", code: "11", name: "Celje", slug: "celje-old", departmentCode: "4" },
		]);
		expect(again.find((row) => row.kind === "commune" && row.code === "11")?.slug).toBe(
			"celje-old",
		);
	});
});

describe("locating a practice", () => {
	const index = new SiLocatorIndex(buildSiPlaces(fixturePlaces()).locator);

	it("finds the register's street, then a village, then the post office, then the postal area", () => {
		expect(
			index.locate({ street: "CELJSKA CESTA 24 B", postcode: "3212", postOffice: "VOJNIK" }),
		).toMatchObject({
			municipality: "133",
			by: "street",
			street: "Celjska cesta 24 b",
			postOffice: "Vojnik",
		});
		expect(
			index.locate({ street: "ZADOBROVA 49 B", postcode: "3211", postOffice: "ŠKOFJA VAS" }),
		).toMatchObject({
			municipality: "11",
			by: "settlement",
			street: "Zadobrova 49 b",
			postOffice: "Škofja vas",
		});
		expect(
			index.locate({ street: "NEZNANA ULICA 1", postcode: "2000", postOffice: "MARIBOR" }),
		).toMatchObject({ municipality: "70", by: "postOffice" });
		expect(
			index.locate({
				street: "ULICA PRIMER 5",
				postcode: "6000",
				postOffice: "KOPER - CAPODISTRIA",
			}),
		).toMatchObject({ municipality: "50", postOffice: "Koper - Capodistria" });
		expect(index.locate({ street: "X 1", postcode: "9999", postOffice: "NIKJER" })).toBeNull();
	});
});

describe("the batch of a run", () => {
	it("groups rows into doctors, practices and activities, each practice located once", async () => {
		const rows = fixtureRows();
		const results = await Promise.all(
			(["sa", "gin", "zob"] as const).map(async (list) =>
				parseZzzsList(list, listWorkbook(list, rows[list])),
			),
		);
		const index = new SiLocatorIndex(buildSiPlaces(fixturePlaces()).locator);
		const batch = buildSiBatch(results, index);
		expect(batch.unplaced).toEqual({});
		expect(batch.sites).toHaveLength(16);
		const marko = batch.people.find((person) => person.national_id === "90002");
		expect(marko).toMatchObject({
			first_name: "Marko",
			last_name: "Zgled",
			profession_code: "SI_CHILDREN_DOCTOR",
			primary_specialty_code: "327009",
			listing_slug: "otroski-zdravnik",
			slug: "marko-zgled-si90002",
		});
		const dentist = batch.activities.filter((activity) => activity.national_id === "90008");
		expect(dentist.map((activity) => [activity.activity_code, activity.acceptance])).toEqual([
			["404101", "accepting"],
			["404103", "closed"],
		]);
		expect(dentist[0]?.source).toBe(SI_LIST_SOURCE.zob);
		expect(batch.sites.find((site) => site.source_key.startsWith("90003-"))).toMatchObject({
			name: "Ambulanta Vzorec, zdravstvene storitve d.o.o.",
			address_line: "Zadobrova 49 b",
			post_office: "Škofja vas",
			municipality: "11",
		});
		expect(siPracticeKind("ZDRAVSTVENI DOM CELJE")).toBe("health_center");
		expect(siPracticeKind("SPLOŠNA BOLNIŠNICA CELJE")).toBe("hospital");
		expect(siPracticeKind("UNIVERZITETNI KLINIČNI CENTER LJUBLJANA")).toBe("hospital");
		expect(siPracticeKind("ZASEBNA ORDINACIJA DR. JADEK D.O.O.")).toBe("office");
		expect(siSiteKey({ providerCode: "1", street: "A 1", postcode: "1000" })).toMatch(
			/^1-[0-9a-f]{8}$/,
		);
		expect(siSiteKey({ providerCode: "1", street: "a  1", postcode: "1000" })).toBe(
			siSiteKey({ providerCode: "1", street: "A 1", postcode: "1000" }),
		);
	});
});

describe("the run's options and guards", () => {
	it("reads the lists to import and its sources", () => {
		expect(parseSiSources(null)).toEqual(["sa", "gin", "zob"]);
		expect(parseSiSources("zob, sa")).toEqual(["zob", "sa"]);
		expect(() => parseSiSources("dodatne")).toThrow(/Unknown Slovenian source/);
		const options = buildSiOptions(new Map([["offline", true]]), { DATABASE_URL: "postgres://x" });
		expect(options.pageUrl).toBe(
			"https://zavarovanec.zzzs.si/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov/",
		);
		expect(options.appUrl).toBeNull();
		expect(SI_SOURCE_FILES.zob).toBe("zzzs-zob.xlsx");
	});

	it("stop a broken or shrinking list, and a run that places too few practices", () => {
		const current = { lines: 1000, rows: 1000, people: 900, quarantined: 0, bytes: 100_000 };
		expect(checkSiSource("sa", current, null).every((check) => check.ok)).toBe(true);
		expect(
			checkSiSource("sa", { ...current, rows: 10 }, null).find((check) => !check.ok),
		).toMatchObject({ name: "sa.rows", approvable: false });
		const shrunk = checkSiSource("sa", { ...current, people: 700 }, { ...current });
		expect(shrunk.find((check) => !check.ok)).toMatchObject({
			name: "sa.people",
			approvable: true,
		});
		expect(checkSiPlaces({ sites: 100, placed: 97 })[0]?.ok).toBe(false);
		expect(checkSiPlaces({ sites: 100, placed: 99 })[0]?.ok).toBe(true);
	});
});
