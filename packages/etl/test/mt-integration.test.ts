/**
 * End-to-end Maltese import over the SYNTHETIC fixtures (`fixtures/generate-mt.ts`), next to the
 * French one, against a real PostgreSQL + PostGIS database with the migrations applied.
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
import {
	catalogueJson,
	fixtureKey,
	MT_PHARMACIES,
	type MtFixtureSet,
	writeMtFixtures,
} from "../fixtures/generate-mt";
import { buildFrOptions, buildMtOptions } from "../src/config";
import { runFr } from "../src/run-fr";
import { runMt } from "../src/run-mt";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function mtDir(set: MtFixtureSet = MT_PHARMACIES): string {
	const dir = tempDir("mt");
	writeMtFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

const env = () => ({ DATABASE_URL_ETL: url });
const runMalta = (dir: string, flags: Record<string, string | true> = {}) =>
	runMt(
		buildMtOptions(
			new Map<string, string | true>([
				["source-dir", dir],
				["offline", true],
				...Object.entries(flags),
			]),
			env(),
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
			env(),
		),
		() => {},
	);

/** The fixture set without the pharmacy of `index`. */
const without = (index: number): MtFixtureSet => ({
	...MT_PHARMACIES,
	pharmacies: MT_PHARMACIES.pharmacies.filter((pharmacy) => pharmacy.index !== index),
});

/** Community rows of the fixture that are listed: all but the licence that is not one. */
const LISTED = MT_PHARMACIES.pharmacies.filter(
	(pharmacy) => pharmacy.type.startsWith("Community") && !pharmacy.licence,
).length;

