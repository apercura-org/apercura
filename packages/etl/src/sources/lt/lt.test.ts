import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LT_INSTITUTIONS, writeLtFixtures } from "../../../fixtures/generate-lt";
import { LtAddressIndex, tidyAddress } from "./address";
import { checkLicencePage, PoliteClient, retryAfterMs, retryable, storeCsvUrl } from "./download";
import { isIndividualEnterprise, ltDisplayName, withoutPremises } from "./names";
import { buildLtPlaceRows, readLtAddressTables, readLtPlaceSources, wktRings } from "./places";
import { ltPageKey, parseVaspvt } from "./vaspvt";

const fixtures = () => {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-lt-unit-"));
	writeLtFixtures(dir);
	return dir;
};

describe("Lithuanian names", () => {
	it("abbreviate the legal form and keep the rest as registered", () => {
		expect(ltDisplayName("Uždaroji akcinė bendrovė „Pavyzdinė klinika“")).toEqual({
			name: "UAB „Pavyzdinė klinika“",
			abbreviated: true,
		});
		expect(ltDisplayName("Viešoji įstaiga  Pavyzdžio ligoninė").name).toBe(
			"VšĮ Pavyzdžio ligoninė",
		);
		expect(ltDisplayName("Mažoji bendrija „Pavyzdys“").name).toBe("MB „Pavyzdys“");
		expect(ltDisplayName("Vardenės Pavardenės individuali įmonė").name).toBe(
			"Vardenės Pavardenės IĮ",
		);
		expect(ltDisplayName("UAB „Pavyzdys“")).toEqual({ name: "UAB „Pavyzdys“", abbreviated: false });
		// A name that merely starts like a form stays whole.
		expect(ltDisplayName("Akcinė bendrovėlė").abbreviated).toBe(false);
		// The form alone is not abbreviated into nothing.
		expect(ltDisplayName("Viešoji įstaiga").name).toBe("Viešoji įstaiga");
	});

	it("tell an individual enterprise by its legal form or its name", () => {
		expect(isIndividualEnterprise("810", "Pavyzdys")).toBe(true);
		expect(isIndividualEnterprise(null, "Vardenės Pavardenės individuali įmonė")).toBe(true);
		expect(isIndividualEnterprise(null, "Vardenės Pavardenės IĮ")).toBe(true);
		expect(isIndividualEnterprise(null, "IĮ „Pavyzdys“")).toBe(true);
		expect(isIndividualEnterprise("310", "UAB „Pavyzdys“")).toBe(false);
	});

	it("leave out a premises number, never a street's own number", () => {
		expect(withoutPremises("Pavyzdžio g. 5-207")).toBe("Pavyzdžio g. 5");
		expect(withoutPremises("Pavyzdžio g. 3-114, 115, 116")).toBe("Pavyzdžio g. 3");
		expect(withoutPremises("Pavyzdžio g. 5F-5")).toBe("Pavyzdžio g. 5F");
		expect(withoutPremises("Vasario 16-osios g. 1-5")).toBe("Vasario 16-osios g. 1");
		expect(withoutPremises("Kovo 11-osios g. 22")).toBeNull();
		expect(withoutPremises("Pavyzdžio g. 12")).toBeNull();
	});
});

describe("Lithuanian page keys", () => {
	it("are the institution's number and the address code, or the address GUID's start", () => {
		expect(ltPageKey("5271", "12679435", "00141024-769C-EB11-8251-005056BF0108")).toBe(
			"5271-12679435",
		);
		expect(ltPageKey("5271", "", "00141024-769C-EB11-8251-005056BF0108")).toBe("5271-v00141024");
		expect(ltPageKey("5271", "0", "ZZ")).toBeNull();
	});
});

