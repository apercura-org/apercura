import { describe, expect, it } from "vitest";
import {
	AT_PEOPLE,
	dentistsJson,
	GEMEINDEN,
	gemeindenJson,
	SBG_CASES,
	SBG_DENTISTS,
	STMK_CASES,
	sbgJson,
	stmkZip,
	WIEN_CASES,
	wienJson,
} from "../../../fixtures/generate-at";
import { buildAtOptions, parseArgs, parseAtSources } from "../../config";
import { checkAtPlaces, checkAtSource } from "../../guards";
import { readDbf, readShpPoints, writeDbf, writeShpPoints } from "../../lib/shapefile";
import { readZipEntries, writeStoredZip } from "../../lib/zip";
import { buildAtBatch } from "../../merge-at";
import { atNameKey, isTitleToken, splitFullName, titleCodeOf } from "./names";
import { buildAtPlaceRows, parseGemeinden } from "./places";
import { parseSalzburg } from "./salzburg";
import { parseSteiermark } from "./steiermark";
import { parseWien } from "./wien";

describe("Austrian names", () => {
	it("splits titles, first names and the family name", () => {
		expect(splitFullName("Ao.Univ.Prof. Dr. Lukas Muster, MSc")).toEqual({
			titles: "Ao.Univ.Prof. Dr. MSc",
			firstName: "Lukas",
			lastName: "Muster",
		});
		expect(splitFullName("MR Dr. Maria Theresia Beispiel-Probe")).toEqual({
			titles: "MR Dr.",
			firstName: "Maria Theresia",
			lastName: "Beispiel-Probe",
		});
		expect(splitFullName("Dr. Anna von Exempel")?.lastName).toBe("von Exempel");
		expect(splitFullName("Dr. med. dent. Tom Probezahn, MSc")?.firstName).toBe("Tom");
		expect(splitFullName("DDr. Muster")).toEqual({
			titles: "DDr.",
			firstName: "",
			lastName: "Muster",
		});
		expect(splitFullName("Dr. Prim.")).toBeNull();
		expect(splitFullName("  ")).toBeNull();
	});

	it("recognises titles with or without dots", () => {
		for (const token of ["Dr.", "Univ.-Doz.", "Dr.med.univ", "MR", "OMR", "MSc", "DDr.", "Prim."]) {
			expect(isTitleToken(token), token).toBe(true);
		}
		for (const token of ["Anna", "Muster", "Jürgen"])
			expect(isTitleToken(token), token).toBe(false);
		expect(titleCodeOf("Ao.Univ.Prof. Dr.")).toBe("PR");
		expect(titleCodeOf("MR Dr.")).toBe("DR");
		expect(titleCodeOf("MUDr.")).toBe("DR");
		expect(titleCodeOf("Mag.")).toBeNull();
	});

	it("derives a stable 9-digit key from the names", () => {
		const key = atNameKey("BEISPIELER", "Hanna", "MME");
		expect(key).toMatch(/^[1-9]\d{8}$/);
		expect(atNameKey("Beispieler", "Hanna", "mme")).toBe(key);
		expect(atNameKey("Beispieler", "Hanna", "M")).not.toBe(key);
		expect(atNameKey("Beispieler", "Johanna", "MME")).not.toBe(key);
	});
});

describe("the Vienna list", () => {
	const result = parseWien(wienJson(WIEN_CASES));

	it("keys doctors and practices by the practice links", () => {
		const anna = result.rows.filter((row) => row.nationalId === "900001");
		expect(anna.map((row) => row.siteKey)).toEqual(["900001/1", "900001/2"]);
		expect(anna.map((row) => row.main)).toEqual([true, false]);
		expect(anna[0]).toMatchObject({
			idScheme: "AT-WIEN",
			professionCode: "ARZT",
			firstName: "Anna",
			lastName: "Beispiel",
			titleCode: "DR",
			postcode: "1090",
			city: "Wien",
			stateCode: "9",
			viennaDistrict: 9,
			street: "Fiktivgasse 1/2",
			phone: "+4310000101",
			specialty: { kind: "specialty", code: "allgemeinmedizin" },
		});
	});

	it("normalizes phones to E.164 and quarantines features without a link", () => {
		const phones = Object.fromEntries(
			[...result.rows].reverse().map((row) => [row.siteKey, row.phone]),
		);
		expect(phones["900002/1"]).toBe("+4310000103");
		expect(phones["900003/1"]).toBe("+436640000104");
		expect(phones["900004/1"]).toBeNull();
		expect(result.quarantined.map((line) => line.reason)).toEqual(["no practice link"]);
		expect(result.lines).toBe(WIEN_CASES.length);
	});

	it("refuses a file that is not a feature collection", () => {
		expect(() => parseWien("{}")).toThrow();
		expect(() => parseWien("<html>")).toThrow();
	});
});

