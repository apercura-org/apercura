import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CH_LIST_CANTONS } from "@apercura/core/country";
import { beforeAll, describe, expect, it } from "vitest";
import { generateChFixtures } from "../../../fixtures/generate-ch";
import { buildChOptions, parseChSources } from "../../config";
import { checkChSource } from "../../guards";
import { pageName, parseBag } from "./bag";
import { parseCantonalSource, splitAddress } from "./cantons";
import { combineChLists, matchScore, sameStreet, similarNames } from "./combine";
import { inSwitzerland, swissGridToWgs84 } from "./lv95";
import {
	cleanText,
	derivedKeyCh,
	facilityNameCh,
	localityKey,
	nameMatchKeyCh,
	splitPostcodeLocality,
} from "./names";
import {
	buildChPlaceRows,
	ChLocator,
	type ChPlaceSources,
	cantonSlug,
	readChPlaceSources,
	registerDay,
} from "./places";
import { CH_SOURCE_IDS, CH_SOURCES, type ChSourceId, chSourceUrlVariable } from "./sources";
import type { ParseResult } from "./types";

const dir = mkdtempSync(join(tmpdir(), "apercura-ch-unit-"));
const file = (source: ChSourceId) => readFileSync(join(dir, CH_SOURCES[source].file));
const parse = async (source: ChSourceId): Promise<ParseResult<ChSourceId>> =>
	source === "bag"
		? ((await parseBag(file(source), 2023)) as ParseResult<ChSourceId>)
		: parseCantonalSource(source, file(source));

let places: ChPlaceSources;
beforeAll(async () => {
	generateChFixtures(dir);
	places = await readChPlaceSources(dir);
});

describe("Swiss names and keys", () => {
	it("drop a care-of marker and what follows it, and the spreadsheets' invisible characters", () => {
		expect(
			facilityNameCh("Clinica Esempio c/o Fiduciaria Fittizia SA a.c.a. sig. Mario Fittizio"),
		).toEqual({ name: "Clinica Esempio", shortened: true });
		expect(facilityNameCh("Klinik Muster, z.H. Frau Fiktiva")).toEqual({
			name: "Klinik Muster",
			shortened: true,
		});
		expect(facilityNameCh("Clinique Exemple, à l'att. de M. Fictif").name).toBe("Clinique Exemple");
		expect(facilityNameCh("Stadtspital Musterberg Nord")).toEqual({
			name: "Stadtspital Musterberg Nord",
			shortened: false,
		});
		expect(cleanText("Dr. A. O. Fleisch\u00adStrasse 3")).toBe("Dr. A. O. Fleisch-Strasse 3");
		expect(cleanText("Kantons­spital  Muster")).toBe("Kantonsspital Muster");
	});

	it("split a postcode and its locality, and match localities loosely", () => {
		expect(splitPostcodeLocality("5630 Muri AG")).toEqual({
			postcode: "5630",
			locality: "Muri AG",
		});
		expect(splitPostcodeLocality("CH-1204 Genève")).toEqual({
			postcode: "1204",
			locality: "Genève",
		});
		expect(splitPostcodeLocality("Genève")).toBeNull();
		expect(localityKey("Muri AG")).toBe("muri");
		expect(localityKey("Sankt Gallen")).toBe(localityKey("St. Gallen"));
		expect(splitAddress("Mittlere Strasse 15, 4056 Basel")).toEqual({
			street: "Mittlere Strasse 15",
			postcode: "4056",
			locality: "Basel",
		});
		expect(splitAddress("26 route de Chêne  1207 Genève")).toEqual({
			street: "26 route de Chêne",
			postcode: "1207",
			locality: "Genève",
		});
		expect(splitAddress("Schützengasse  60, 4125")).toEqual({
			street: "Schützengasse 60",
			postcode: "4125",
			locality: "",
		});
		expect(splitAddress("Route de Chancy 1000")).toEqual({
			street: "Route de Chancy 1000",
			postcode: null,
			locality: "",
		});
	});

	it("derive nine-digit keys that never change for the same row", () => {
		const key = derivedKeyCh(["ZH", "Stadtspital Musterberg AG", "Nord", "8050"]);
		expect(key).toMatch(/^[1-9]\d{8}$/);
		expect(derivedKeyCh(["ZH", "Stadtspital Musterberg AG", "Nord", "8050"])).toBe(key);
		expect(derivedKeyCh(["ZH", "Stadtspital Musterberg AG", "Süd", "8008"])).not.toBe(key);
		expect(nameMatchKeyCh("Hôpital de La Tour SA")).toBe("tour");
	});

	it("read the Swiss grid as WGS 84", () => {
		const bern = swissGridToWgs84(2_600_000, 1_200_000);
		expect(bern?.longitude).toBeCloseTo(7.4386, 3);
		expect(bern?.latitude).toBeCloseTo(46.9511, 3);
		expect(swissGridToWgs84(600_000, 200_000)).toEqual(bern);
		expect(swissGridToWgs84(0, 0)).toBeNull();
		expect(inSwitzerland({ longitude: 8.54, latitude: 47.37 })).toBe(true);
		expect(inSwitzerland({ longitude: 2.35, latitude: 48.85 })).toBe(false);
	});

	it("tell facilities of two lists apart", () => {
		expect(similarNames(["tour"], ["la tour"])).toBe(true);
		expect(similarNames(["muster 2"], ["muster 3"])).toBe(false);
		expect(sameStreet("6 avenue Beau-Séjour", "Avenue de Beau-Séjour 6")).toBe(true);
		expect(sameStreet("Spitalstr. 144", "Spitalstrasse 144")).toBe(true);
		expect(sameStreet("Spitalstrasse 144", "Spitalstrasse 145")).toBe(false);
	});
});

