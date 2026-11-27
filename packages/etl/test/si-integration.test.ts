/**
 * End-to-end Slovenian import over the SYNTHETIC fixtures (`fixtures/generate-si.ts`), next to the
 * French ones, against a real PostgreSQL + PostGIS database with the migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when ETL_TEST_DATABASE_URL is
 * set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFixtures } from "../fixtures/generate";
import { generateSiFixtures, type SiFixtureOptions } from "../fixtures/generate-si";
import { buildFrOptions, buildSiOptions } from "../src/config";
import { runFr } from "../src/run-fr";
import { runSi } from "../src/run-si";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function siDir(options: SiFixtureOptions = {}): string {
	const dir = tempDir("si");
	generateSiFixtures(dir, options);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runSlovenia = (dir: string, flags: Record<string, string | true> = {}) =>
	runSi(buildSiOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

describe.skipIf(!url)("etl:si on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const dirs: string[] = [];
	const dir = (options: SiFixtureOptions = {}) => {
		const made = siDir(options);
		dirs.push(made);
		return made;
	};
	const base = dir();
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
	const doctor = async (id: string) => {
		const [row] = await sql<
			{
				id: number;
				slug: string;
				first_name: string;
				last_name: string;
				profession_code: string;
				listing_slug: string;
				status: string;
				indexable: boolean;
				missing_runs: number;
			}[]
		>`
			SELECT id, slug, first_name, last_name, profession_code, listing_slug, status, indexable,
				missing_runs
			FROM directory.practitioners WHERE country = 'SI' AND id_scheme = 'SI-ZZZS' AND national_id = ${id}
		`;
		return row;
	};
	const page = async (id: string) => {
		const [row] = await sql<{ payload: Record<string, unknown> }[]>`
			SELECT pg.payload FROM directory.practitioner_pages pg
			JOIN directory.practitioners p ON p.id = pg.practitioner_id
			WHERE p.country = 'SI' AND p.national_id = ${id}
		`;
		return row?.payload as
			| {
					activities: {
						source: string;
						modeCode: string | null;
						sectorCode: string | null;
						site: {
							name: string;
							addressLine: string;
							postcode: string;
							locality: string;
							placeName: string;
						};
					}[];
			  }
			| undefined;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		await sql`DELETE FROM directory.meta WHERE key = 'si:locator'`;
		expect((await runFrance(frDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
		for (const made of dirs) rmSync(made, { recursive: true, force: true });
	});

	it("imports the places, the locator and the three lists without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runSlovenia(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.sites).toBe(16);
		expect(totals.placed).toBe(16);
		expect(totals.byProfession).toEqual({
			SI_FAMILY_DOCTOR: 404,
			SI_CHILDREN_DOCTOR: 201,
			SI_GYNAECOLOGIST: 122,
			SI_DENTIST: 403,
		});
		expect(await snapshot("FR")).toEqual(france);
		expect(await count("directory.places WHERE country = 'SI' AND kind = 'department'")).toBe(12);
		expect(await count("directory.places WHERE country = 'SI' AND kind = 'commune'")).toBe(13);
		expect(await count("directory.meta WHERE key = 'si:locator'")).toBe(1);
		// The run records each list's own date, and the register's, for the pages' credits.
		const [run] = await sql<{ files: Record<string, { lastModified: string }> }[]>`
			SELECT files FROM directory.etl_runs WHERE source = 'si' ORDER BY id DESC LIMIT 1
		`;
		expect(run?.files["si-zzzs-sa"]?.lastModified).toBe("2026-11-26");
		expect(run?.files["si-zzzs-zob"]?.lastModified).toBe("2026-11-27");
		expect(run?.files["si-rpe"]?.lastModified).toBe("2026-11-20");
		// France's run keeps Slovenia as it is.
		const slovenia = await snapshot("SI");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("SI")).toEqual(slovenia);
	});

	it("names each doctor, and says at each practice whether they take new patients", async () => {
		expect(await doctor("90002")).toMatchObject({
			slug: "marko-zgled-si90002",
			first_name: "Marko",
			last_name: "Zgled",
			profession_code: "SI_CHILDREN_DOCTOR",
			listing_slug: "otroski-zdravnik",
			indexable: true,
		});
		const dentist = await page("90008");
		expect(dentist?.activities.map((a) => [a.sectorCode, a.modeCode, a.source])).toEqual([
			["404101", "accepting", "si-zzzs-zob"],
			["404103", "closed", "si-zzzs-zob"],
		]);
		expect(dentist?.activities[0]?.site).toMatchObject({
			name: "Primernik Ana - zasebna zobna ordinacija",
			addressLine: "Celjska cesta 24 b",
			postcode: "3212",
			locality: "Vojnik",
			placeName: "Vojnik",
		});
		// A village of Celje under Škofja vas's post office: the address says the post office.
		expect((await page("90003"))?.activities[0]?.site).toMatchObject({
			addressLine: "Zadobrova 49 b",
			locality: "Škofja vas",
			placeName: "Celje",
		});
		// Nothing the page does not need: no phone, no e-mail, no source column beyond the codes.
		expect(
			await count(
				"directory.sites WHERE source = 'si-zzzs' AND (phone IS NOT NULL OR email IS NOT NULL OR geo_precision <> 'city')",
			),
		).toBe(0);
		// Another market's pages carry no locality: their payload is as before migration 0033.
		expect(
			await count(
				"directory.practitioner_pages WHERE country = 'FR' AND payload::text LIKE '%\"locality\"%'",
			),
		).toBe(0);
	});

	it("lists Slovenia by statistical region and municipality", async () => {
		const listing = async (slug: string, kind: string, code: string) => {
			const [row] = await sql<{ n: number; indexable: boolean }[]>`
				SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id
				WHERE lp.listing_slug = ${slug} AND p.country = 'SI' AND p.kind = ${kind} AND p.code = ${code}
			`;
			return row;
		};
		expect((await listing("druzinski-zdravnik", "department", "8"))?.indexable).toBe(true);
		expect((await listing("druzinski-zdravnik", "commune", "61"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'zobozdravnik:si'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'SI'")).toBe(
			await count("directory.practitioners WHERE country = 'SI' AND status = 'active'"),
		);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runSlovenia(base)).status).toBe("skipped");
		const before = await snapshot("SI");
		const forced = await runSlovenia(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("SI")).toEqual(before);
		expect((await runSlovenia(base, { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("SI")).toEqual(before);
	});

	it("updates whether a doctor takes new patients, and keeps a list left out as it was", async () => {
		const changed = dir({ change: { "90001": { acceptance: "NE" } } });
		expect((await runSlovenia(changed)).status).toBe("succeeded");
		expect((await page("90001"))?.activities[0]?.modeCode).toBe("closed");
		// Without the dentists' list, its doctors are neither missing nor removed.
		const without = dir();
		rmSync(join(without, "zzzs-zob.xlsx"));
		const outcome = await runSlovenia(without);
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["zob"]);
		expect(await doctor("90008")).toMatchObject({ status: "active", missing_runs: 0 });
		// Turned off with --sources, a list keeps its rows and is no error.
		const off = await runSlovenia(base, { sources: "sa,gin", force: true });
		expect(off.sourceErrors).toEqual({});
		expect(await doctor("90008")).toMatchObject({ status: "active", missing_runs: 0 });
	});

	it("removes a doctor missing from their list twice, and honours an objection at once", async () => {
		const gone = dir({ without: ["90007"] });
		expect((await runSlovenia(gone, { force: true })).status).toBe("succeeded");
		expect(await doctor("90007")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runSlovenia(gone, { force: true })).status).toBe("succeeded");
		expect(await doctor("90007")).toMatchObject({ status: "removed", indexable: false });
		expect(await page("90007")).toBeUndefined();

		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('SI', 'SI-ZZZS', '90006', 'objection')
		`;
		expect((await runSlovenia(base, { force: true })).status).toBe("succeeded");
		expect(await page("90006")).toBeUndefined();
		expect(
			await count(
				"directory.practitioners WHERE country = 'SI' AND national_id = '90006' AND indexable",
			),
		).toBe(0);
	});
});
