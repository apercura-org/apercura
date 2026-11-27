import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LV_PLACES_OF_CARE, writeLvFixtures } from "../../../fixtures/generate-lv";
import { buildLvBatch } from "../../merge-lv";
import { caseName, institutionName, personName, pharmacyName, territoryKey } from "./names";
import { nvdEditionOf, parseNvd } from "./nvd";
import {
	buildLvPlaceIndex,
	buildLvPlaceRows,
	parseLvPlaces,
	placeSite,
	readLvPlaceSources,
	standardNames,
} from "./places";
import { currentResource } from "./portal";
import { buildGpPractices, buildHospitals } from "./practices";
import { parseVkcp, vkcpStreet } from "./vkcp";
import { parseZva, splitAddress } from "./zva";

const dir = mkdtempSync(join(tmpdir(), "apercura-lv-unit-"));
writeLvFixtures(dir);
const read = (name: string) => readFileSync(join(dir, name));

describe("Latvian names", () => {
	it("drops the legal form, at either end, and a sole trader's legal name", () => {
		expect(institutionName("Ilzes Paraugas ģimenes ārsta prakse, SIA")).toBe(
			"Ilzes Paraugas ģimenes ārsta prakse",
		);
		expect(institutionName("Paraugu centrs, Sabiedrība ar ierobežotu atbildību")).toBe(
			"Paraugu centrs",
		);
		expect(institutionName("Sabiedrība ar ierobežotu atbildību Annas Paraugas doktorāts")).toBe(
			"Annas Paraugas doktorāts",
		);
		expect(institutionName("Paraugu poliklīnika, Pašvaldības SIA")).toBe("Paraugu poliklīnika");
		expect(institutionName("Paraugu slimnīca, PSIA")).toBe("Paraugu slimnīca");
		expect(
			institutionName(
				"Paraugs Inga - ģimenes ārsta prakse, Rīgas pilsētas I.Paraugas individuālais uzņēmums",
			),
		).toBe("Paraugs Inga - ģimenes ārsta prakse");
		expect(institutionName("Paraugu slimnīcu apvienība, SIA(Balvi)")).toBe(
			"Paraugu slimnīcu apvienība (Balvi)",
		);
		// A practice's kind after a comma is no legal form.
		expect(institutionName("Parauga Ilze, internista un kardiologa ārsta prakse")).toBe(
			"Parauga Ilze, internista un kardiologa ārsta prakse",
		);
		expect(institutionName("SIA")).toBe("SIA");
	});

	it("cases a name written in capitals the Latvian way", () => {
		expect(caseName("PARAUGU VESELĪBAS CENTRS")).toBe("Paraugu veselības centrs");
		expect(caseName("VESELĪBAS CENTRS PIEMĒRI")).toBe("Veselības centrs Piemēri");
		expect(caseName("AP MED")).toBe("AP MED");
		expect(caseName("Paraugu aptieka")).toBe("Paraugu aptieka");
	});

	it("drops a pharmacy's owner however the register writes it", () => {
		expect(pharmacyName('SIA "PARAUGU APTIEKAS" Paraugu aptieka 1', "SIA “PARAUGU APTIEKAS”")).toBe(
			"Paraugu aptieka 1",
		);
		expect(
			pharmacyName(
				'Sabiedrība ar ierobežotu atbildību “PIEMĒRS” aptiekas filiāle "Trikāta"',
				"Sabiedrība ar ierobežotu atbildību “PIEMĒRS”",
			),
		).toBe('Piemērs aptiekas filiāle "Trikāta"');
		expect(
			pharmacyName(
				"Ražošanas komercfirmas “PARAUGS” sabiedrības ar ierobežotu atbildību Skuju aptieka",
				"SIA “PARAUGS”",
			),
		).toBe("Skuju aptieka");
		expect(
			pharmacyName(
				"Paraugu pagasta Annas Paraugas individuālais uzņēmums “IZDOMĀTĀ APTIEKA”",
				"IK “IZDOMĀTĀ APTIEKA”",
			),
		).toBe("Izdomātā aptieka");
		expect(pharmacyName("“Paraugu aptieka” SIA", "SIA “CITS”")).toBe("Paraugu aptieka");
	});

	it("names a GP first name first and keys territories the register's way", () => {
		expect(personName(" Ilze ", "Parauga")).toBe("Ilze Parauga");
		expect(territoryKey("Mores pagasts, Siguldas novads")).toBe("mores pag., siguldas nov.");
		expect(territoryKey("Mores pag.,  Siguldas nov.")).toBe("mores pag., siguldas nov.");
	});
});

