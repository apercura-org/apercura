import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GB_FIXTURES } from "../../../fixtures/generate-gb";
import { checkGbPlaces, checkGbSource } from "../../guards";
import { buildGbBatch } from "../../merge-gb";
import { niDentalKey, parseBsoDental, parseBsoGp } from "./bso";
import { isPremisesName, namesAPerson, practiceDisplayName, titleCaseGb } from "./names";
import { parseOdsBranches, parseOdsPractices } from "./ods";
import { latestResourceUrl, parsePhs, periodOfName } from "./phs";
import { parseLadLookup, readOpenNames, readOsniTowns } from "./places";
import { readCodePoint } from "./postcodes";
import { csvRecords, decodeText } from "./types";

const fixture = (name: string) => readFileSync(join(GB_FIXTURES, name));

describe("UK names", () => {
	it("are printed in British English case", () => {
		expect(titleCaseGb("THE DENSHAM SURGERY")).toBe("The Densham Surgery");
		expect(titleCaseGb("STOCKTON-ON-TEES")).toBe("Stockton-on-Tees");
		expect(titleCaseGb("NEWCASTLE UPON TYNE")).toBe("Newcastle upon Tyne");
		expect(titleCaseGb("ST JOHN'S SURGERY")).toBe("St John's Surgery");
		expect(titleCaseGb("MCCANN NHS GP CENTRE")).toBe("McCann NHS GP Centre");
		expect(titleCaseGb("O'NEILL HOUSE")).toBe("O'Neill House");
		expect(titleCaseGb("ST FILLAN'S MEDICAL CTRE")).toBe("St Fillan's Medical Centre");
		expect(titleCaseGb("423B UPPER ROAD, 2ND FLOOR")).toBe("423B Upper Road, 2nd Floor");
		expect(titleCaseGb("MODALITY PARTNERSHIP (HULL)")).toBe("Modality Partnership (Hull)");
		expect(titleCaseGb("DG SMILE")).toBe("DG Smile");
		expect(titleCaseGb("12 THE GREEN, THE ARCHES")).toBe("12 The Green, The Arches");
		expect(titleCaseGb("TIME FOR TEETH HMP EXAMPLE")).toBe("Time for Teeth HMP Example");
		expect(titleCaseGb("Muirhead Medical Centre")).toBe("Muirhead Medical Centre");
		expect(titleCaseGb("Whyteman'S Brae")).toBe("Whyteman's Brae");
		expect(titleCaseGb("  ")).toBe("");
	});

	it("tell a person's name from a practice's", () => {
		for (const personal of [
			"DR A EXAMPLE",
			"DRS EXAMPLE AND SAMPLE",
			"DR I M SAMPLE & PARTNER",
			"Dr. EXAMPLE & PARTNERS",
			"Drs Demo, Test & Mock",
			"MR B SAMPLE",
			"MRS C D EXAMPLE",
			"MISS E SAMPLE'S DENTAL SURGERY",
			"EXAMPLE & PARTNERS",
			"A B SAMPLE",
			"DEMO TEST & MOCK",
		]) {
			expect(namesAPerson(personal), personal).toBe(true);
		}
		for (const practice of [
			"THE EXAMPLE SURGERY",
			"I J HEALTHCARE",
			"EXAMPLE & SAMPLE MEDICAL PRACTICE",
			"CHAINBRIDGE MEDICAL PARTNERSHIP",
			"THE DOCTORS SURGERY",
			"ST MARGARETS PHARMACY",
			"WARRENPOINT, NEWRY",
			"",
		]) {
			expect(namesAPerson(practice), practice).toBe(false);
		}
		expect(isPremisesName("FALLS ROAD SURGERY")).toBe(true);
		expect(isPremisesName("12 FALLS ROAD")).toBe(false);
		expect(isPremisesName("DR EXAMPLE SURGERY")).toBe(false);
	});

	it("show a practice named after a person under its premises, else its street", () => {
		expect(
			practiceDisplayName("DR A EXAMPLE", ["FICTIONAL MEDICAL CENTRE", "2 SAMPLE ROAD"], "X"),
		).toEqual({ name: "Fictional Medical Centre", minimised: true });
		expect(practiceDisplayName("MR B SAMPLE", ["9 PLACEHOLDER ROAD"], "Stockton")).toEqual({
			name: "9 Placeholder Road",
			minimised: true,
		});
		expect(practiceDisplayName("MR B SAMPLE", [], "STOCKTON")).toEqual({
			name: "Stockton",
			minimised: true,
		});
		expect(practiceDisplayName("THE EXAMPLE SURGERY", ["1 ROAD"], "X")).toEqual({
			name: "The Example Surgery",
			minimised: false,
		});
	});
});