describe.skipIf(!url)("etl:mt on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = mtDir();

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
	const pharmacy = async (index: number) => {
		const [row] = await sql<
			{
				id: number;
				slug: string;
				last_name: string;
				first_name: string;
				profession_code: string;
				listing_slug: string;
				status: string;
				missing_runs: number;
				place_code: string | null;
				precision: string | null;
				address_line: string | null;
				postcode: string | null;
				phone: string | null;
				commune_label: string | null;
			}[]
		>`
			SELECT p.id, p.slug, p.last_name, p.first_name, p.profession_code, p.listing_slug, p.status,
				p.missing_runs, pl.code AS place_code, s.geo_precision AS precision, s.address_line,
				s.postcode, s.phone, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'MT' AND p.national_id = ${fixtureKey(index)}
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

	it("imports places and pharmacies without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runMalta(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.pharmacies).toBe(LISTED);
		expect(totals.unlocated).toBe(0);
		expect(totals.centroid).toBe(1);
		expect(totals.byProfession).toEqual({ MT_PHARMACY: LISTED });
		expect(outcome.stats.batch).toMatchObject({
			placement: { point: LISTED - 1, nearby: 0, name: 1, unplaced: 0, disagreeing: 1 },
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'MT' AND kind = '${kind}'`);
		expect(await places("region")).toBe(2);
		expect(await places("department")).toBe(6);
		expect(await places("commune")).toBe(68);
		expect(await count("directory.place_lookup WHERE country = 'MT' AND area IS NOT NULL")).toBe(
			68,
		);
		// France's next run keeps Malta as it is.
		const malta = await snapshot("MT");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("MT")).toEqual(malta);
	});

	it("keys a pharmacy by its licence and places it by its point", async () => {
		expect(await pharmacy(2)).toMatchObject({
			slug: `example-sliema-seafront-pharmacy-dl${fixtureKey(2)}`,
			last_name: "Example Sliema Seafront Pharmacy",
			first_name: "",
			profession_code: "MT_PHARMACY",
			listing_slug: "community-pharmacies",
			place_code: "01259",
			precision: "address",
			address_line: "2, Triq it-Torri",
			postcode: "SLM 1022",
			commune_label: "Tas-Sliema",
			phone: "+35621234002",
		});
		// No point: placed by the locality it names, at the locality's centre.
		expect(await pharmacy(5)).toMatchObject({ place_code: "01133", precision: "city" });
		// Its point is in Pietà, its postal locality Msida: the point decides.
		expect(await pharmacy(6)).toMatchObject({ place_code: "01247", phone: null });
		// A hospital in-patient pharmacy, a government dispensary, a licence that is not one.
		for (const index of [120, 121, 122]) {
			expect(await pharmacy(index), String(index)).toBeUndefined();
		}
		expect(
			await count(
				"directory.etl_runs WHERE source = 'mt' AND stats::text ~ 'Example|Specimen|Triq'",
			),
		).toBe(0);
	});

	it("builds Malta's read models: district and locality listings, none for the regions", async () => {
		const listing = async (kind: string, code: string) => {
			const [row] = await sql<{ n: number }[]>`
				SELECT lp.practitioner_count AS n FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id
				WHERE lp.listing_slug = 'community-pharmacies' AND p.country = 'MT' AND p.kind = ${kind}
					AND p.code = ${code}
			`;
			return row?.n;
		};
		expect(await listing("commune", "02611")).toBe(3);
		expect(await listing("department", "026")).toBe(3);
		expect(await listing("commune", "01101")).toBeGreaterThanOrEqual(1);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'MT'",
			),
		).toBe(0);
		expect(await count("directory.practitioner_pages WHERE country = 'MT'")).toBe(LISTED);
	});

	it("skips an unchanged register, and a forced rerun changes nothing", async () => {
		expect((await runMalta(base)).status).toBe("skipped");
		const before = await snapshot("MT");
		const forced = await runMalta(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("MT")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("MT");
		expect((await runMalta(mtDir(without(3)), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("MT")).toEqual(before);
	});

	it("fails on changed terms, an older register or a file that is not one", async () => {
		const dir = mtDir();
		writeFileSync(
			join(dir, "catalogue.json"),
			catalogueJson(MT_PHARMACIES.day, { publisher: "X" }),
		);
		const terms = await runMalta(dir, { force: true });
		expect(terms.status).toBe("failed");
		expect(terms.sourceErrors.pharmacies).toMatch(/^terms: the publisher is "X"/);
		const licence = mtDir();
		writeFileSync(
			join(licence, "catalogue.json"),
			catalogueJson(MT_PHARMACIES.day, {
				licence: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
			}),
		);
		expect((await runMalta(licence, { force: true })).sourceErrors.pharmacies).toMatch(
			/^terms: no distribution under CC BY 4\.0/,
		);
		const older = await runMalta(mtDir({ ...MT_PHARMACIES, day: "2026-11-10" }), { force: true });
		expect(older.status).toBe("failed");
		expect(older.sourceErrors.pharmacies).toMatch(/register of 20261110 vs 20261118/);
		const broken = mtDir();
		writeFileSync(join(broken, "pharmacies.json"), "x".repeat(4000));
		const parse = await runMalta(broken, { force: true });
		expect(parse.status).toBe("failed");
		expect(parse.sourceErrors.pharmacies).toMatch(/^parse:/);
		expect((await pharmacy(1))?.status).toBe("active");
	});

	it("removes a pharmacy after two consecutive runs without it", async () => {
		const dir = mtDir(without(3));
		expect((await runMalta(dir, { force: true })).status).toBe("succeeded");
		expect(await pharmacy(3)).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runMalta(dir, { force: true })).status).toBe("succeeded");
		expect((await pharmacy(3))?.status).toBe("removed");
		expect((await runMalta(base, { force: true })).status).toBe("succeeded");
		expect((await pharmacy(3))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('MT', 'MT-MA', ${fixtureKey(7)}, 'objection (test)')
		`;
		const outcome = await runMalta(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			pharmacies: { idScheme: "MT-MA", ids: 1, lines: 1 },
		});
		expect(await pharmacy(7)).toBeUndefined();
		expect(
			await count(`directory.sites WHERE source = 'mt-ma' AND source_key = '${fixtureKey(7)}'`),
		).toBe(0);
	});
});
