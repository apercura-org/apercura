import { describe, expect, it } from "vitest";
import { CZ_FACILITIES, nrpzsCsv, ruianXml } from "../../../fixtures/generate-cz";
import { buildCzBatch } from "../../merge-cz";
import { MAX_PHONE_ROWS, nrpzsStreet, parseNrpzs, parseNrpzsPoint } from "./nrpzs";
import { buildCzPlaceRows, defaultCzPlacesUrls, parseRuianState } from "./places";

describe("the NRPZS export", () => {
	const result = parseNrpzs(nrpzsCsv());
	const byId = (id: string) => result.rows.find((row) => row.nationalId === id);

	it("imports the facility kinds patients visit and counts the others", () => {
		expect(result.lines).toBe(CZ_FACILITIES.cases.length + CZ_FACILITIES.outOfScope + 1);
		expect(result.rows).toHaveLength(CZ_FACILITIES.cases.length);
		expect(result.skipped["kind 102 (Nemocnice)"]).toBe(130);
		expect(Object.values(result.skipped).reduce((sum, n) => sum + n, 0)).toBe(650);
		expect(result.quarantined).toEqual([
			{ lineNo: result.lines + 1, reason: "invalid facility number", sample: "x1" },
		]);
	});

	it("reads a facility as the register publishes it, and nothing of its provider", () => {
		expect(byId("900001")).toEqual({
			lineNo: 2,
			nationalId: "900001",
			siteKey: "9900001",
			professionCode: "CZ_GP",
			name: "MUDr. Jana Ukázková",
			fields: [{ code: "vseobecne-prakticke-lekarstvi", label: "všeobecné praktické lékařství" }],
			specialtyCode: null,
			street: "Ukázková 1234/12",
			postcode: "120 00",
			city: "Praha 2",
			districtCode: "CZ0100",
			regionCode: "CZ010",
			latitude: 50.0755,
			longitude: 14.4378,
			phone: "+420222333444",
			naturalPerson: true,
		});
		const serialized = JSON.stringify(result.rows);
		for (const leak of ["99900001", "Zástupce", "example.invalid", "Domovská", "ds900001"]) {
			expect(serialized).not.toContain(leak);
		}
	});

	it("lists a specialist under its primary field and keeps all its fields", () => {
		expect(byId("900003")).toMatchObject({
			professionCode: "CZ_SPECIALIST",
			specialtyCode: "kardiologie",
			fields: [
				{ code: "kardiologie", label: "kardiologie" },
				{ code: "vnitrni-lekarstvi", label: "vnitřní lékařství" },
			],
		});
		expect(buildCzBatch(result).people.find((p) => p.national_id === "900003")).toMatchObject({
			listing_slug: "kardiolog",
			slug: "kardiologie-priklad-s-r-o-900003",
		});
	});

	it("writes a village address without a street, and leaves out a chain's shared number", () => {
		expect(byId("900004")?.street).toBe("Chocerady 15");
		const chain = result.rows.filter((row) => row.name.startsWith("Lékárny Vzorek"));
		expect(chain).toHaveLength(6);
		expect(chain.every((row) => row.phone === null)).toBe(true);
		expect(result.counters.sharedPhones).toBe(6);
		expect(MAX_PHONE_ROWS).toBe(3);
		expect(byId("913004")?.latitude).toBeNull();
		expect(result.counters.withoutPoint).toBe(1);
		expect(result.counters.naturalPersons).toBeGreaterThan(150);
	});

	it("reads points latitude first, inside Czechia only", () => {
		expect(parseNrpzsPoint("POINT(50.801188702801 14.411616575071)")).toEqual({
			latitude: 50.801188702801,
			longitude: 14.411616575071,
		});
		expect(parseNrpzsPoint("POINT(14.41 50.80)")).toBeNull();
		expect(parseNrpzsPoint("")).toBeNull();
		expect(nrpzsStreet("Lidická", "241", "Česká Kamenice")).toBe("Lidická 241");
		expect(nrpzsStreet("", "", "Obec")).toBeNull();
	});

	it("refuses a file that is not the register's", () => {
		expect(() => parseNrpzs('"a","b"\n1,2\n')).toThrow(/not the NRPZS export/);
		expect(() => parseNrpzs("")).toThrow(/empty file/);
	});
});

describe("RÚIAN's state file", () => {
	const sources = parseRuianState(ruianXml());

	it("names the regions, districts, municipalities and Prague districts", () => {
		expect(sources.regions).toHaveLength(14);
		expect(sources.districts).toHaveLength(5);
		expect(sources.municipalities.find((m) => m.code === "554782")).toEqual({
			code: "554782",
			name: "Praha",
			districtRuianCode: null,
			point: { x: -743100, y: -1043300 },
		});
		expect(sources.pragueDistricts).toHaveLength(22);
		expect(sources.date).toBe("2026-11-01T00:00:29");
		expect(() => parseRuianState("<xml/>")).toThrow(/not a RÚIAN state file/);
	});

	it("builds Czechia's places: Prague a district of its own, its districts arrondissements", () => {
		const point = { longitude: 14.4, latitude: 50.1 };
		const points = new Map<string, typeof point>([["c:554782", point]]);
		const rows = buildCzPlaceRows(sources, points, []);
		const find = (kind: string, code: string) =>
			rows.find((row) => row.kind === kind && row.code === code);
		expect(rows.filter((row) => row.kind === "region")).toHaveLength(14);
		expect(find("region", "CZ063")).toMatchObject({ slug: "kraj-vysocina", region_code: "CZ063" });
		expect(find("department", "CZ0100")).toMatchObject({
			name: "Praha",
			slug: "praha",
			region_code: "CZ010",
			parent_kind: "region",
			longitude: 14.4,
		});
		expect(find("department", "CZ0642")).toMatchObject({
			slug: "brno-mesto",
			region_code: "CZ064",
		});
		expect(find("commune", "554782")).toMatchObject({
			slug: "praha",
			department_code: "CZ0100",
			parent_code: "CZ0100",
		});
		expect(find("commune", "582786")).toMatchObject({
			slug: "brno",
			department_code: "CZ0642",
			region_code: "CZ064",
		});
		expect(find("commune", "569291")?.slug).toBe("pohled");
		expect(find("commune", "573591")?.slug).toBe("pohled-573591");
		expect(find("arrondissement", "27")).toMatchObject({
			name: "Praha 2",
			slug: "praha-2",
			department_code: "CZ0100",
			parent_kind: "commune",
			parent_code: "554782",
		});
		// A second import keeps every slug.
		const existing = rows.map((row) => ({
			kind: row.kind,
			code: row.code,
			name: row.name,
			slug: row.slug,
			departmentCode: row.department_code,
		}));
		expect(buildCzPlaceRows(sources, points, existing).map((row) => row.slug)).toEqual(
			rows.map((row) => row.slug),
		);
	});

	it("is downloaded for the last day of the previous month, then the month before", () => {
		expect(defaultCzPlacesUrls(new Date("2026-11-26T10:00:00Z"))).toEqual([
			"https://vdp.cuzk.gov.cz/vymenny_format/soucasna/20261031_ST_UZSZ.xml.zip",
			"https://vdp.cuzk.gov.cz/vymenny_format/soucasna/20260930_ST_UZSZ.xml.zip",
		]);
		expect(defaultCzPlacesUrls(new Date("2027-01-01T03:00:00Z"))[0]).toContain("20261231_");
	});
});
