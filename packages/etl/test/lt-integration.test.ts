/**
 * End-to-end Lithuanian import over the SYNTHETIC fixtures (`fixtures/generate-lt.ts`), next to
 * the Czech one, against a real PostgreSQL + PostGIS database with the migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when ETL_TEST_DATABASE_URL is
 * set (CI sets it to a throwaway service container).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeCzFixtures } from "../fixtures/generate-cz";
import {
	LT_ANCHORS,
	LT_INSTITUTIONS,
	type LtFixtureSet,
	ltFillers,
	writeLtFixtures,
} from "../fixtures/generate-lt";
import { buildCzOptions, buildLtOptions } from "../src/config";
import { runCz } from "../src/run-cz";
import { runLt } from "../src/run-lt";

const url = process.env.ETL_TEST_DATABASE_URL;

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function ltDir(set: LtFixtureSet = LT_INSTITUTIONS): string {
	const dir = tempDir("lt");
	writeLtFixtures(dir, set);
	return dir;
}

function czDir(): string {
	const dir = tempDir("cz");
	writeCzFixtures(dir);
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runLithuania = (dir: string, flags: Record<string, string | true> = {}) =>
	runLt(buildLtOptions(offline(dir, flags), env()), () => {});
const runCzechia = (dir: string, flags: Record<string, string | true> = {}) =>
	runCz(buildCzOptions(offline(dir, flags), env()), () => {});

/** The fixtures without one institution. */
const without = (id: number): LtFixtureSet => ({
	...LT_INSTITUTIONS,
	cases: LT_INSTITUTIONS.cases.filter((item) => item.id !== id),
});

