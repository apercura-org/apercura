import { MT_LOCALITIES } from "@apercura/core/country";
import { describe, expect, it } from "vitest";
import {
	catalogueJson,
	fixtureKey,
	localCouncilsGeojson,
	MT_PHARMACIES,
	pharmaciesJson,
} from "../../../fixtures/generate-mt";
import { checkMtPlaces, checkMtSource } from "../../guards";
import { buildMtBatch, pointKey } from "../../merge-mt";
import {
	inMalta,
	localityOf,
	mtTermsProblem,
	oneLine,
	parseMtCatalogue,
	parseMtPharmacies,
	streetOf,
} from "./pharmacies";
import { buildMtPlaceRows, localityAliases, parseMtPlaces } from "./places";

describe("the Medicines Authority's register", () => {
	it("reads the catalogue record's publisher, licence and date", () => {
		const catalogue = parseMtCatalogue(catalogueJson("2026-11-18"));
		expect(catalogue).toEqual({
			publisher: "Medicines Authority",
			licences: ["https://creativecommons.org/licenses/by/4.0/"],
			edition: 20261118,
		});
		expect(mtTermsProblem(catalogue)).toBeNull();
		expect(
			mtTermsProblem(parseMtCatalogue(catalogueJson("2026-11-18", { publisher: "Someone" }))),
		).toMatch(/publisher is "Someone"/);
		expect(
			mtTermsProblem(
				parseMtCatalogue(
					catalogueJson("2026-11-18", {
						licence: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
					}),
				),
			),
		).toMatch(/no distribution under CC BY 4\.0/);
		expect(() => parseMtCatalogue("<html>blocked</html>")).toThrow(/not JSON/);
		expect(() => parseMtCatalogue("{}")).toThrow(/no dataset record/);
	});

	it("keeps the community pharmacies, cleaned, and quarantines a licence that is not one", () => {
		const result = parseMtPharmacies(Buffer.from(pharmaciesJson()), 20261118);
		expect(result.lines).toBe(MT_PHARMACIES.pharmacies.length);
		expect(result.edition).toBe(20261118);
		expect(result.skipped).toEqual({
			"type:Inpatient Pharmacies": 1,
			"type:Government Entities Pharmacies": 1,
		});
		expect(result.quarantined).toEqual([
			{ lineNo: MT_PHARMACIES.pharmacies.length, reason: "licence", sample: "PENDING" },
		]);
		expect(result.rows).toHaveLength(MT_PHARMACIES.pharmacies.length - 3);
		const valletta = result.rows.find((row) => row.nationalId === fixtureKey(1));
		expect(valletta).toMatchObject({
			professionCode: "MT_PHARMACY",
			name: "Example Valletta Pharmacy",
			street: "1, Triq ir-Repubblika",
			postcode: "VLT 1111",
			locality: "Il-Belt Valletta",
			phone: "+35621234001",
		});
		expect(valletta?.latitude).toBeGreaterThan(35.8);
		const sliema = result.rows.find((row) => row.nationalId === fixtureKey(2));
		expect(sliema).toMatchObject({
			name: "Example Sliema Seafront Pharmacy",
			postcode: "SLM 1022",
			phone: "+35621234002",
		});
		expect(result.rows.find((row) => row.nationalId === fixtureKey(4))?.professionCode).toBe(
			"MT_PHARMACY",
		);
		const luqa = result.rows.find((row) => row.nationalId === fixtureKey(5));
		expect(luqa).toMatchObject({ longitude: null, latitude: null });
		expect(result.counters).toEqual({ invalidPhones: 1, withoutPoint: 1, invalidPostcodes: 0 });
		expect(result.rows.find((row) => row.nationalId === fixtureKey(7))?.locality).toBe(
			"St. Paul's Bay",
		);
	});

	it("refuses an answer that is not the register, and a duplicate licence", () => {
		expect(() => parseMtPharmacies("<html></html>", null)).toThrow(/not JSON/);
		expect(() => parseMtPharmacies('{"error":"x"}', null)).toThrow(/no value array/);
		const row = {
			Type: "Community Pharmacies",
			Licence_No: "DL 001",
			Pharmacy_Name: "Example Pharmacy",
			Lattitude: "40.1",
			Longitude: "14.5",
		};
		const result = parseMtPharmacies(JSON.stringify({ value: [row, row] }), null);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]).toMatchObject({ latitude: null, longitude: null, phone: null });
		expect(result.quarantined).toEqual([
			{ lineNo: 2, reason: "duplicate licence", sample: "DL 001" },
		]);
	});

	it("cleans names, streets and localities", () => {
		expect(oneLine("Brown's Medical\nPlaza Pharmacy ")).toBe("Brown's Medical Plaza Pharmacy");
		expect(streetOf("Mater Dei Hospital, Tal-Qroqq,")).toBe("Mater Dei Hospital, Tal-Qroqq");
		expect(streetOf("  ")).toBeNull();
		expect(localityOf("St. Paul’s Bay")).toBe("St. Paul's Bay");
		expect(inMalta(35.8212, 14.5279)).toBe(true);
		expect(inMalta(36.0702, 14.2129)).toBe(true);
		expect(inMalta(37.5, 15.08)).toBe(false);
	});
});