describe("the National Health Service's list of GPs", () => {
	it("reads the registered GPs and nothing a page does not need", async () => {
		const list = await parseNvd(read("gimenes-arsti.xlsx"));
		expect(list.lines).toBe(LV_PLACES_OF_CARE.gps.reduce((n, gp) => n + gp.gps.length, 0) + 1);
		expect(list.quarantined).toHaveLength(1);
		expect(list.skipped).toEqual({ notRegistered: 5 });
		const first = list.gps[0];
		expect(first).toEqual({
			lineNo: 2,
			code: "010000006",
			institution: "Ilzes Paraugas ģimenes ārsta prakse, SIA",
			firstName: "Ilze",
			lastName: "Parauga",
		});
		// The GP's identifier and the patient counts are never read.
		expect(JSON.stringify(list)).not.toMatch(/999\d{8}|2108/);
	});

	it("tells the quarter of a dataset's resource from its name", () => {
		expect(nvdEditionOf("2026_03 Ģimenes ārsta praksē reģistrēto pacientu skaits")).toBe(202603);
		expect(nvdEditionOf("202212_Ģimenes ārsta praksē reģistrēto pacientu skaits")).toBe(202212);
		expect(nvdEditionOf("2022_09 Ģimenes ārsta praksē")).toBe(202209);
		expect(nvdEditionOf("2019_Ģimenes ārsta praksē reģistrēto pacientu skaits")).toBe(201912);
		expect(nvdEditionOf("Ģimenes ārsta praksē")).toBeNull();
	});

	it("reads the newest quarter's file, and only under CC0 1.0", () => {
		const body = {
			result: {
				license_id: "CC0-1.0",
				resources: [
					{ name: "2025_12 GP", format: "XLSX", url: "https://example.test/2025_12.xlsx" },
					{ name: "2026_03 GP", format: "XLSX", url: "https://example.test/2026_03.xlsx" },
					{ name: "2019_GP", format: "XLSX", url: "https://example.test/2019.xlsx" },
				],
			},
		};
		expect(currentResource("nvd", body)).toEqual({
			url: "https://example.test/2026_03.xlsx",
			edition: 202603,
			licence: "CC0-1.0",
		});
		expect(() =>
			currentResource("nvd", { result: { ...body.result, license_id: "CC-BY-NC-4.0" } }),
		).toThrow(/not under CC0 1\.0/);
		expect(
			currentResource("zva", {
				result: {
					license_id: "CC0-1.0",
					resources: [
						{ format: "XML", url: "https://dati.example.test/fdu_register.xml" },
						{ format: "CSV", url: "https://dati.example.test/fdu_register.csv" },
					],
				},
			}).url,
		).toBe("https://dati.example.test/fdu_register.csv");
		expect(() =>
			currentResource("vkcp", { result: { license_id: "CC0-1.0", resources: [] } }),
		).toThrow(/names no file/);
	});
});