describe("placing a Lithuanian address", async () => {
	const index = new LtAddressIndex(await readLtAddressTables(fixtures()));
	const placed = (text: string) => {
		const result = index.place(text);
		return (
			result && {
				municipality: result.municipality.code,
				settlement: result.settlement?.code ?? null,
				street: result.street,
				postcode: result.postcode,
			}
		);
	};

	it("reads both styles of the register", () => {
		expect(placed("Vilniaus apskr. Vilniaus miesto sav. Vilniaus m. Pavyzdžio g. 12-3")).toEqual({
			municipality: "13",
			settlement: "31003",
			street: "Pavyzdžio g. 12-3",
			postcode: null,
		});
		expect(placed("Kauno m.sav., Kauno m., Bandymų g. 5-207")).toMatchObject({
			municipality: "19",
			settlement: "17507",
			street: "Bandymų g. 5-207",
		});
		expect(tidyAddress("Kauno m..sav. , Kauno m.")).toBe("Kauno m. sav., Kauno m.");
	});

	it("tells two villages of one name apart by their eldership, else only the municipality", () => {
		expect(placed("Vilniaus r. sav., Bandymų sen., Pavyzdžių k., Liepų g. 1")).toMatchObject({
			settlement: "90002",
			street: "Liepų g. 1",
		});
		expect(
			placed("Vilniaus apskr. Vilniaus rajono sav. Pavyzdžio sen. Pavyzdžių k. Liepų g. 1"),
		).toMatchObject({
			settlement: "90001",
		});
		expect(placed("Vilniaus r. sav., Pavyzdžių k., Mokyklos g. 2")).toMatchObject({
			municipality: "41",
			settlement: null,
			street: "Pavyzdžių k., Mokyklos g. 2",
		});
	});

	it("reads a settlement in the nominative, the town before a village of the same name", () => {
		expect(placed("Birštono sav., Birštonas, Pavyzdžio g. 3")).toMatchObject({
			municipality: "12",
			settlement: "12016",
			street: "Pavyzdžio g. 3",
		});
		// A repeated settlement name is not the street.
		expect(placed("Kauno m. sav., Kauno m., Kauno, Draugystės g. 17")).toMatchObject({
			street: "Draugystės g. 17",
		});
	});

	it("finds a city named outside the municipality written, and takes out a postcode", () => {
		expect(placed("Kauno r. sav., Kauno m., Pavyzdžio g. 1, LT-44001")).toMatchObject({
			municipality: "19",
			settlement: "17507",
			street: "Pavyzdžio g. 1",
			postcode: "LT-44001",
		});
		expect(placed("Pavyzdžio miesto sen., Klaipėdos m., Uosto g. 1")).toMatchObject({
			municipality: "21",
			settlement: "18067",
		});
	});

	it("places nothing abroad", () => {
		expect(placed("Ryga, Pavyzdžio iela 1")).toBeNull();
		expect(placed("Pavyzdžio g. 1")).toBeNull();
	});
});

describe("the Address Register's places", () => {
	it("reads LKS-94 rings written northing first", () => {
		expect(
			wktRings("POLYGON ((6061000 582000, 6061000 583000, 6062000 583000, 6061000 582000))"),
		).toEqual([
			[
				{ x: 582_000, y: 6_061_000 },
				{ x: 583_000, y: 6_061_000 },
				{ x: 583_000, y: 6_062_000 },
				{ x: 582_000, y: 6_061_000 },
			],
		]);
		expect(
			wktRings("MULTIPOLYGON (((1 2, 3 4, 5 6, 1 2)), ((7 8, 9 10, 11 12, 7 8)))"),
		).toHaveLength(2);
		expect(wktRings("")).toEqual([]);
	});

	it("names counties and municipalities, and a village sharing a town's name its eldership", async () => {
		const sources = await readLtPlaceSources(fixtures());
		const rows = buildLtPlaceRows(sources, new Map(), []);
		const of = (kind: string, code: string) =>
			rows.find((row) => row.kind === kind && row.code === code);
		expect(of("region", "10")).toMatchObject({
			name: "Vilniaus apskritis",
			slug: "vilniaus-apskritis",
		});
		expect(of("department", "13")).toMatchObject({
			name: "Vilniaus miesto savivaldybė",
			slug: "vilniaus-miesto-savivaldybe",
			region_code: "10",
			parent_kind: "region",
		});
		expect(of("department", "12")?.name).toBe("Birštono savivaldybė");
		expect(of("commune", "31003")).toMatchObject({
			name: "Vilnius",
			slug: "vilnius",
			department_code: "13",
		});
		// The town keeps its name; the villages that share one name their eldership.
		expect(of("commune", "12016")).toMatchObject({ name: "Birštonas", slug: "birstonas" });
		expect(of("commune", "90001")).toMatchObject({
			name: "Pavyzdžiai (Pavyzdžio sen.)",
			slug: "pavyzdziai-pavyzdzio-sen",
		});
		expect(of("commune", "90002")?.slug).toBe("pavyzdziai-bandymu-sen");
		// A settlement the register closed is not a place.
		expect(of("commune", "90009")).toBeUndefined();
		// A village of another municipality keeps the capital's name: the search tells them apart.
		expect(of("commune", "90010")).toMatchObject({
			name: "Vilnius",
			slug: "vilnius",
			department_code: "52",
		});
		expect(sources.points.size).toBe(12);
	});
});