describe("the FOPH's hospital figures", () => {
	it("give one row per site, with the hospital's type, activities, services and operator", async () => {
		const result = await parse("bag");
		expect(result.lines).toBe(68);
		expect(result.skipped).toEqual({ total: 1, "repeated site": 1 });
		expect(result.quarantined).toEqual([]);
		expect(result.counters.namesShortened).toBe(1);
		const north = result.rows.find((row) => row.name === "Stadtspital Musterberg Nord");
		expect(north).toMatchObject({
			idScheme: "CH-BAG",
			professionCode: "CH_HOSPITAL",
			street: "Musterbergstrasse 1",
			postcode: "8050",
			locality: "Zürich",
			cantonCode: "ZH",
			latitude: null,
			phone: null,
		});
		expect(north?.nationalId).toMatch(/^[1-9]\d{8}$/);
		expect(north?.qualifications).toEqual([
			{ source: "typ", code: "K112", label: "Allgemeinspital, Zentrumsversorgung" },
			{ source: "akt", code: "A", label: "Akutsomatik" },
			{ source: "akt", code: "R", label: "Rehabilitation" },
			{ source: "leistung", code: "NF", label: "Notfallstation" },
			{ source: "leistung", code: "IPS", label: "Intensivstation" },
			{ source: "angebot", code: "AMB", label: "ambulant" },
			{ source: "angebot", code: "STAT", label: "stationär" },
			{ source: "rechtsform", code: "R4", label: "Öffentliches Unternehmen" },
			{ source: "betrieb", code: "", label: "Stadtspital Musterberg AG" },
		]);
		const kinds = Object.fromEntries(
			[
				"Geburtshaus Muster",
				"Psychiatrische Klinik Beispielhof",
				"Rehaklinik Fiktiv",
				"Clinica Esempio",
			].map((name) => [name, result.rows.find((row) => row.name === name)?.professionCode]),
		);
		expect(kinds).toEqual({
			"Geburtshaus Muster": "CH_BIRTH_CENTRE",
			"Psychiatrische Klinik Beispielhof": "CH_PSYCHIATRIC_CLINIC",
			"Rehaklinik Fiktiv": "CH_REHAB_CLINIC",
			"Clinica Esempio": "CH_SPECIALTY_CLINIC",
		});
		// A site in another canton than its hospital's is placed in its own.
		expect(
			result.rows.find((row) => row.name === "Ambulatorium Beispielhof Basel")?.cantonCode,
		).toBe("BS");
		expect(JSON.stringify(result.rows)).not.toMatch(/Fittizio|Fiduciaria/);
	});

	it("print a site named by its town with its hospital's name", () => {
		expect(pageName("Payerne", "Hôpital Intercantonal de la Broye (HIB)")).toBe(
			"Hôpital Intercantonal de la Broye (HIB) – Payerne",
		);
		expect(pageName("LUKS Sursee", "LUKS Spitalbetriebe AG")).toBe("LUKS Sursee");
		expect(pageName("Spital Riggisberg", "Insel Gruppe AG")).toBe("Spital Riggisberg");
		expect(pageName("Rehaklinik Fiktiv", "Rehaklinik Fiktiv")).toBe("Rehaklinik Fiktiv");
	});

	it("refuse a workbook without the year's sheets", async () => {
		await expect(parseBag(file("bag"), 2024)).rejects.toThrow(/no sheets for 2024/);
	});
});

