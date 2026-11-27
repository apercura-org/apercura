/**
 * End-to-end Finnish import over the SYNTHETIC fixtures (`fixtures/generate-fi.ts`), next to the
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
	FI_LOCATIONS,
	type FiFixtureSet,
	fixtureKey,
	writeFiFixtures,
} from "../fixtures/generate-fi";
import { buildFiOptions, buildFrOptions } from "../src/config";
import { runFi } from "../src/run-fi";
import { runFr } from "../src/run-fr";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function fiDir(set: FiFixtureSet = FI_LOCATIONS): string {
	const dir = tempDir("fi");
	writeFiFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

const env = () => ({ DATABASE_URL_ETL: url });
const runFinland = (dir: string, flags: Record<string, string | true> = {}) =>
	runFi(
		buildFiOptions(
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

/** The fixture set without the location of `index`. */
const without = (index: number): FiFixtureSet => ({
	...FI_LOCATIONS,
	locations: FI_LOCATIONS.locations.filter((location) => location.index !== index),
});

describe.skipIf(!url)("etl:fi on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = fiDir();

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
	const location = async (index: number) => {
		const [row] = await sql<
			{
				id: number;
				slug: string;
				last_name: string;
				profession_code: string;
				listing_slug: string;
				status: string;
				missing_runs: number;
				place_code: string | null;
				precision: string | null;
				lat: number | null;
				address_line: string | null;
				postcode: string | null;
				phone: string | null;
				commune_label: string | null;
				email: string | null;
			}[]
		>`
			SELECT p.id, p.slug, p.last_name, p.profession_code, p.listing_slug, p.status, p.missing_runs,
				pl.code AS place_code, s.geo_precision AS precision, ST_Y(s.location::geometry) AS lat,
				s.address_line, s.postcode, s.phone, s.commune_label, s.email
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'FI' AND p.national_id = ${fixtureKey(3, index)}
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

	it("imports places and locations without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runFinland(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.locations).toBe(127);
		expect(totals.unlocated).toBe(0);
		expect(totals.centroid).toBe(1);
		expect(totals.byProfession).toEqual({
			FI_HOSPITAL: 2,
			FI_EMERGENCY: 1,
			FI_HEALTH_CENTRE: 61,
			FI_DENTAL: 40,
			FI_CHILD_HEALTH: 20,
			FI_MENTAL_HEALTH: 1,
			FI_REHABILITATION: 1,
			FI_LABORATORY: 1,
		});
		expect(outcome.stats.batch).toMatchObject({
			placement: { point: 126, municipality: 1, unplaced: 1 },
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'FI' AND kind = '${kind}'`);
		expect(await places("region")).toBe(7);
		expect(await places("department")).toBe(8);
		expect(await places("commune")).toBe(8);
		// France's next run keeps Finland as it is.
		const finland = await snapshot("FI");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("FI")).toEqual(finland);
	});

	it("keys a location by its channel id and keeps its services and organiser, never its e-mail", async () => {
		const hospital = await location(1);
		expect(hospital).toMatchObject({
			slug: `esimerkkilan-keskussairaala-${fixtureKey(3, 1)}`,
			last_name: "Esimerkkilän keskussairaala",
			profession_code: "FI_HOSPITAL",
			listing_slug: "sairaalat",
			place_code: "837",
			precision: "address",
			address_line: "Esimerkkisairaalantie 1",
			postcode: "33520",
			commune_label: "Tampere",
			phone: "+35839900001",
			email: null,
		});
		const qualifications = await sql<{ source: string; label: string }[]>`
			SELECT source, label FROM directory.practitioner_qualifications
			WHERE practitioner_id = ${hospital?.id ?? 0} ORDER BY source, label
		`;
		expect(qualifications).toEqual([
			{ source: "jarjestaja", label: "Esimerkkilän sairaanhoitopiiri" },
			{ source: "palvelu", label: "Erikoissairaanhoidon poliklinikka" },
			{ source: "palvelu", label: "Laboratoriopalvelut" },
		]);
		// No point in the catalogue: at the municipality's centre, city precision.
		expect(await location(4)).toMatchObject({ place_code: "408", precision: "city" });
		// A school, a library, a company's clinic, abroad, unpublished, an unknown municipality,
		// no name: no page.
		for (const index of [900, 901, 902, 903, 904, 905, 906]) {
			expect(await location(index), String(index)).toBeUndefined();
		}
		expect(
			await count(
				"directory.sites WHERE country_code = 'FI' AND (email IS NOT NULL OR fax IS NOT NULL)",
			),
		).toBe(0);
		expect(
			await count(
				"directory.etl_runs WHERE source = 'fi' AND stats::text ~ 'Esimerkki|example\\.test'",
			),
		).toBe(0);
	});

	it("builds Finland's read models: county and municipality listings, Helsinki its county's", async () => {
		const listing = async (slug: string, kind: string, code: string) => {
			const [row] = await sql<{ n: number }[]>`
				SELECT lp.practitioner_count AS n FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id
				WHERE lp.listing_slug = ${slug} AND p.country = 'FI' AND p.kind = ${kind} AND p.code = ${code}
			`;
			return row?.n;
		};
		expect(await listing("terveysasemat", "department", "08")).toBe(30);
		expect(await listing("terveysasemat", "commune", "837")).toBe(30);
		expect(await listing("terveysasemat", "department", "90")).toBe(30);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'FI'",
			),
		).toBe(0);
		expect(await count("directory.practitioner_pages WHERE country = 'FI'")).toBe(127);
	});

	it("skips an unchanged snapshot, and a forced rerun changes nothing", async () => {
		expect((await runFinland(base)).status).toBe("skipped");
		const before = await snapshot("FI");
		const forced = await runFinland(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("FI")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("FI");
		expect((await runFinland(fiDir(without(3)), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("FI")).toEqual(before);
	});

	it("never goes back to an older snapshot, and fails on a file that is not one", async () => {
		const older = await runFinland(fiDir({ ...FI_LOCATIONS, day: "2026-11-20" }), { force: true });
		expect(older.status).toBe("failed");
		expect(older.sourceErrors.ptv).toMatch(/snapshot of 20261120 vs 20261127/);
		const dir = fiDir();
		writeFileSync(join(dir, "ptv.json"), "x".repeat(4000));
		const broken = await runFinland(dir, { force: true });
		expect(broken.status).toBe("failed");
		expect(broken.sourceErrors.ptv).toMatch(/^parse:/);
		expect((await location(1))?.status).toBe("active");
	});

	it("removes a location after two consecutive runs without it", async () => {
		const dir = fiDir(without(3));
		expect((await runFinland(dir, { force: true })).status).toBe("succeeded");
		expect(await location(3)).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runFinland(dir, { force: true })).status).toBe("succeeded");
		expect((await location(3))?.status).toBe("removed");
		expect((await runFinland(base, { force: true })).status).toBe("succeeded");
		expect((await location(3))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('FI', 'FI-PTV', ${fixtureKey(3, 5)}, 'objection (test)')
		`;
		const outcome = await runFinland(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			ptv: { idScheme: "FI-PTV", ids: 1, lines: 1 },
		});
		expect(await location(5)).toBeUndefined();
		expect(
			await count(`directory.sites WHERE source = 'fi-ptv' AND source_key = '${fixtureKey(3, 5)}'`),
		).toBe(0);
	});
});
