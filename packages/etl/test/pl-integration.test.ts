/**
 * End-to-end Polish import over the SYNTHETIC fixtures (`fixtures/generate-pl.ts`), next to the
 * Czech one, against a real PostgreSQL + PostGIS database with the migrations applied.
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
import { PL_FACILITIES, type PlFixtureSet, writePlFixtures } from "../fixtures/generate-pl";
import { buildCzOptions, buildPlOptions } from "../src/config";
import { runCz } from "../src/run-cz";
import { runPl } from "../src/run-pl";

const url = process.env.ETL_TEST_DATABASE_URL;

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function plDir(set: PlFixtureSet = PL_FACILITIES): string {
	const dir = tempDir("pl");
	writePlFixtures(dir, set);
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		["as-of", "2026-11-27"],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runPoland = (dir: string, flags: Record<string, string | true> = {}) =>
	runPl(buildPlOptions(offline(dir, flags), env()), () => {});

const without = (id: number): PlFixtureSet => ({
	...PL_FACILITIES,
	cases: PL_FACILITIES.cases.filter((item) => item.id !== id),
});

describe.skipIf(!url)("etl:pl on synthetic fixtures, next to Czechia", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = plDir();

	const count = async (query: string) => {
		const [row] = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::integer AS n FROM ${query}`);
		return row?.n ?? 0;
	};
	const snapshot = async (country: string) => {
		const [row] = await sql<{ people: number; hash: string }[]>`
			SELECT count(*)::integer AS people,
				md5(string_agg(p.id || ':' || p.updated_at, ',' ORDER BY p.id)) AS hash
			FROM directory.practitioners p WHERE p.country = ${country}
		`;
		return row;
	};
	const establishment = async (id: string) => {
		const [row] = await sql<
			{
				slug: string;
				last_name: string;
				profession_code: string;
				primary_specialty_code: string | null;
				listing_slug: string;
				status: string;
				indexable: boolean;
				missing_runs: number;
			}[]
		>`
			SELECT slug, last_name, profession_code, primary_specialty_code, listing_slug, status,
				indexable, missing_runs
			FROM directory.practitioners WHERE country = 'PL' AND id_scheme = 'PL-RPWDL' AND national_id = ${id}
		`;
		return row;
	};
	const sitesOf = async (id: string) =>
		sql<
			{
				place: string;
				code: string;
				kind: string;
				precision: string | null;
				address_line: string;
				postcode: string;
				phone: string | null;
				name: string | null;
			}[]
		>`
			SELECT pl.name AS place, pl.code, pl.kind, s.geo_precision AS precision, s.address_line,
				s.postcode, s.phone, s.name
			FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'PL' AND p.national_id = ${id}
			ORDER BY s.address_line
		`;
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'PL' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		const cz = tempDir("cz");
		writeCzFixtures(cz);
		const czech = await runCz(
			buildCzOptions(
				new Map<string, string | true>([
					["source-dir", cz],
					["offline", true],
				]),
				env(),
			),
			() => {},
		);
		expect(czech.status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the register and its places without touching Czechia", async () => {
		const czech = await snapshot("CZ");
		const outcome = await runPoland(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.establishments).toBe(1_013);
		expect(totals.byProfession).toMatchObject({
			PL_HOSPITAL: 1,
			PL_PRIMARY_CARE: 3,
			PL_SPECIALIST: 2,
			PL_HOSPICE: 1,
			PL_DIAGNOSTICS: 4,
			PL_DENTAL: 1_002,
		});
		expect(outcome.stats.producedAt).toBe("2026-11-27");
		expect(await snapshot("CZ")).toEqual(czech);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'PL' AND kind = '${kind}'`);
		expect(await places("region")).toBe(3);
		expect(await places("department")).toBe(5);
		expect(await places("commune")).toBe(8);
		// The report's date is the file's: the time of production a page states.
		const [run] = await sql<{ produced: string }[]>`
			SELECT files -> 'rpwdl' ->> 'lastModified' AS produced FROM directory.etl_runs
			WHERE source = 'pl' AND status = 'succeeded' ORDER BY id DESC LIMIT 1
		`;
		expect(run?.produced).toBe("2026-11-27");
	});

	it("keeps an establishment's name and facts, and nothing of a natural person", async () => {
		expect(await establishment("900001")).toMatchObject({
			last_name: "Szpital Przykładowy",
			slug: "szpital-przykladowy-900001",
			profession_code: "PL_HOSPITAL",
			listing_slug: "szpitale",
			indexable: true,
		});
		expect(await establishment("900002")).toMatchObject({
			last_name: "Gabinet Stomatologiczny",
			listing_slug: "stomatologia",
		});
		expect((await establishment("900009"))?.last_name).toBe("Próbkowa 4, Czernichów");
		expect(await establishment("900003")).toMatchObject({
			primary_specialty_code: "kardiologia",
			listing_slug: "poradnie-kardiologiczne",
		});
		const facts = await sql<{ source: string; code: string; label: string | null }[]>`
			SELECT q.source, q.code, q.label FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'PL' AND p.national_id = '900001' ORDER BY q.source, q.code
		`;
		expect(facts).toEqual([
			{ source: "forma", code: "PUBLIC", label: null },
			{ source: "komorka", code: "4000", label: "Oddział chorób wewnętrznych" },
			{ source: "komorka", code: "4500", label: "Oddział chirurgiczny ogólny" },
			{ source: "komorka", code: "4902", label: "Szpitalny oddział ratunkowy" },
			{ source: "lozka", code: "ogolem", label: "50" },
			{
				source: "podmiot",
				code: "operator",
				label: "SZPITAL PRZYKŁADOWY SAMODZIELNY PUBLICZNY ZAKŁAD OPIEKI ZDROWOTNEJ",
			},
			{ source: "rodzaj", code: "1", label: null },
		]);
		// No operator for a natural person; no tax number, e-mail, website or seat anywhere.
		expect(
			await count(
				"directory.practitioner_qualifications q JOIN directory.practitioners p ON p.id = q.practitioner_id WHERE p.national_id = '900002' AND q.source = 'podmiot'",
			),
		).toBe(0);
		expect(
			await count(
				`directory.practitioners p JOIN directory.activities a ON a.practitioner_id = p.id
				JOIN directory.sites s ON s.id = a.site_id
				WHERE p.country = 'PL' AND (concat_ws('|', p.last_name, p.last_name_source, s.name,
					s.address_line) ~ '(Przykładowa$|Anna|Próbkowy|Siedzibowa|example\\.invalid)'
					OR s.email IS NOT NULL)`,
			),
		).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'pl' AND stats::text ~ 'Anna|Próbkowy'"),
		).toBe(0);
		// A laboratory's call centre is no collection point's number.
		expect(
			await count("directory.sites WHERE source = 'pl-rpwdl' AND phone = '+48229999999'"),
		).toBe(0);
	});

	it("places sites in their gmina by TERYT code, cities' parts in the city", async () => {
		expect(await sitesOf("900001")).toMatchObject([
			{ place: "Warszawa", code: "1465011", precision: "city", phone: "+48221234567" },
		]);
		expect(await sitesOf("900003")).toMatchObject([{ place: "Skawina", code: "1206113" }]);
		const clinic = await sitesOf("900004");
		expect(clinic.map((site) => [site.place, site.name])).toEqual([
			["Bolesławiec (gmina wiejska)", null],
			["Bolesławiec", "Punkt Wzorzec w Bolesławcu"],
		]);
		expect(await count("directory.sites WHERE source = 'pl-rpwdl' AND place_id IS NULL")).toBe(0);
	});

	it("lists by voivodeship, powiat and gmina, a city with powiat rights at its powiat", async () => {
		expect((await listing("stomatologia", "commune", "0262011"))?.indexable).toBe(true);
		expect((await listing("stomatologia", "department", "0262"))?.n).toBeGreaterThan(900);
		expect((await listing("stomatologia", "region", "02"))?.n).toBeGreaterThan(900);
		expect((await listing("przychodnie-poz", "department", "0201"))?.n).toBe(1);
		expect(await count("directory.landing_pages WHERE key = 'stomatologia:pl'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'PL'")).toBe(
			await count("directory.practitioners WHERE country = 'PL' AND status = 'active'"),
		);
	});

	it("skips an unchanged export, and a forced rerun changes nothing", async () => {
		expect((await runPoland(base)).status).toBe("skipped");
		const before = await snapshot("PL");
		const forced = await runPoland(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("PL")).toEqual(before);
	});

	it("fails on an export it cannot read and keeps the establishments as they are", async () => {
		const dir = plDir();
		writeFileSync(join(dir, "rpwdl.zip"), Buffer.alloc(5_000, 1));
		const outcome = await runPoland(dir, { force: true });
		expect(outcome.status).toBe("failed");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["rpwdl"]);
		expect(await count("directory.practitioners WHERE country = 'PL' AND missing_runs > 0")).toBe(
			0,
		);
	});

	it("removes an establishment after two consecutive runs without it", async () => {
		const dir = plDir(without(901_001));
		expect((await runPoland(dir, { force: true })).status).toBe("succeeded");
		expect(await establishment("901001")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runPoland(dir, { force: true })).status).toBe("succeeded");
		expect((await establishment("901001"))?.status).toBe("removed");
	});

	it("always honours an objection", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('PL', 'PL-RPWDL', '900005', 'objection (test)')
		`;
		const outcome = await runPoland(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(await establishment("900005")).toBeUndefined();
	});

	it("blocks a run that would modify more than 10% of Poland's pages until approved", async () => {
		const dir = plDir({ ...PL_FACILITIES, fillerStreetSuffix: " Zachodnia" });
		const blocked = await runPoland(dir);
		expect(blocked.status).toBe("blocked");
		const approved = await runPoland(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source = 'pl-rpwdl' AND address_line LIKE 'Wypełniająca Zachodnia %'",
			),
		).toBeGreaterThan(900);
	});
});