describe("the cantons' lists", () => {
	it("read every list of the fixtures, under its scheme, with no e-mail or pharmacist", async () => {
		for (const source of CH_SOURCE_IDS) {
			const result = await parse(source);
			expect(result.rows.length, source).toBeGreaterThan(0);
			expect(result.quarantined, source).toEqual([]);
			for (const row of result.rows) {
				expect(row.idScheme, source).toBe(CH_SOURCES[source].idScheme);
				expect(CH_SOURCES[source].professions, source).toContain(row.professionCode);
			}
			expect(JSON.stringify(result.rows), source).not.toMatch(
				/fiktiva|example\.ch|fixture_user|Erika/i,
			);
		}
	});

	it("keep only nursing homes, hospitals and pharmacies, as each list tells them", async () => {
		const geneva = await parse("ge-hopitaux");
		expect(geneva.skipped).toEqual({ "outpatient department": 1, "other kind": 1 });
		expect(geneva.rows.map((row) => row.professionCode).sort()).toEqual([
			"CH_HOSPITAL",
			"CH_HOSPITAL",
			"CH_PSYCHIATRIC_CLINIC",
			"CH_SPECIALTY_CLINIC",
		]);
		const clinic = geneva.rows.find((row) => row.name === "Clinique Exemple");
		expect(clinic).toMatchObject({
			street: "12 avenue de l'Exemple",
			postcode: "1206",
			phone: "+41229990101",
		});
		expect((await parse("bs-heime")).skipped).toEqual({ "day centre": 1 });
		const jura = await parse("ju-institutions");
		expect(jura.skipped).toEqual({ "not listed": 2 });
		expect(jura.rows.find((row) => row.name === "Home Exemple")).toMatchObject({
			professionCode: "CH_NURSING_HOME",
			qualifications: [{ source: "kategorie", code: "fr", label: "Home médicalisé" }],
		});
		const birth = jura.rows.find((row) => row.professionCode === "CH_BIRTH_CENTRE");
		expect(birth?.postcode).toBeNull();
		expect(birth?.latitude).toBeCloseTo(47.365, 2);
		const basel = await parse("bs-spitaeler");
		expect(
			basel.rows.find((row) => row.name === "Universitätsspital Muster")?.qualifications,
		).toEqual([
			{ source: "leistung", code: "NF", label: "Notfallstation" },
			{ source: "kategorie", code: "de", label: "Spital" },
		]);
		const pharmacies = await parse("bl-apotheken");
		expect(pharmacies.rows[0]).toMatchObject({
			nationalId: "7699999000001",
			name: "Apotheke Beispiel Liestal",
			street: "Apothekerweg 1",
			qualifications: [{ source: "betrieb", code: "", label: "Fiktiv Apotheken AG" }],
		});
	});

	it("read Zürich's latest year only, a home's hexadecimal id as a number", async () => {
		const zurich = await parse("zh-heime");
		expect(zurich.lines).toBe(32);
		expect(zurich.skipped).toEqual({ "earlier years": 33 });
		expect(zurich.rows[0]).toMatchObject({
			nationalId: String(0xa0000000),
			name: "Alterszentrum Musterhof",
			postcode: "8400",
		});
	});
});

