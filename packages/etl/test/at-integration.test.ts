/**
 * End-to-end Austrian import over the SYNTHETIC fixtures (`fixtures/generate-at.ts`),
 * next to the French one, against a real PostgreSQL + PostGIS database with the
 * migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when
 * ETL_TEST_DATABASE_URL is set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFixtures } from "../fixtures/generate";
import { AT_PEOPLE, type AtFixtureSet, writeAtFixtures } from "../fixtures/generate-at";
import { buildAtOptions, buildFrOptions } from "../src/config";
import { runAt } from "../src/run-at";
import { runFr } from "../src/run-fr";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

function atDir(people: AtFixtureSet = AT_PEOPLE): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-at-test-"));
	writeAtFixtures(dir, people);
	return dir;
}

function frDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-fr-test-"));
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

const runAustria = (dir: string, flags: Record<string, string | true> = {}) =>
	runAt(
		buildAtOptions(
			new Map<string, string | true>([
				["source-dir", dir],
				["offline", true],
				...Object.entries(flags),
			]),
			{ DATABASE_URL_ETL: url },
		),
		() => {},
	);

const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(
		buildFrOptions(
			new Map<string, string | true>([
				["source-dir", dir],
				["offline", true],
				...Object.entries(flags),
			]),
			{ DATABASE_URL_ETL: url },
		),
		() => {},
	);

describe.skipIf(!url)("etl:at on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = atDir();

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

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the four lists without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runAustria(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.bySource).toEqual({
			"AT-WIEN": 1105,
			"AT-STMK": 602,
			"AT-SBG": 352,
			"AT-SBGZ": 62,
		});
		expect(await snapshot("FR")).toEqual(france);
		expect(await count("directory.places WHERE country = 'AT' AND kind = 'department'")).toBe(9);
		// France's own run keeps Austria as it is.
		const austria = await snapshot("AT");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("AT")).toEqual(austria);
	});

	it("places practices by Vienna district, town name and nearest Gemeinde", async () => {
		const placeOf = async (sourceKey: string) => {
			const [row] = await sql<
				{ code: string; kind: string; precision: string; lat: number; lon: number }[]
			>`
				SELECT p.code, p.kind, s.geo_precision AS precision,
					ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon
				FROM directory.sites s JOIN directory.places p ON p.id = s.place_id
				WHERE s.source_key = ${sourceKey}
			`;
			return row;
		};
		expect(await placeOf("900001/1")).toMatchObject({ code: "90901", kind: "arrondissement" });
		expect(await placeOf("900001/2")).toMatchObject({ code: "91901", kind: "arrondissement" });
		expect(await placeOf("800001/9900001")).toMatchObject({ code: "60101", precision: "address" });
		// "Feldkirchen" names no Gemeinde: the nearest centre is Feldkirchen bei Graz's.
		expect(await placeOf("800001/9900002")).toMatchObject({ code: "60608" });
		// Salzburg's EPSG:31258 point, transformed to WGS 84 by PostGIS.
		const salzburg = await sql<{ lat: number; lon: number }[]>`
			SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon
			FROM directory.sites WHERE source = 'at-sbg' AND source_key LIKE '%/9800001'
		`;
		expect(salzburg[0]?.lat).toBeGreaterThan(47.7);
		expect(salzburg[0]?.lat).toBeLessThan(47.9);
		expect(salzburg[0]?.lon).toBeGreaterThan(12.9);
		expect(salzburg[0]?.lon).toBeLessThan(13.2);
		expect(await count("directory.sites WHERE source LIKE 'at-%' AND place_id IS NULL")).toBe(0);
	});

	it("builds Austria's read models under its own country", async () => {
		const [anna] = await sql<
			{ slug: string; listing_slug: string; country: string; indexable: boolean }[]
		>`
			SELECT p.slug, p.listing_slug, pg.country, pg.indexable
			FROM directory.practitioners p JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
			WHERE p.country = 'AT' AND p.id_scheme = 'AT-WIEN' AND p.national_id = '900001'
		`;
		expect(anna).toEqual({
			slug: "anna-beispiel-w900001",
			listing_slug: "allgemeinmedizin",
			country: "AT",
			indexable: true,
		});
		const [listing] = await sql<{ country: string; indexable: boolean }[]>`
			SELECT country, indexable FROM directory.landing_pages WHERE key = 'allgemeinmedizin:at'
		`;
		expect(listing).toEqual({ country: "AT", indexable: true });
		// Vienna's city page is its Bundesland's, like Paris's.
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.country = 'AT' AND p.code = '90001'",
			),
		).toBe(0);
		expect(await count("directory.landing_pages WHERE country = 'AT' AND key LIKE '%:fr'")).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'AT'")).toBe(
			await count("directory.practitioners WHERE country = 'AT' AND status = 'active'"),
		);
		const [quals] = await sql<{ codes: string[] }[]>`
			SELECT array_agg(q.code ORDER BY q.code) AS codes FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.id_scheme = 'AT-WIEN' AND p.national_id = '900002'
		`;
		expect(quals?.codes).toEqual(["allgemeinmedizin", "innere-medizin-und-kardiologie"]);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runAustria(base)).status).toBe("skipped");
		const before = await snapshot("AT");
		const forced = await runAustria(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("AT")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("AT");
		const people = { ...AT_PEOPLE, wien: AT_PEOPLE.wien.filter((row) => row.id !== 900003) };
		expect((await runAustria(atDir(people), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("AT")).toEqual(before);
	});

	it("leaves out a list it cannot read and keeps its people as they are", async () => {
		const dir = atDir();
		writeFileSync(
			join(dir, "steiermark.zip"),
			"not a zip archive, but long enough to pass the size floor".repeat(30),
		);
		const outcome = await runAustria(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["stmk"]);
		expect(
			await count("directory.practitioners WHERE id_scheme = 'AT-STMK' AND missing_runs > 0"),
		).toBe(0);
		expect(
			await count("directory.practitioners WHERE id_scheme = 'AT-STMK' AND status = 'active'"),
		).toBe(602);
	});

	it("removes a doctor after two consecutive runs without them", async () => {
		const people = { ...AT_PEOPLE, wien: AT_PEOPLE.wien.filter((row) => row.id !== 900003) };
		const dir = atDir(people);
		expect((await runAustria(dir, { force: true })).status).toBe("succeeded");
		const [first] = await sql<{ status: string; missing_runs: number }[]>`
			SELECT status, missing_runs FROM directory.practitioners
			WHERE country = 'AT' AND id_scheme = 'AT-WIEN' AND national_id = '900003'
		`;
		expect(first).toEqual({ status: "active", missing_runs: 1 });
		expect((await runAustria(dir, { force: true })).status).toBe("succeeded");
		const [second] = await sql<{ status: string }[]>`
			SELECT status FROM directory.practitioners
			WHERE country = 'AT' AND id_scheme = 'AT-WIEN' AND national_id = '900003'
		`;
		expect(second?.status).toBe("removed");
		expect(
			await count(
				"directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.slug = 'juergen-fiktiv-weiss-w900003'",
			),
		).toBe(0);
	});

	it("always honours an objection: the lines are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('AT', 'AT-WIEN', '900004', 'objection (test)')
		`;
		const outcome = await runAustria(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		// Dropped before staging, counted as the list holds them (no shrinking-list guard).
		expect(outcome.stats.suppressedLines).toMatchObject({
			wien: { idScheme: "AT-WIEN", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		// Only the suppression is kept: no practitioner row, page, practice or search entry.
		expect(
			await count(
				"directory.practitioners WHERE country = 'AT' AND id_scheme = 'AT-WIEN' AND national_id = '900004'",
			),
		).toBe(0);
		expect(
			await count("directory.practitioner_pages WHERE slug = 'maria-von-exempel-w900004'"),
		).toBe(0);
		expect(
			await count("directory.sites WHERE source = 'at-wien' AND source_key = '900004/1'"),
		).toBe(0);
		expect(
			await count("directory.suppressions WHERE country = 'AT' AND national_id = '900004'"),
		).toBe(1);
		// A later run never brings them back.
		expect((await runAustria(base, { force: true })).status).toBe("succeeded");
		expect(await count("directory.practitioners WHERE national_id = '900004'")).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Austria's pages until approved", async () => {
		// Every Vienna filler moves to another street: their pages all change.
		const people = {
			...AT_PEOPLE,
			wien: AT_PEOPLE.wien.map((row) =>
				row.id >= 910000 ? { ...row, street: `${row.street}a` } : row,
			),
		};
		const dir = atDir(people);
		const blocked = await runAustria(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(
			await count(
				"directory.sites WHERE source = 'at-wien' AND address_line LIKE 'Fillergasse %a'",
			),
		).toBe(0);
		const approved = await runAustria(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source = 'at-wien' AND address_line LIKE 'Fillergasse %a'",
			),
		).toBe(1100);
	});
});