describe("the Ministry of the Interior's addresses", () => {
	it("splits an address written territory first", () => {
		expect(
			vkcpStreet("Valmieras nov., Valmiera, Jumaras iela 1", ["Valmieras nov.", "Valmiera"]),
		).toBe("Jumaras iela 1");
		expect(vkcpStreet("Rīga, Parauga iela 2", ["", "Rīga"])).toBe("Parauga iela 2");
		expect(
			vkcpStreet("Ķekavas nov., Daugmales pag., Daugmale Salnas", [
				"Ķekavas nov.",
				"",
				"Daugmales pag.",
				"Daugmale",
			]),
		).toBe("Salnas");
		expect(
			vkcpStreet('Ropažu nov., Stopiņu pag., Parauga centrs (AGRĀK: "Cits", Stopiņu nov.)', [
				"Ropažu nov.",
				"Stopiņu pag.",
			]),
		).toBe("Parauga centrs");
		expect(vkcpStreet("Rīga", ["Rīga"])).toBeNull();
	});

	it("joins the GPs to their practices' addresses, and lists a practice only with an address", async () => {
		const nvd = await parseNvd(read("gimenes-arsti.xlsx"));
		const vkcp = parseVkcp(read("medicinasiestades.csv").toString("utf8"));
		const gp = buildGpPractices(nvd, vkcp, 202603);
		expect(gp.edition).toBe(202603);
		expect(gp.rows).toHaveLength(85);
		expect(gp.skipped.noAddress).toBe(160 + 1);
		const centre = gp.rows.find((row) => row.nationalId === "900000014");
		expect(centre).toMatchObject({
			name: "Paraugu veselības centrs",
			professionCode: "LV_GP_PRACTICE",
		});
		expect(centre?.qualifications.map((q) => q.label)).toEqual([
			"Anna Piemēre",
			"Jānis Izdomāts",
			"Līga Fiktīva",
		]);
		expect(centre?.sites.map((site) => [site.street, site.locality])).toEqual([
			["Piemēra iela 5", "Sigulda, Siguldas nov."],
			['"Paraugi"', "More, Mores pag., Siguldas nov."],
		]);
		// GPs at a hospital: the practice is at the hospital's address.
		expect(gp.rows.find((row) => row.nationalId === "900000022")?.sites).toHaveLength(2);
		// A practice the NVD no longer lists is not listed.
		expect(gp.rows.find((row) => row.nationalId === "900000073")).toBeUndefined();
		const hospitals = buildHospitals(vkcp);
		expect(hospitals.rows.map((row) => row.name)).toContain("Paraugu dzemdību nams");
		expect(hospitals.rows.map((row) => row.name)).not.toContain("Paraugu cietuma slimnīca");
		expect(hospitals.skipped).toEqual({ notOpenToPatients: 1 });
		expect(hospitals.rows).toHaveLength(21);
	});
});

describe("the State Agency of Medicines' register", () => {
	it("reads the pharmacies open to the public and keeps no manager or e-mail", () => {
		const result = parseZva(read("fdu_register.csv").toString("utf8"));
		expect(result.rows).toHaveLength(225);
		expect(result.skipped).toEqual({ closedPharmacy: 1, notAPharmacy: 1, licenceNotInForce: 1 });
		expect(result.counters.sharedPhones).toBe(4);
		const first = result.rows[0];
		expect(first).toMatchObject({
			nationalId: "900001",
			name: "Paraugu aptieka 1",
			qualifications: [{ source: "aptieka", code: "main", label: null }],
		});
		expect(first?.sites[0]).toMatchObject({
			street: "Parauga iela 10",
			locality: "Rīga",
			postcode: "LV-1050",
			phone: "+37160000001",
		});
		const fiktiva = result.rows.find((row) => row.nationalId === "900005");
		expect(fiktiva?.sites[0]).toMatchObject({ locality: "Rīga", postcode: "LV-1050", point: null });
		expect(JSON.stringify(result.rows)).not.toMatch(/example\.test|Pārvaldniece|40000000000/);
	});

	it("splits an address written street first", () => {
		expect(splitAddress('"Paraugi"-11, Ance, Ances pag., Ventspils nov., LV-3612')).toEqual({
			street: '"Paraugi"-11',
			locality: "Ance, Ances pag., Ventspils nov.",
		});
		expect(splitAddress("Parauga iela 1, Rīga, LV -1012")).toEqual({
			street: "Parauga iela 1",
			locality: "Rīga",
		});
		expect(splitAddress("Rīga")).toEqual({ street: null, locality: "Rīga" });
	});
});