describe("Swiss places", () => {
	it("read the commune register and the postcode directory, Liechtenstein left out", () => {
		expect(places.register.cantons).toHaveLength(26);
		expect(places.register.districts.map((district) => district.code)).toContain("2500");
		expect(places.register.communes.find((commune) => commune.code === "6621")).toEqual({
			code: "6621",
			name: "Genève",
			district: "2500",
			canton: "GE",
		});
		expect(places.postcodes.some((part) => part.postcode === "9490")).toBe(false);
		expect(registerDay("2026-11-27")).toBe("27-11-2026");
	});

	it("build cantons, districts and communes with Swiss slugs, keeping existing ones", () => {
		const rows = buildChPlaceRows(places, []);
		const region = (code: string) => rows.find((row) => row.kind === "region" && row.code === code);
		expect(region("BE")).toMatchObject({ name: "Bern / Berne", slug: "bern", region_code: "BE" });
		expect(region("ZH")?.slug).toBe("zuerich");
		expect(region("VS")?.slug).toBe("valais");
		expect(cantonSlug("Graubünden / Grigioni / Grischun")).toBe("graubuenden");
		const zurich = rows.find((row) => row.kind === "commune" && row.code === "261");
		expect(zurich).toMatchObject({
			slug: "zuerich",
			department_code: "112",
			region_code: "ZH",
			parent_kind: "department",
			parent_code: "112",
			postcodes: ["8001", "8008", "8050"],
		});
		expect(zurich?.longitude).toBeCloseTo(8.54, 1);
		const district = rows.find((row) => row.kind === "department" && row.code === "112");
		expect(district).toMatchObject({ slug: "bezirk-zuerich", parent_code: "ZH" });
		// A renamed commune keeps its former slug as an alias.
		const renamed = buildChPlaceRows(places, [
			{ kind: "commune", code: "261", name: "Zurich", slug: "zurich", departmentCode: "112" },
		]).find((row) => row.kind === "commune" && row.code === "261");
		expect(renamed).toMatchObject({ slug: "zuerich", previous_slug: "zurich" });
	});

	it("locate facilities by commune, postcode, locality, point or a neighbouring postcode", () => {
		const locator = new ChLocator(places.postcodes);
		const base = { communeCode: null, latitude: null, longitude: null };
		expect(
			locator.locate({ ...base, postcode: "8008", locality: "Zürich", cantonCode: "ZH" }),
		).toMatchObject({
			communeCode: "261",
			precision: "city",
			by: "postcode",
		});
		// A post-office box's postcode: the locality in the canton.
		expect(
			locator.locate({ ...base, postcode: "8091", locality: "Zürich", cantonCode: "ZH" })?.by,
		).toBe("locality");
		// No postcode: the part nearest the list's point.
		expect(
			locator.locate({
				...base,
				postcode: null,
				locality: "",
				cantonCode: "GE",
				latitude: 46.181,
				longitude: 6.139,
			}),
		).toMatchObject({ communeCode: "6608", precision: "address", by: "point" });
		expect(
			locator.locate({ ...base, postcode: "8051", locality: "Fiktivdorf", cantonCode: "ZH" })?.by,
		).toBe("neighbour");
		expect(
			locator.locate({ ...base, postcode: "1234", locality: "Nowhere", cantonCode: "UR" }),
		).toBeNull();
	});
});

describe("combining the Swiss lists", () => {
	it("merges a canton's hospital into the FOPH's site, and a home two cantons list", async () => {
		const results = await Promise.all(CH_SOURCE_IDS.map((source) => parse(source)));
		const { facilities, stats } = combineChLists(results, new ChLocator(places.postcodes));
		expect(stats.mergedIntoBag).toEqual({
			"be-spitaeler": 2,
			"ge-hopitaux": 1,
			"bs-spitaeler": 1,
			"ju-institutions": 1,
		});
		expect(stats.homesMerged).toBe(1);
		expect(stats.hospitalsWithoutBag).toBe(0);
		const university = facilities.find((row) => row.name === "Universitätsspital Muster Basel");
		expect(university).toMatchObject({ source: "bag", phone: "+41619990111" });
		expect(university?.location.precision).toBe("address");
		expect(university?.qualifications).toContainEqual({
			source: "quelle",
			code: "ch-bs-spitaeler",
			label: "",
		});
		expect(facilities.some((row) => row.name === "Universitätsspital Muster")).toBe(false);
		// The home of Basel-Stadt on Basel-Landschaft's list is Basel-Stadt's page.
		const home = facilities.filter((row) => row.name === "Pflegezentrum Muster Basel");
		expect(home).toHaveLength(1);
		expect(home[0]?.source).toBe("bs-heime");
		expect(home[0]?.qualifications).toContainEqual({
			source: "quelle",
			code: "ch-bl-heime",
			label: "",
		});
		const keys = facilities.map((row) => `${row.idScheme}:${row.nationalId}`);
		expect(new Set(keys).size).toBe(keys.length);
		const clinic = facilities.find((row) => row.name === "Clinique Exemple SA");
		const twin = results
			.find((result) => result.source === "ge-hopitaux")
			?.rows.find((row) => row.name === "Clinique Exemple");
		expect(clinic && twin ? matchScore(clinic, { ...twin, location: clinic.location }) : 0).toBe(4);
	});

	it("reads no canton's hospital without the FOPH's figures", async () => {
		const results = await Promise.all(
			CH_SOURCE_IDS.filter((source) => source !== "bag").map((source) => parse(source)),
		);
		const { facilities, stats } = combineChLists(results, new ChLocator(places.postcodes));
		expect(stats.hospitalsWithoutBag).toBeGreaterThan(0);
		expect(
			facilities.every((row) => ["CH_NURSING_HOME", "CH_PHARMACY"].includes(row.professionCode)),
		).toBe(true);
	});
});

