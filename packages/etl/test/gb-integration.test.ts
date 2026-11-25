/**
 * End-to-end UK import over the SYNTHETIC fixtures (`fixtures/generate-gb.ts`), next to the
 * French and Austrian ones, against a real PostgreSQL + PostGIS database with the migrations
 * applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when ETL_TEST_DATABASE_URL is
 * set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFixtures } from "../fixtures/generate";
import { writeAtFixtures } from "../fixtures/generate-at";
import { GB_PRACTICES, type GbFixtureSet, writeGbFixtures } from "../fixtures/generate-gb";
import { buildAtOptions, buildFrOptions, buildGbOptions } from "../src/config";
import { runAt } from "../src/run-at";
import { runFr } from "../src/run-fr";
import { runGb } from "../src/run-gb";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

function gbDir(set: GbFixtureSet = GB_PRACTICES): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-gb-test-"));
	writeGbFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-fr-test-"));
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

function atDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-at-test-"));
	writeAtFixtures(dir);
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		...Object.entries(flags),
	]);

const runUk = (dir: string, flags: Record<string, string | true> = {}) =>
	runGb(buildGbOptions(offline(dir, flags), { DATABASE_URL_ETL: url }), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), { DATABASE_URL_ETL: url }), () => {});
const runAustria = (dir: string, flags: Record<string, string | true> = {}) =>
	runAt(buildAtOptions(offline(dir, flags), { DATABASE_URL_ETL: url }), () => {});

describe.skipIf(!url)("etl:gb on synthetic fixtures, next to France and Austria", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = gbDir();

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
	const practice = async (scheme: string, id: string) => {
		const [row] = await sql<
			{
				id: number;
				slug: string;
				last_name: string;
				first_name: string;
				listing_slug: string;
				status: string;
				indexable: boolean;
				missing_runs: number;
			}[]
		>`
			SELECT id, slug, last_name, first_name, listing_slug, status, indexable, missing_runs
			FROM directory.practitioners WHERE country = 'GB' AND id_scheme = ${scheme} AND national_id = ${id}
		`;
		return row;
	};
	const siteOf = async (source: string, key: string) => {
		const [row] = await sql<
			{
				place: string | null;
				kind: string | null;
				department: string | null;
				precision: string | null;
				geo_source: string | null;
				lat: number | null;
				lon: number | null;
				address_line: string | null;
				phone: string | null;
			}[]
		>`
			SELECT p.name AS place, p.kind, p.department_code AS department, s.geo_precision AS precision,
				s.geo_source, ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon,
				s.address_line, s.phone
			FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
			WHERE s.source = ${source} AND s.source_key = ${key}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
		expect((await runAustria(atDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the nine lists without touching France or Austria", async () => {
		const france = await snapshot("FR");
		const austria = await snapshot("AT");
		const outcome = await runUk(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.bySource).toEqual({
			"GB-ODS-GP": 1007,
			"GB-ODS-DENT": 1502,
			"GB-ODS-PHARM": 1501,
			"GB-PHS-GP": 102,
			"GB-PHS-DENT": 101,
			"GB-PHS-PHARM": 151,
			"GB-BSO-GP": 42,
			"GB-BSO-DENT": 42,
		});
		expect(await snapshot("FR")).toEqual(france);
		expect(await snapshot("AT")).toEqual(austria);
		expect(await count("directory.places WHERE country = 'GB' AND kind = 'region'")).toBe(6);
		expect(await count("directory.places WHERE country = 'GB' AND kind = 'department'")).toBe(8);
		// Hamlets and suburbs are not towns; Cardiff is listed under its English name.
		expect(
			await count(
				"directory.places WHERE country = 'GB' AND kind = 'commune' AND name = 'Cardiff'",
			),
		).toBe(1);
		expect(
			await count(
				"directory.places WHERE country = 'GB' AND name IN ('Exampleby', 'Kentish Town')",
			),
		).toBe(0);
		// The other markets' runs keep the UK as it is.
		const uk = await snapshot("GB");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect((await runAustria(atDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("GB")).toEqual(uk);
	});

	it("never stores the name of a person a practice is named after", async () => {
		expect(await practice("GB-ODS-GP", "A99002")).toMatchObject({
			last_name: "Fictional Medical Centre",
			first_name: "",
			slug: "fictional-medical-centre-a99002",
		});
		expect(await practice("GB-ODS-GP", "A99009")).toMatchObject({
			last_name: "9 Placeholder Road",
		});
		expect(await practice("GB-BSO-GP", "901")).toMatchObject({
			last_name: "Example Group Practice",
		});
		expect(
			await count(
				`directory.practitioners WHERE country = 'GB' AND (last_name ~* '(^|[^a-z])(dr|drs|mr|mrs|miss)[ .]'
					OR last_name_source ~* 'partners')`,
			),
		).toBe(0);
		expect(await count("directory.sites WHERE source LIKE 'gb-%' AND name ~* 'example &'")).toBe(0);
	});

	it("places practices by postcode, town, nearest town or local authority", async () => {
		const surgery = await siteOf("gb-ods-gp", "A99001");
		expect(surgery).toMatchObject({
			place: "Stockton-on-Tees",
			kind: "commune",
			department: "E06000004",
			precision: "street",
			geo_source: "postcode",
			phone: "+441632960001",
		});
		expect(surgery?.lat).toBeGreaterThan(54.5);
		expect(surgery?.lat).toBeLessThan(54.6);
		expect(surgery?.lon).toBeGreaterThan(-1.4);
		expect(surgery?.lon).toBeLessThan(-1.2);
		// The branch surgery is a site of its practice, in its own town.
		expect(await siteOf("gb-ods-branch", "A9B1Z")).toMatchObject({ place: "Billingham" });
		expect(
			await count("directory.sites WHERE source = 'gb-ods-branch' AND source_key = 'A9B2Z'"),
		).toBe(0);
		expect(await siteOf("gb-ods-gp", "A99008")).toMatchObject({ place: "Yarm" });
		// A London borough without a town of OS Open Names: the authority itself.
		expect(await siteOf("gb-ods-gp", "A99005")).toMatchObject({
			place: "Camden",
			kind: "department",
		});
		// Scotland: the post town, else a locality line (`Shawlands, Glasgow`).
		expect(await siteOf("gb-phs-gp", "89001")).toMatchObject({ place: "Glasgow" });
		expect(await siteOf("gb-phs-dent", "8901")).toMatchObject({
			place: "Glasgow",
			department: "S12000049",
		});
		// Northern Ireland: no postcode point, the town's centre, at city precision.
		expect(await siteOf("gb-bso-gp", "901")).toMatchObject({
			place: "Belfast",
			department: "N09000003",
			precision: "city",
			geo_source: "centroid",
		});
		expect(await count("directory.sites WHERE source LIKE 'gb-%' AND place_id IS NULL")).toBe(0);
	});

	it("builds the UK's read models, with region listings", async () => {
		const surgery = await practice("GB-ODS-GP", "A99001");
		expect(surgery).toMatchObject({
			slug: "the-example-surgery-a99001",
			listing_slug: "gp-practices",
			indexable: true,
		});
		const [page] = await sql<{ country: string; sites: number; primary: string }[]>`
			SELECT country, jsonb_array_length(payload -> 'activities') AS sites,
				payload -> 'activities' -> 0 -> 'site' ->> 'placeName' AS primary
			FROM directory.practitioner_pages WHERE practitioner_id = ${surgery?.id ?? 0}
		`;
		// The practice's own address first, then its branch.
		expect(page).toEqual({ country: "GB", sites: 2, primary: "Stockton-on-Tees" });
		const listing = async (key: string) => {
			const [row] = await sql<{ country: string; n: number }[]>`
				SELECT country, practitioner_count AS n FROM directory.landing_pages WHERE key = ${key}
			`;
			return row;
		};
		expect((await listing("gp-practices:gb"))?.country).toBe("GB");
		const [northEast] = await sql<{ id: number }[]>`
			SELECT id FROM directory.places WHERE country = 'GB' AND kind = 'region' AND code = 'E12000001'
		`;
		const region = await listing(`gp-practices:${northEast?.id}`);
		expect(region?.country).toBe("GB");
		expect(region?.n).toBeGreaterThan(1000);
		expect(await count("directory.landing_pages WHERE country = 'GB' AND key LIKE '%:fr'")).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'GB'")).toBe(
			await count("directory.practitioners WHERE country = 'GB' AND status = 'active'"),
		);
		// France's and Austria's regions get no listing.
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country <> 'GB'",
			),
		).toBe(0);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runUk(base)).status).toBe("skipped");
		const before = await snapshot("GB");
		const forced = await runUk(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("GB")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("GB");
		const set = { ...GB_PRACTICES, gp: GB_PRACTICES.gp.filter((row) => row.code !== "A99008") };
		expect((await runUk(gbDir(set), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("GB")).toEqual(before);
	});

	it("leaves out a list it cannot read and keeps its practices as they are", async () => {
		const dir = gbDir();
		writeFileSync(join(dir, "phs-gp.csv"), `${"not,the,expected,columns\n".repeat(80)}`);
		const outcome = await runUk(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["phs-gp"]);
		expect(
			await count("directory.practitioners WHERE id_scheme = 'GB-PHS-GP' AND missing_runs > 0"),
		).toBe(0);
		expect(
			await count("directory.practitioners WHERE id_scheme = 'GB-PHS-GP' AND status = 'active'"),
		).toBe(102);
	});

	it("keeps the branch surgeries when only their report fails", async () => {
		const dir = gbDir();
		writeFileSync(join(dir, "ebranchs.csv"), `${'"short","line"\r\n'.repeat(80)}`);
		const outcome = await runUk(dir, { force: true });
		expect(Object.keys(outcome.sourceErrors)).toEqual(["ods-branches"]);
		expect(
			await count(
				"directory.activities WHERE source = 'gb-ods-branch' AND removed_at IS NULL AND source_key LIKE 'GB-ODS-GP:A99001@%'",
			),
		).toBe(1);
	});

	it("removes a practice after two consecutive runs without it", async () => {
		const set = { ...GB_PRACTICES, gp: GB_PRACTICES.gp.filter((row) => row.code !== "A99008") };
		const dir = gbDir(set);
		expect((await runUk(dir, { force: true })).status).toBe("succeeded");
		expect(await practice("GB-ODS-GP", "A99008")).toMatchObject({
			status: "active",
			missing_runs: 1,
		});
		expect((await runUk(dir, { force: true })).status).toBe("succeeded");
		expect((await practice("GB-ODS-GP", "A99008"))?.status).toBe("removed");
		expect(
			await count("directory.practitioner_pages WHERE slug = 'yarm-example-practice-a99008'"),
		).toBe(0);
	});

	it("always honours an objection: the lines are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('GB', 'GB-ODS-DENT', 'V99001', 'objection (test)')
		`;
		const outcome = await runUk(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			"ods-dent": { idScheme: "GB-ODS-DENT", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await practice("GB-ODS-DENT", "V99001")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'gb-ods-dent' AND source_key = 'V99001'"),
		).toBe(0);
		expect((await runUk(base, { force: true })).status).toBe("succeeded");
		expect(await count("directory.practitioners WHERE national_id = 'V99001'")).toBe(0);
	});

	it("blocks a run that would modify more than 10% of the UK's pages until approved", async () => {
		const dir = gbDir({ ...GB_PRACTICES, fillerStreetSuffix: " WEST" });
		const blocked = await runUk(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE address_line LIKE '% Filler Street West'")).toBe(0);
		const approved = await runUk(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(await count("directory.sites WHERE address_line LIKE '% Filler Street West'")).toBe(
			1000,
		);
	});
});