describe("the Styria list", () => {
	const result = parseSteiermark(stmkZip(STMK_CASES));

	it("reads the shapefile in its ZIP, with one point per record", () => {
		expect(result.lines).toBe(STMK_CASES.length);
		expect(result.skipped).toEqual({ "no address": 1 });
		const eva = result.rows.filter((row) => row.nationalId === "800001");
		expect(eva.map((row) => [row.siteKey, row.main, row.city])).toEqual([
			["800001/9900001", true, "Graz"],
			["800001/9900002", false, "Feldkirchen"],
		]);
		expect(eva[0]?.point).toEqual({ x: 15.4402, y: 47.0712, srid: 4326 });
		expect(result.rows.find((row) => row.nationalId === "800002")).toMatchObject({
			titleCode: "PR",
			specialty: { kind: "specialty", code: "allgemeinmedizin" },
		});
	});

	it("refuses an archive without the shapefile", () => {
		expect(() =>
			parseSteiermark(writeStoredZip([{ name: "x.txt", data: Buffer.from("x") }])),
		).toThrow(/no \.dbf/);
		expect(() => parseSteiermark(Buffer.from("not a zip"))).toThrow(/Not a ZIP/);
	});
});

describe("the Salzburg lists", () => {
	it("reads doctors with their gender, group practice and EPSG:31258 point", () => {
		const result = parseSalzburg(sbgJson(SBG_CASES), "doctors");
		expect(result.rows).toHaveLength(SBG_CASES.length);
		const [first, second, third] = result.rows;
		expect(first?.nationalId).toBe(second?.nationalId);
		expect(first).toMatchObject({
			idScheme: "AT-SBG",
			civilityCode: "MME",
			lastName: "Beispieler",
			lastNameSource: "BEISPIELER",
			street: "Fiktivstraße 10",
			postcode: "5020",
			stateCode: "5",
			point: { x: 430800, y: 298400, srid: 31258 },
		});
		expect(third).toMatchObject({ civilityCode: "M", siteName: "Gruppenpraxis Fiktiv OG" });
	});

	it("reads dentists from one name field", () => {
		const result = parseSalzburg(dentistsJson(SBG_DENTISTS), "dentists");
		expect(result.rows.map((row) => [row.firstName, row.lastName, row.professionCode])).toEqual([
			["Nora", "Zahnbeispiel", "ZAHNARZT"],
			["Tom", "Probezahn", "ZAHNARZT"],
		]);
		expect(result.rows[0]?.postcode).toBe("5020");
	});
});

describe("grouping the lists", () => {
	const batch = buildAtBatch([
		parseWien(wienJson(WIEN_CASES)),
		parseSteiermark(stmkZip(STMK_CASES)),
		parseSalzburg(sbgJson(SBG_CASES), "doctors"),
	]);
	const person = (id: string) => batch.people.find((row) => row.national_id === id);

	it("makes one page per doctor, listed under the specialist field", () => {
		expect(person("900002")).toMatchObject({
			slug: "lukas-muster-w900002",
			primary_specialty_code: "innere-medizin-und-kardiologie",
			listing_slug: "kardiologie",
			title_code: "PR",
		});
		expect(person("900005")?.listing_slug).toBe("aerzte");
		expect(batch.people.filter((row) => row.id_scheme === "AT-WIEN")).toHaveLength(5);
	});

	it("makes one activity per doctor and practice, naming the primary specialty", () => {
		const lukas = batch.activities.filter((row) => row.national_id === "900002");
		expect(lukas).toEqual([
			expect.objectContaining({
				site_key: "900002/1",
				skill_code: "innere-medizin-und-kardiologie",
			}),
		]);
		expect(
			batch.qualifications.filter((row) => row.national_id === "900002").map((row) => row.code),
		).toEqual(["innere-medizin-und-kardiologie", "allgemeinmedizin"]);
		const hanna = batch.activities.filter(
			(row) => row.id_scheme === "AT-SBG" && row.site_key.endsWith("9800002"),
		);
		expect(hanna).toHaveLength(1);
		expect(batch.unknownSpecialties).toEqual({});
		expect(batch.keyCollisions).toBe(0);
	});
});

describe("Austrian places", () => {
	const gemeinden = parseGemeinden(JSON.parse(gemeindenJson()));
	const rows = buildAtPlaceRows(gemeinden, []);
	const byCode = (kind: string, code: string) =>
		rows.find((row) => row.kind === kind && row.code === code);

	it("makes the Bundesländer departments, Gemeinden communes and Vienna's districts arrondissements", () => {
		expect(rows.filter((row) => row.kind === "department").map((row) => row.slug)).toEqual([
			"burgenland",
			"kaernten",
			"niederoesterreich",
			"oberoesterreich",
			"salzburg",
			"steiermark",
			"tirol",
			"vorarlberg",
			"wien",
		]);
		expect(byCode("commune", "90001")).toMatchObject({
			name: "Wien",
			slug: "wien",
			department_code: "9",
		});
		expect(byCode("arrondissement", "91901")).toMatchObject({
			name: "Wien-Döbling",
			slug: "doebling",
			department_code: "9",
			parent_kind: "commune",
			parent_code: "90001",
		});
		expect(byCode("commune", "60608")).toMatchObject({
			slug: "feldkirchen-bei-graz",
			department_code: "6",
			parent_code: "6",
		});
		expect(rows.filter((row) => row.kind === "region")).toEqual([]);
		expect(rows.filter((row) => row.kind !== "department")).toHaveLength(GEMEINDEN.length + 1);
	});

	it("keeps an existing slug and aliases the old one after a rename", () => {
		const renamed = buildAtPlaceRows(gemeinden, [
			{ kind: "commune", code: "60101", name: "Graz (alt)", slug: "graz-alt", departmentCode: "6" },
		]);
		expect(renamed.find((row) => row.code === "60101")).toMatchObject({
			slug: "graz",
			previous_slug: "graz-alt",
		});
		const kept = buildAtPlaceRows(gemeinden, [
			{ kind: "commune", code: "60101", name: "Graz", slug: "graz-stadt", departmentCode: "6" },
		]);
		expect(kept.find((row) => row.code === "60101")?.slug).toBe("graz-stadt");
	});

	it("refuses a layer without Gemeinden", () => {
		expect(() => parseGemeinden({ type: "FeatureCollection", features: [] })).toThrow();
	});
});