describe.skipIf(!url)("etl:lt on synthetic fixtures, next to Czechia", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = ltDir();

	const count = async (query: string) => {
		const [row] = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::integer AS n FROM ${query}`);
		return row?.n ?? 0;
	};
	const snapshot = async (country: string) => {
		const [row] = await sql<{ people: number; indexable: number; pages: number; hash: string }[]>`
			SELECT count(*)::integer AS people, count(*) FILTER (WHERE p.indexable)::integer AS indexable,
				(SELECT count(*) FROM directory.practitioner_pages WHERE country = ${country})::integer AS pages,
				md5(string_agg(p.id || ':' || p.updated_at, ',' ORDER BY p.id)) AS hash
			FROM directory.practitioners p WHERE p.country = ${country}
		`;
		return row;
	};
	const page = async (id: string) => {
		const [row] = await sql<
			{
				slug: string;
				last_name: string;
				first_name: string;
				profession_code: string;
				listing_slug: string;
				status: string;
				indexable: boolean;
				missing_runs: number;
			}[]
		>`
			SELECT slug, last_name, first_name, profession_code, listing_slug, status, indexable,
				missing_runs
			FROM directory.practitioners WHERE country = 'LT' AND id_scheme = 'LT-VASPVT' AND national_id = ${id}
		`;
		return row;
	};
	const siteOf = async (key: string) => {
		const [row] = await sql<
			{
				place: string | null;
				kind: string | null;
				code: string | null;
				precision: string | null;
				geo_source: string | null;
				lat: number | null;
				address_line: string | null;
				commune_label: string | null;
				postcode: string | null;
				phone: string | null;
			}[]
		>`
			SELECT p.name AS place, p.kind, p.code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, s.address_line, s.commune_label, s.postcode, s.phone
			FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
			WHERE s.source = 'lt-vaspvt' AND s.source_key = ${key}
		`;
		return row;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'LT' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runCzechia(czDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the register and its places without touching Czechia", async () => {
		const czech = await snapshot("CZ");
		const outcome = await runLithuania(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.facilities).toBe(340);
		expect(totals.byProfession).toMatchObject({
			LT_HOSPITAL: 1,
			LT_PRIMARY_CARE: 42,
			LT_NURSING: 44,
			LT_LABORATORY: 42,
			LT_OPTOMETRY: 1,
		});
		expect(await snapshot("CZ")).toEqual(czech);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'LT' AND kind = '${kind}'`);
		expect(await places("region")).toBe(10);
		expect(await places("department")).toBe(6);
		expect(await places("commune")).toBe(12);
		// Czechia's run keeps Lithuania as it is.
		const lithuania = await snapshot("LT");
		expect((await runCzechia(czDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("LT")).toEqual(lithuania);
	});

	it("keeps an institution's registered name and services, and nothing of its seat or code", async () => {
		expect(await page("9000-90000001")).toMatchObject({
			last_name: "UAB „Pavyzdinė klinika“",
			first_name: "",
			slug: "uab-pavyzdine-klinika-9000-90000001",
			profession_code: "LT_SPECIALIST",
			listing_slug: "medicinos-centrai",
			indexable: true,
		});
		expect(await page("9001-90000002")).toMatchObject({
			last_name: "Vardenės Pavardenės IĮ",
			listing_slug: "slauga",
		});
		expect((await page("9004-90000005"))?.last_name).toBe("VšĮ Pavyzdžio šeimos klinika");
		const services = await sql<{ code: string; label: string; source: string }[]>`
			SELECT q.code, q.label, q.source FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'LT' AND p.national_id = '9000-90000001' ORDER BY q.code
		`;
		expect(services).toEqual([
			{ code: "41", label: "Suaugusiųjų kardiologija", source: "paslauga" },
			{ code: "42", label: "Dermatovenerologija", source: "paslauga" },
			{ code: "48", label: "Odontologija", source: "paslauga" },
		]);
		// The legal entity code, the seat address and the licence number are never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'LT' AND (
				concat_ws('|', p.national_id, p.last_name, p.last_name_source, s.address_line, s.name,
					s.legal_name, s.trade_name) ~ '(999\\d{6}|Buveinės|L-99)'
				OR s.email IS NOT NULL OR s.phone IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'lt' AND stats::text ~ 'Pavardenės|Buveinės'"),
		).toBe(0);
	});

	it("places each page in its settlement at city precision, an individual enterprise without its premises", async () => {
		expect(await siteOf("9001-90000002")).toMatchObject({
			place: "Kaunas",
			kind: "commune",
			code: "17507",
			precision: "city",
			geo_source: "centroid",
			address_line: "Bandymų g. 5",
			commune_label: "Kaunas",
			postcode: null,
			phone: null,
		});
		expect((await siteOf("9001-90000002"))?.lat).toBeGreaterThan(54);
		// A company's premises number stays.
		expect((await siteOf("9000-90000001"))?.address_line).toBe("Pavyzdžio g. 12-3");
		expect(await siteOf("9003-90000004")).toMatchObject({
			place: "Pavyzdžiai (Bandymų sen.)",
			address_line: "Liepų g. 1",
		});
		// Two villages of one name and no eldership: the municipality only, the village kept.
		expect(await siteOf("9010-90000011")).toMatchObject({
			place: "Vilniaus rajono savivaldybė",
			kind: "department",
			address_line: "Pavyzdžių k., Mokyklos g. 2",
		});
		expect((await siteOf("9002-v90020001"))?.place).toBe("Klaipėda");
		expect(await count("directory.sites WHERE source = 'lt-vaspvt' AND place_id IS NULL")).toBe(0);
		// Left out: public health only, a suspended or revoked licence, an address abroad.
		for (const id of ["9005-90000006", "9006-90000007", "9007-90000008"]) {
			expect(await page(id), id).toBeUndefined();
		}
		expect(
			await count("directory.practitioners WHERE country = 'LT' AND national_id LIKE '9008-%'"),
		).toBe(0);
	});

	it("lists by county, municipality and settlement, a city municipality's city never indexed", async () => {
		expect((await listing("odontologijos-klinikos", "region", "10"))?.indexable).toBe(true);
		expect((await listing("odontologijos-klinikos", "department", "13"))?.indexable).toBe(true);
		expect((await listing("odontologijos-klinikos", "commune", "31003"))?.indexable).toBe(false);
		expect((await listing("odontologijos-klinikos", "commune", "90005"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'odontologijos-klinikos:lt'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'LT'")).toBe(
			await count("directory.practitioners WHERE country = 'LT' AND status = 'active'"),
		);
		expect(await count("directory.practitioner_pages WHERE country = 'LT'")).toBe(340);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runLithuania(base)).status).toBe("skipped");
		const before = await snapshot("LT");
		const forced = await runLithuania(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("LT")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("LT");
		expect((await runLithuania(ltDir(without(9100)), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("LT")).toEqual(before);
	});

	it("fails on a register it cannot read and keeps the pages as they are", async () => {
		const dir = ltDir();
		writeFileSync(
			join(dir, "vaspvt_IstaigosPaslauga.csv"),
			"not,the,expected,columns\n".repeat(3000),
		);
		const outcome = await runLithuania(dir, { force: true });
		expect(outcome.status).toBe("failed");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["vaspvt"]);
		expect(await count("directory.practitioners WHERE country = 'LT' AND missing_runs > 0")).toBe(
			0,
		);
	});

	it("removes a page after two consecutive runs without it", async () => {
		const dir = ltDir(without(9100));
		expect((await runLithuania(dir, { force: true })).status).toBe("succeeded");
		expect(await page("9100-91000000")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runLithuania(dir, { force: true })).status).toBe("succeeded");
		expect((await page("9100-91000000"))?.status).toBe("removed");
		expect((await runLithuania(base, { force: true })).status).toBe("succeeded");
	});

	it("always honours an objection: the page is dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('LT', 'LT-VASPVT', '9001-90000002', 'objection (test)')
		`;
		const outcome = await runLithuania(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			vaspvt: { idScheme: "LT-VASPVT", ids: 1, lines: 1 },
		});
		expect(await page("9001-90000002")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'lt-vaspvt' AND source_key = '9001-90000002'"),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Lithuania's pages until approved", async () => {
		const dir = ltDir({
			...LT_INSTITUTIONS,
			cases: [...LT_ANCHORS, ...ltFillers(330, " Naujoji")],
		});
		const blocked = await runLithuania(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE address_line LIKE 'Užpildo Naujoji g.%'")).toBe(0);
		const approved = await runLithuania(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source = 'lt-vaspvt' AND address_line LIKE 'Užpildo Naujoji g.%'",
			),
		).toBeGreaterThan(300);
	});
});