describe("Malta's places", () => {
	it("reads the 68 localities and refuses an incomplete or unknown layer", () => {
		const areas = parseMtPlaces(localCouncilsGeojson());
		expect(areas).toHaveLength(68);
		expect(new Set(areas.map((area) => area.code))).toEqual(new Set(Object.keys(MT_LOCALITIES)));
		const layer = JSON.parse(localCouncilsGeojson()) as { features: unknown[] };
		expect(() =>
			parseMtPlaces(JSON.stringify({ ...layer, features: layer.features.slice(1) })),
		).toThrow(/missing/);
		expect(() =>
			parseMtPlaces(
				JSON.stringify({
					...layer,
					features: [
						...layer.features,
						{ properties: { nationalCode: "MT09999" }, geometry: { type: "Polygon" } },
					],
				}),
			),
		).toThrow(/unknown code "MT09999"/);
		expect(() => parseMtPlaces("<html/>")).toThrow(/not JSON/);
	});

	it("builds regions, districts and localities, the districts' slugs first", () => {
		const points = Object.keys(MT_LOCALITIES).map((code) => ({
			code,
			longitude: 14.5,
			latitude: 35.9,
		}));
		const rows = buildMtPlaceRows(points, []);
		expect(rows.filter((row) => row.kind === "region")).toHaveLength(2);
		expect(rows.filter((row) => row.kind === "department")).toHaveLength(6);
		expect(rows.filter((row) => row.kind === "commune")).toHaveLength(68);
		expect(rows.find((row) => row.kind === "department" && row.code === "026")).toMatchObject({
			name: "Gozo and Comino District",
			slug: "gozo-and-comino",
			parent_kind: "region",
			parent_code: "02",
		});
		expect(rows.find((row) => row.kind === "region" && row.code === "02")?.slug).toBe(
			"gozo-and-comino-02",
		);
		expect(rows.find((row) => row.kind === "commune" && row.code === "02611")).toMatchObject({
			name: "Rabat (Gozo)",
			slug: "rabat-gozo",
			department_code: "026",
			region_code: "02",
		});
		expect(rows.find((row) => row.kind === "commune" && row.code === "01537")?.slug).toBe(
			"mellieha",
		);
		// A known place keeps its slug.
		const again = buildMtPlaceRows(points, [
			{
				kind: "commune",
				code: "01101",
				name: "Valletta",
				slug: "valletta-old",
				departmentCode: "011",
			},
		]);
		expect(again.find((row) => row.code === "01101")?.slug).toBe("valletta-old");
		expect(localityAliases("02611")).toEqual(["Ir-Rabat (Għawdex)", "Victoria"]);
		expect(localityAliases("01214")).toEqual(["Fleur-de-Lys"]);
	});
});

describe("placing a pharmacy", () => {
	const places = new Map(
		["01101", "01133", "01241", "01247"].map((code, index) => [
			code,
			{
				id: index + 1,
				code,
				name: MT_LOCALITIES[code]?.name ?? code,
				districtCode: code.slice(0, 3),
			},
		]),
	);
	const result = parseMtPharmacies(
		JSON.stringify({
			value: [
				{
					Type: "Community Pharmacies",
					Licence_No: "DL 001",
					Pharmacy_Name: "A",
					Locality: "Il-Belt Valletta",
					Lattitude: "35.898",
					Longitude: "14.512",
				},
				{
					Type: "Community Pharmacies",
					Licence_No: "DL 002",
					Pharmacy_Name: "B",
					Locality: "Ħal Luqa",
				},
				{
					Type: "Community Pharmacies",
					Licence_No: "DL 003",
					Pharmacy_Name: "C",
					Locality: "L-Imsida",
					Lattitude: "35.896",
					Longitude: "14.49",
				},
				{
					Type: "Community Pharmacies",
					Licence_No: "DL 004",
					Pharmacy_Name: "D",
					Locality: "Atlantis",
				},
			],
		}),
		null,
	);

	it("places by the point's locality, else by the locality named, and counts what disagrees", () => {
		const located = new Map([
			[pointKey("pharmacies", "001"), { code: "01101", inside: true }],
			[pointKey("pharmacies", "003"), { code: "01247", inside: false }],
		]);
		const batch = buildMtBatch([result], places, located);
		expect(batch.placement).toEqual({
			point: 1,
			nearby: 1,
			name: 1,
			unplaced: 1,
			disagreeing: 1,
			atPoint: 2,
		});
		expect(batch.people.map((person) => person.slug)).toEqual(["a-dl001", "b-dl002", "c-dl003"]);
		expect(batch.sites.map((site) => [site.place_id, site.placed_by, site.city])).toEqual([
			[1, "point", "Il-Belt Valletta"],
			[2, "name", "Ħal Luqa"],
			[4, "nearby", "L-Imsida"],
		]);
		expect(batch.people.every((person) => person.listing_slug === "community-pharmacies")).toBe(
			true,
		);
		expect(checkMtPlaces(batch.placement).map((check) => check.ok)).toEqual([false, false]);
	});

	it("guards the register's size and its date", () => {
		const stats = {
			lines: 261,
			rows: 241,
			people: 241,
			quarantined: 0,
			bytes: 70_000,
			edition: 20261118,
		};
		expect(checkMtSource("pharmacies", stats, null).every((check) => check.ok)).toBe(true);
		const older = checkMtSource("pharmacies", stats, { ...stats, edition: 20261125 });
		expect(older.find((check) => check.name === "pharmacies.edition")).toMatchObject({
			ok: false,
			approvable: false,
		});
		const shrunk = checkMtSource("pharmacies", { ...stats, people: 150, rows: 150 }, stats);
		expect(shrunk.find((check) => check.name === "pharmacies.pharmacies")).toMatchObject({
			ok: false,
			approvable: true,
		});
		expect(
			checkMtSource("pharmacies", { ...stats, lines: 10, rows: 5, people: 5 }, null).some(
				(check) => !check.ok && !check.approvable,
			),
		).toBe(true);
	});
});