describe("etl:at configuration and guards", () => {
	it("reads the lists to import", () => {
		expect(parseAtSources(undefined)).toEqual(["wien", "stmk", "sbg", "sbg-zahn"]);
		expect(parseAtSources("stmk, wien,stmk")).toEqual(["stmk", "wien"]);
		expect(() => parseAtSources("tirol")).toThrow(/Unknown Austrian source/);
		const options = buildAtOptions(parseArgs(["etl:at", "--sources", "wien", "--offline"]).flags, {
			DATABASE_URL: "postgres://x",
			ETL_AT_WIEN_URL: "https://example.test/wien.json",
			APP_URL: "https://apercura.org",
		});
		expect(options).toMatchObject({ sources: ["wien"], offline: true, appUrl: null });
		expect(options.urls.wien).toBe("https://example.test/wien.json");
		expect(options.urls.stmk).toMatch(/^https:\/\/service\.stmk\.gv\.at\//);
	});

	it("blocks broken lists and asks for approval of unusual ones", () => {
		const ok = { lines: 2000, rows: 2000, people: 1500, quarantined: 2, bytes: 1_000_000 };
		expect(checkAtSource("wien", ok, { ...ok }).every((check) => check.ok)).toBe(true);
		const tooFew = checkAtSource("wien", { ...ok, rows: 10 }, null);
		expect(tooFew.find((check) => check.name === "wien.rows")).toMatchObject({
			ok: false,
			approvable: false,
		});
		const messy = checkAtSource("wien", { ...ok, quarantined: 100 }, null);
		expect(messy.find((check) => check.name === "wien.quarantine")?.ok).toBe(false);
		const shrunk = checkAtSource("wien", { ...ok, people: 1200, bytes: 700_000 }, ok);
		expect(
			shrunk.filter((check) => !check.ok).map((check) => [check.name, check.approvable]),
		).toEqual([
			["wien.people", true],
			["wien.size", true],
		]);
		expect(checkAtPlaces({ sites: 100, placed: 97 })[0]).toMatchObject({
			ok: false,
			approvable: true,
		});
		expect(checkAtPlaces({ sites: 100, placed: 99 })[0]?.ok).toBe(true);
	});
});

describe("ZIP and shapefile readers", () => {
	it("read back what the fixture writers write", () => {
		const fields = [{ name: "NAME", type: "C", length: 12 }];
		const dbf = writeDbf(fields, [{ NAME: "Jürgen" }, { NAME: "Anna" }]);
		const shp = writeShpPoints([{ x: 15.4, y: 47.1 }, null]);
		const entries = readZipEntries(
			writeStoredZip([
				{ name: "a.dbf", data: dbf },
				{ name: "a.shp", data: shp },
			]),
			(name) => name.endsWith(".dbf") || name.endsWith(".shp"),
		);
		expect(entries.map((entry) => entry.name)).toEqual(["a.dbf", "a.shp"]);
		expect(readDbf(entries[0]?.data ?? Buffer.alloc(0)).records).toEqual([
			{ NAME: "Jürgen" },
			{ NAME: "Anna" },
		]);
		expect(readShpPoints(entries[1]?.data ?? Buffer.alloc(0))).toEqual([
			{ x: 15.4, y: 47.1 },
			null,
		]);
	});

	it("refuse truncated files", () => {
		const dbf = writeDbf([{ name: "NAME", type: "C", length: 12 }], [{ NAME: "Anna" }]);
		expect(() => readDbf(dbf.subarray(0, dbf.length - 10))).toThrow(/truncated/);
		expect(() => readShpPoints(Buffer.alloc(50))).toThrow(/Not a shapefile/);
	});

	it("generate fixtures large enough for the row floors", () => {
		expect(AT_PEOPLE.wien.length).toBeGreaterThan(1_000);
		expect(AT_PEOPLE.stmk.length).toBeGreaterThan(500);
		expect(AT_PEOPLE.sbg.length).toBeGreaterThan(300);
		expect(AT_PEOPLE.dentists.length).toBeGreaterThan(50);
	});
});