describe("Latvian places", () => {
	it("reads the state cities, municipalities, towns and parishes that exist", async () => {
		const sources = await readLvPlaceSources(dir);
		expect(sources.departments.map((d) => d.code).sort()).toEqual([
			"0001000",
			"0002000",
			"0004000",
			"0023000",
			"0038001",
			"0048000",
			"0054000",
			"0056000",
		]);
		expect(sources.communes).toHaveLength(14);
		const rows = buildLvPlaceRows(sources, []);
		const riga = rows.filter((row) => row.code === "0001000");
		expect(riga.map((row) => [row.kind, row.slug, row.department_code])).toEqual([
			["department", "riga", "0001000"],
			["commune", "riga", "0001000"],
		]);
		expect(rows.find((row) => row.kind === "region" && row.code === "LV00A")?.name).toBe(
			"Rīgas reģions",
		);
		expect(rows.find((row) => row.code === "0048450")).toMatchObject({
			kind: "commune",
			name: "Mores pagasts",
			slug: "mores-pagasts",
			department_code: "0048000",
			region_code: "LV00A",
		});
		expect(() =>
			parseLvPlaces({
				municipalities: readFileSync(join(dir, "aw_novads.csv"), "utf8").replace(
					"0048000",
					"0099000",
				),
				towns: readFileSync(join(dir, "aw_pilseta.csv"), "utf8"),
				parishes: readFileSync(join(dir, "aw_pagasts.csv"), "utf8"),
				centroids: "",
			}),
		).toThrow(/no statistical region/);
	});

	it("places a site by its locality's standard name, else by its point", async () => {
		const sources = await readLvPlaceSources(dir);
		let id = 1;
		const rows = buildLvPlaceRows(sources, []).map((row) => ({ ...row, id: id++ }));
		const index = buildLvPlaceIndex(
			rows
				.filter((row) => row.kind === "commune")
				.map((row) => ({
					id: row.id,
					code: row.code,
					name: row.name,
					departmentCode: row.department_code ?? "",
					longitude: row.longitude,
					latitude: row.latitude,
				})),
			rows
				.filter((row) => row.kind === "department")
				.map(({ id, code, name }) => ({ id, code, name })),
		);
		const nameOf = (placeId: number | null) => rows.find((row) => row.id === placeId)?.name;
		const place = (
			locality: string,
			point: { longitude: number; latitude: number } | null = null,
		) => {
			const placement = placeSite({ locality, point }, index);
			return [placement.placedBy, nameOf(placement.placeId)];
		};
		expect(
			standardNames(
				{ code: "0048450", name: "Mores pagasts", departmentCode: "0048000" },
				"Siguldas novads",
			),
		).toEqual(["mores pag., siguldas nov."]);
		expect(place("Rīga")).toEqual(["name", "Rīga"]);
		expect(place("Sigulda, Siguldas nov.")).toEqual(["name", "Sigulda"]);
		expect(place("More, Mores pag., Siguldas nov.")).toEqual(["name", "Mores pagasts"]);
		expect(place("Ance, Ances pag., Ventspils nov., LV-3612")).toEqual(["name", "Ances pagasts"]);
		// A municipality of before the 2021 reform: by the point.
		expect(place("Carnikava, Carnikavas nov.", { latitude: 57.13, longitude: 24.28 })).toEqual([
			"nearest",
			"Carnikavas pagasts",
		]);
		expect(place("Nekurciems, Valmieras nov.")).toEqual(["department", "Valmieras novads"]);
		expect(place("Nekurciems")).toEqual([null, undefined]);
	});
});

describe("the Latvian batch", () => {
	it("gives every site of a place an activity, and every site one row", async () => {
		const nvd = await parseNvd(read("gimenes-arsti.xlsx"));
		const vkcp = parseVkcp(read("medicinasiestades.csv").toString("utf8"));
		const batch = buildLvBatch([buildGpPractices(nvd, vkcp, null), buildHospitals(vkcp)]);
		const centre = batch.people.find((person) => person.national_id === "900000014");
		expect(centre).toMatchObject({
			id_scheme: "LV-GP",
			listing_slug: "gimenes-arstu-prakses",
			slug: "paraugu-veselibas-centrs-g900000014",
		});
		expect(batch.activities.filter((a) => a.national_id === "900000014")).toHaveLength(2);
		const keys = batch.sites.map((site) => `${site.source}:${site.source_key}`);
		expect(new Set(keys).size).toBe(keys.length);
		// The hospital line serves the GPs' practice and its own page: one site per list.
		expect(keys).toContain("lv-nvd-gp:9004");
		expect(keys).toContain("lv-vkcp:9004");
	});
});