describe("the ODS reports", () => {
	it("keep the active GP practices, never a person's name", () => {
		const result = parseOdsPractices("ods-gp", fixture("epraccur.csv"));
		expect(result.quarantined).toEqual([]);
		expect(result.skipped).toEqual({
			"not active": 1,
			"not a GP practice (other prescribing cost centre)": 1,
		});
		const byCode = new Map(result.rows.map((row) => [row.nationalId, row]));
		expect(byCode.get("A99001")).toMatchObject({
			idScheme: "GB-ODS-GP",
			professionCode: "GB_GP",
			name: "The Example Surgery",
			street: "Health Centre, Sample Street",
			town: "Stockton-on-Tees",
			postcode: "TS18 1ZA",
			phone: "+441632960001",
			main: true,
		});
		expect(byCode.get("A99002")).toMatchObject({
			name: "Fictional Medical Centre",
			minimised: true,
		});
		expect(byCode.get("A99009")).toMatchObject({ name: "9 Placeholder Road", minimised: true });
		expect(byCode.has("A99003")).toBe(false);
		expect(byCode.has("Y99004")).toBe(false);
		expect(byCode.get("A99008")?.localities).toEqual(["Yarm"]);
		expect(result.minimised).toBe(2);
		expect(JSON.stringify(result.rows)).not.toMatch(/EXAMPLE &|Example &|SAMPLE"|Mr B/);
	});

	it("keep the open branch surgeries as sites of their practice", () => {
		const result = parseOdsBranches(fixture("ebranchs.csv"));
		expect(result.skipped).toEqual({ closed: 1 });
		const branch = result.rows.find((row) => row.siteKey === "A9B1Z");
		expect(branch).toMatchObject({
			source: "gb-ods-branch",
			idScheme: "GB-ODS-GP",
			nationalId: "A99001",
			siteName: "Billingham Example Branch",
			main: false,
		});
	});

	it("leave out prisons and appliance contractors", () => {
		const dental = parseOdsPractices("ods-dent", fixture("egdpprac.csv"));
		expect(dental.skipped).toEqual({ "secure setting (prison, removal centre)": 1 });
		expect(dental.rows.find((row) => row.nationalId === "V99002")?.name).toBe(
			"11 Placeholder Road",
		);
		const pharmacies = parseOdsPractices("ods-pharm", fixture("edispensary.csv"));
		expect(pharmacies.skipped).toEqual({ "not a pharmacy (appliance contractor)": 1 });
		expect(pharmacies.rows[0]).toMatchObject({ nationalId: "FX001", name: "Example Pharmacy" });
	});

	it("quarantine a line of the wrong shape with its code only", () => {
		const result = parseOdsPractices(
			"ods-gp",
			'"A99001","DR A EXAMPLE","ROAD"\r\n' +
				`"A9",${Array.from({ length: 26 }, (_, index) => (index === 11 ? '"ACTIVE"' : index === 24 ? '"RO76"' : '""')).join(",")}\r\n`,
		);
		expect(result.quarantined.map((line) => line.sample)).toEqual(["A99001", "A9"]);
	});
});

describe("Public Health Scotland's lists", () => {
	it("read the GP practices, without the repeated name line", () => {
		const result = parsePhs("phs-gp", fixture("phs-gp.csv"));
		expect(result.rows).toHaveLength(42);
		expect(result.rows[0]).toMatchObject({
			idScheme: "GB-PHS-GP",
			nationalId: "89001",
			name: "Example Medical Centre",
			street: "1 Sample Street",
			town: "Glasgow",
			phone: "+441414960001",
		});
		expect(result.rows[1]).toMatchObject({ name: "Placeholder Health Centre", minimised: true });
	});

	it("read the dental practices with their council area", () => {
		const result = parsePhs("phs-dent", fixture("phs-dental.csv"));
		expect(result.rows[0]).toMatchObject({
			nationalId: "8901",
			name: "Example Dental Care",
			town: "Glasgow",
			localities: ["Shawlands"],
			postcode: "G41 9ZZ",
			ladCode: "S12000049",
		});
	});

	it("read the dispensers, `NA` lines dropped", () => {
		const result = parsePhs("phs-pharm", fixture("phs-dispensers.csv"));
		expect(result.rows[0]).toMatchObject({
			nationalId: "8999",
			name: "Example Chemists Ltd",
			street: "4 Sample Street",
			town: "Glasgow",
		});
	});

	it("fail on a missing column", () => {
		expect(() => parsePhs("phs-gp", "PracticeCode,Postcode\n1,G1 1ZZ\n")).toThrow(/missing/);
	});

	it("find the latest file of a dataset by the period its name gives", () => {
		expect(periodOfName("Dental Practices March 2026")).toBe(2026 * 12 + 2);
		expect(periodOfName("Dental Surgery List as at 30th September 2026")).toBe(2026 * 12 + 8);
		expect(periodOfName("readme")).toBeNull();
		const latest = latestResourceUrl(
			{
				result: {
					resources: [
						{
							name: "Dental Practices March 2026",
							format: "CSV",
							url: "a",
							created: "2026-05-26T08:49",
						},
						{
							name: "Dental Practices December 2025",
							format: "CSV",
							url: "b",
							created: "2026-05-26T08:51",
						},
						{
							name: "Dentist Contractor List March 2026",
							format: "CSV",
							url: "c",
							created: "2026-06-01",
						},
					],
				},
			},
			/dental practices/i,
		);
		expect(latest.url).toBe("a");
	});
});

describe("the Business Services Organisation's lists", () => {
	it("show a GP practice under its own name, never its partners'", () => {
		const result = parseBsoGp(fixture("bso-gp.csv"));
		expect(result.rows).toHaveLength(17);
		expect(result.rows[0]).toMatchObject({
			idScheme: "GB-BSO-GP",
			nationalId: "901",
			name: "Example Group Practice",
			minimised: true,
			street: "5 Sample Avenue, Belfast",
			town: "Belfast",
		});
		expect(JSON.stringify(result.rows)).not.toMatch(/Dr\.|PARTNERS|Partners/);
	});

	it("key a dental surgery by its address", () => {
		const result = parseBsoDental(fixture("bso-dental.csv"));
		expect(result.rows[0]).toMatchObject({
			idScheme: "GB-BSO-DENT",
			nationalId: niDentalKey("EXAMPLE DENTAL PRACTICE, 7 SAMPLE AVENUE, BELFAST", "BT9 9ZY"),
			name: "Example Dental Practice",
			street: "7 Sample Avenue",
			town: "Belfast",
			ladName: "Belfast",
			phone: "+442896496007",
		});
		expect(result.rows[1]).toMatchObject({ name: "8 Placeholder Street", town: "Newry" });
		expect(niDentalKey("1 Road, Town", "BT1 1AA")).toBe(niDentalKey("1 ROAD,  TOWN", "BT11AA"));
		expect(niDentalKey("1 Road, Town", "BT1 1AA")).toMatch(/^[0-9a-f]{10}$/);
	});
});

describe("UK places", () => {
	it("read the ONS lookup with each authority's region or nation", () => {
		const lads = parseLadLookup(JSON.parse(fixture("lad-lookup.json").toString("utf8")));
		expect(lads.find((lad) => lad.code === "E06000004")?.regionCode).toBe("E12000001");
		expect(lads.find((lad) => lad.code === "S12000049")?.regionCode).toBe("S92000003");
		expect(lads.find((lad) => lad.code === "N09000003")?.regionCode).toBe("N92000002");
		expect(() => parseLadLookup({ features: [] })).toThrow();
	});

	it("keep the cities, towns and villages of OS Open Names, in English", () => {
		const towns = readOpenNames(fixture("open-names.csv"));
		expect(towns.map((town) => town.name)).toEqual([
			"Stockton-on-Tees",
			"Yarm",
			"Billingham",
			"Birmingham",
			"Cardiff",
			"Glasgow",
			"Edinburgh",
		]);
		expect(towns.every((town) => town.srid === 27700)).toBe(true);
		const ni = readOsniTowns(fixture("osni-place-names.csv"));
		expect(ni.map((town) => [town.code, town.name, town.srid])).toContainEqual([
			"osni49",
			"Belfast",
			29903,
		]);
	});

	it("read only the wanted postcodes of Code-Point Open, located ones", () => {
		const points = readCodePoint(
			fixture("codepoint.csv"),
			new Set(["TS18 1ZA", "TS21 9ZZ", "XX1 1XX"]),
		);
		expect([...points.keys()]).toEqual(["TS18 1ZA"]);
		expect(points.get("TS18 1ZA")).toEqual({ x: 444600, y: 518900, ladCode: "E06000004" });
	});
});

describe("the UK batch", () => {
	it("groups practices and their branches, and drops branches of unknown practices", () => {
		const batch = buildGbBatch([
			parseOdsPractices("ods-gp", fixture("epraccur.csv")),
			parseOdsBranches(fixture("ebranchs.csv")),
		]);
		expect(batch.orphanBranches).toBe(1);
		const practice = batch.people.find((person) => person.national_id === "A99001");
		expect(practice).toMatchObject({
			name: "The Example Surgery",
			listing_slug: "gp-practices",
			slug: "the-example-surgery-a99001",
		});
		const activities = batch.activities.filter((activity) => activity.national_id === "A99001");
		expect(
			activities.map((activity) => [activity.source, activity.site_key, activity.is_main]),
		).toEqual([
			["gb-ods-gp", "A99001", true],
			["gb-ods-branch", "A9B1Z", false],
		]);
	});
});

describe("UK guards", () => {
	it("block an empty list and let an unusual change be approved", () => {
		const empty = checkGbSource(
			"ods-gp",
			{ lines: 10, rows: 10, people: 10, quarantined: 0, bytes: 2_000 },
			null,
		);
		expect(empty.find((check) => check.name === "ods-gp.rows")).toMatchObject({
			ok: false,
			approvable: false,
		});
		const shrunk = checkGbSource(
			"phs-gp",
			{ lines: 800, rows: 800, people: 800, quarantined: 0, bytes: 150_000 },
			{ lines: 880, rows: 880, people: 880, quarantined: 0, bytes: 150_000 },
		);
		expect(shrunk.find((check) => check.name === "phs-gp.practices")).toMatchObject({
			ok: false,
			approvable: true,
		});
		expect(
			checkGbPlaces({ sites: 100, placed: 97, britishSites: 90, located: 90 }).map(
				(check) => check.ok,
			),
		).toEqual([false, true]);
	});
});

describe("UK text files", () => {
	it("decode Windows-1252 when they are not UTF-8", () => {
		expect(decodeText(Buffer.from([0x4f, 0xd3]))).toBe("OÓ");
		expect(decodeText(Buffer.from("﻿abc", "utf8"))).toBe("abc");
		expect([...csvRecords('a,"b,c"\r\n\r\n"d\ne",f\n')].map((record) => record.fields)).toEqual([
			["a", "b,c"],
			["d\ne", "f"],
		]);
	});
});