describe("Swiss guards and sources", () => {
	it("allow a small list a few rows of change, and stop a broken one", () => {
		const stats = { lines: 13, rows: 13, people: 13, quarantined: 0, bytes: 4_000 };
		const previous = { ...stats, people: 11, bytes: 4_100 };
		expect(checkChSource("bs-spitaeler", stats, previous).every((check) => check.ok)).toBe(true);
		const shrunk = checkChSource("bs-spitaeler", { ...stats, rows: 2, people: 2 }, previous);
		expect(shrunk.find((check) => check.name === "bs-spitaeler.rows")?.ok).toBe(false);
		expect(shrunk.find((check) => check.name === "bs-spitaeler.facilities")).toMatchObject({
			ok: false,
			approvable: true,
		});
		const quarantined = checkChSource(
			"zh-heime",
			{ ...stats, lines: 100, rows: 98, quarantined: 2 },
			null,
		);
		expect(quarantined.find((check) => check.name === "zh-heime.quarantine")?.ok).toBe(true);
	});

	it("select the lists to import, or every list but some", () => {
		const DB = { DATABASE_URL: "postgres://localhost/unused" };
		expect(parseChSources(undefined)).toEqual([...CH_SOURCE_IDS]);
		expect(parseChSources("")).toEqual([...CH_SOURCE_IDS]);
		expect(parseChSources("bag, zh-heime,bag")).toEqual(["bag", "zh-heime"]);
		// Geneva's three lists turned off, in the order of the others.
		expect(parseChSources("-ge-hopitaux, -ge-ems,-ge-pharmacies")).toEqual(
			CH_SOURCE_IDS.filter((id) => !id.startsWith("ge-")),
		);
		expect(buildChOptions(new Map(), { ...DB, ETL_CH_SOURCES: "-ge-ems" }).sources).not.toContain(
			"ge-ems",
		);
		// The flag wins over the variable, in either form.
		expect(
			buildChOptions(new Map([["sources", "-bag"]]), { ...DB, ETL_CH_SOURCES: "bag" }).sources,
		).toHaveLength(CH_SOURCE_IDS.length - 1);
		expect(() => parseChSources("bag,-ge-ems")).toThrow(/never both/);
		expect(() => parseChSources("-ge-spitaeler")).toThrow(/Unknown Swiss source "ge-spitaeler"/);
		expect(() => parseChSources("zh-spitaeler")).toThrow(/Unknown Swiss source/);
		expect(() => parseChSources(CH_SOURCE_IDS.map((id) => `-${id}`).join(","))).toThrow(
			/At least one/,
		);
	});

	it("give each canton's list the canton the pages credit it to", () => {
		for (const id of CH_SOURCE_IDS) {
			const { canton, registry } = CH_SOURCES[id];
			expect(CH_LIST_CANTONS[registry] ?? null, id).toBe(canton);
		}
		expect(Object.keys(CH_LIST_CANTONS).sort()).toEqual(
			CH_SOURCE_IDS.filter((id) => CH_SOURCES[id].canton)
				.map((id) => CH_SOURCES[id].registry)
				.sort(),
		);
	});

	it("name each list's address variable", () => {
		expect(chSourceUrlVariable("zh-heime")).toBe("ETL_CH_ZH_HEIME_URL");
		expect(chSourceUrlVariable("bag")).toBe("ETL_CH_BAG_URL");
		expect(CH_SOURCES.bag.url).toBe(
			"https://spitalstatistik-ld.bagapps.ch/data/download/archiv/KZP/2023/kzp23_data.xlsx",
		);
	});
});