describe("VASPVT's licence register", () => {
	it("makes a page of each current activity address, and nothing of the rest", async () => {
		const dir = fixtures();
		const result = await parseVaspvt(dir, new LtAddressIndex(await readLtAddressTables(dir)));
		// Every case but the four left out (no place of care, suspended, revoked, abroad), plus a second address.
		const pages = LT_INSTITUTIONS.cases.length - 4 + 1;
		expect(result.rows).toHaveLength(pages);
		expect(result.lines).toBe(1045);
		expect(result.skipped).toEqual({
			"licence suspended": 1,
			"no current licence": 701,
			"not a place of care": 1,
		});
		expect(result.quarantined.map((line) => line.reason)).toEqual(["municipality unknown"]);
		expect(result.counters).toMatchObject({
			individualEnterprises: 1,
			premisesDropped: 1,
			mergedDuplicates: 1,
			namesFromLicence: 1,
			inMunicipality: 1,
		});
		const row = (key: string) => result.rows.find((item) => item.nationalId === key);
		expect(row("9000-90000001")).toMatchObject({
			name: "UAB „Pavyzdinė klinika“",
			professionCode: "LT_SPECIALIST",
			street: "Pavyzdžio g. 12-3",
			city: "Vilnius",
			settlementCode: "31003",
			services: [
				{ code: "42", label: "Dermatovenerologija" },
				{ code: "48", label: "Odontologija" },
				{ code: "41", label: "Suaugusiųjų kardiologija" },
			],
		});
		expect(row("9001-90000002")).toMatchObject({
			name: "Vardenės Pavardenės IĮ",
			professionCode: "LT_NURSING",
			street: "Bandymų g. 5",
		});
		expect(row("9002-90000003")?.professionCode).toBe("LT_HOSPITAL");
		expect(row("9002-v90020001")?.professionCode).toBe("LT_SPECIALIST");
		expect(row("9004-90000005")).toMatchObject({
			name: "VšĮ Pavyzdžio šeimos klinika",
			professionCode: "LT_PRIMARY_CARE",
			city: "Birštonas",
		});
		expect(
			row("9009-90000010")
				?.services.map((item) => item.code)
				.sort(),
		).toEqual(["110", "70"]);
		expect(row("9010-90000011")).toMatchObject({
			settlementCode: null,
			municipalityCode: "41",
			city: "Vilniaus rajono savivaldybė",
		});
		// The legal entity code, the seat and the licence number are never read.
		expect(JSON.stringify(result)).not.toMatch(/999009|Buveinės|L-99/);
	});
});

describe("the polite downloader", () => {
	it("retries only too many requests and server errors", () => {
		expect(retryable(429)).toBe(true);
		expect(retryable(503)).toBe(true);
		expect(retryable(404)).toBe(false);
		expect(retryAfterMs("30")).toBe(30_000);
		expect(retryAfterMs("Thu, 01 Jan 2026 00:01:00 GMT", Date.UTC(2026, 0, 1))).toBe(60_000);
		expect(retryAfterMs("soon")).toBeNull();
	});

	it("spaces requests, waits as long as Retry-After asks, and gives up on a 404", async () => {
		let now = 0;
		const waits: number[] = [];
		const answers = [
			new Response("", { status: 429, headers: { "retry-after": "90" } }),
			new Response("ok", { status: 200 }),
			new Response("", { status: 404 }),
		];
		const urls: string[] = [];
		const client = new PoliteClient({
			intervalMs: 20_000,
			attempts: 3,
			now: () => now,
			sleep: async (ms) => {
				waits.push(ms);
				now += ms;
			},
			fetch: (async (url: string) => {
				urls.push(url);
				return answers.shift() ?? new Response("", { status: 500 });
			}) as unknown as typeof fetch,
		});
		expect(await client.text("https://example.invalid/a")).toBe("ok");
		// The 429 asked for 90 s, more than the interval.
		expect(waits).toEqual([90_000]);
		await expect(client.text("https://example.invalid/b")).rejects.toThrow(/answered 404/);
		// The next request waited for the interval after the previous one.
		expect(waits).toEqual([90_000, 20_000]);
		expect(client.requests).toBe(3);
	});

	it("gives up after its attempts", async () => {
		const client = new PoliteClient({
			intervalMs: 1_000,
			attempts: 2,
			sleep: async () => {},
			fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
		});
		await expect(client.text("https://example.invalid/c")).rejects.toThrow(/429 after 2 attempts/);
	});

	it("asks the store for the columns it reads", () => {
		expect(
			storeCsvUrl("https://get.data.gov.lt/datasets/gov/vaspvt/licencijos/", "Paslauga", [
				"paslaugos_id",
				"pavadinimas",
			]),
		).toBe(
			"https://get.data.gov.lt/datasets/gov/vaspvt/licencijos/Paslauga/:format/csv?select(paslaugos_id,pavadinimas)",
		);
		expect(storeCsvUrl("https://get.data.gov.lt/datasets/gov/rc/ar", "apskritis/Apskritis")).toBe(
			"https://get.data.gov.lt/datasets/gov/rc/ar/apskritis/Apskritis/:format/csv",
		);
	});

	it("checks the dataset page still names the CC BY 4.0", () => {
		const page = (licence: string) =>
			`<div><span>Licencija</span> <a href="#">${licence}</a></div><div>Katalogas ADP</div>`;
		expect(() => checkLicencePage(page("Creative Commons Attribution 4.0"))).not.toThrow();
		expect(() => checkLicencePage(page("Kita licencija"))).toThrow(/not Creative Commons/);
		expect(() => checkLicencePage("<p>nothing</p>")).toThrow(/\(none\)/);
	});
});
