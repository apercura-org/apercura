/**
 * End-to-end Swedish import over the SYNTHETIC fixtures (`fixtures/generate-se.ts`), next to the
 * French ones, against a real PostgreSQL + PostGIS database with the migrations applied: the
 * places first (`etl:places --country se`), then `etl:se`, as CI and a deployment run them.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when ETL_TEST_DATABASE_URL is
 * set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFixtures } from "../fixtures/generate";
import {
	APOTEK_CASES,
	apotekWorkbook,
	generateSeFixtures,
	licenceJson,
	SOLE_TRADER_HOLDER,
	VC_CASES,
} from "../fixtures/generate-se";
import { buildFrOptions, buildSeOptions } from "../src/config";
import { connect } from "../src/lib/db";
import { runFr } from "../src/run-fr";
import { runSe } from "../src/run-se";
import { importSePlaces, readSePlaceSources } from "../src/sources/se/places";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function seDir(): string {
	const dir = tempDir("se");
	generateSeFixtures(dir);
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
const runSweden = (dir: string, flags: Record<string, string | true> = {}) =>
	runSe(buildSeOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

describe.skipIf(!url)("etl:se on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = seDir();
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
	const facility = async (scheme: string, id: string) => {
		const [row] = await sql<
			{
				slug: string;
				last_name: string;
				first_name: string;
				profession_code: string;
				listing_slug: string;
				status: string;
				indexable: boolean;
				place: string | null;
				county: string | null;
				precision: string | null;
				phone: string | null;
				address_line: string | null;
				postcode: string | null;
				commune_label: string | null;
				site_kind: string | null;
				source: string | null;
			}[]
		>`
			SELECT p.slug, p.last_name, p.first_name, p.profession_code, p.listing_slug, p.status,
				p.indexable, pl.code AS place, pl.department_code AS county, s.geo_precision AS precision,
				s.phone, s.address_line, s.postcode, s.commune_label, s.kind AS site_kind, s.source
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'SE' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
		`;
		return row;
	};
	const qualifications = async (scheme: string, id: string) =>
		sql<{ source: string; code: string; label: string | null }[]>`
			SELECT q.source, q.code, q.label FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'SE' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
			ORDER BY q.source, q.code
		`;

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
		rmSync(base, { recursive: true, force: true });
	});

	it("imports the places, then both lists, without touching France", async () => {
		const france = await snapshot("FR");
		const etl = connect(url ?? "");
		try {
			const stats = await importSePlaces(etl, await readSePlaceSources(base), 0);
			expect(stats).toMatchObject({ departments: 21, communes: 9, located: 9 });
			expect(stats.lookup).toMatchObject({ areas: 14 });
		} finally {
			await etl.end();
		}
		const outcome = await runSweden(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.byProfession).toEqual({ SE_PHARMACY: 28, SE_HEALTH_CENTRE: 16 });
		expect(totals).toMatchObject({ listPoint: 16, municipalityPoint: 28, unlocated: 0 });
		const sources = outcome.stats.sources as Record<string, Record<string, unknown>>;
		expect(sources.apotek).toMatchObject({
			rows: 29,
			quarantined: 2,
			placed: { kommun: 28, unplaced: 1 },
			skipped: { "closed to the public": 1, "repeated GLN": 1 },
			counters: { holdersOmitted: 1, severalGlns: 1, noLicenceDate: 1 },
		});
		expect(sources.vardcentraler).toMatchObject({
			rows: 17,
			quarantined: 2,
			placed: { boundary: 14, postTown: 1, nearest: 1, unplaced: 1 },
		});
		expect(await snapshot("FR")).toEqual(france);
		expect(
			await count(
				"directory.places WHERE country = 'SE' AND kind = 'commune' AND centroid IS NULL",
			),
		).toBe(0);
	});

	it("lists a pharmacy at its municipality's point, its licence and its holder", async () => {
		expect(await facility("SE-GLN", APOTEK_CASES.stockholm)).toMatchObject({
			last_name: "Exempelapoteket Centrum",
			first_name: "",
			profession_code: "SE_PHARMACY",
			listing_slug: "apoteken",
			slug: `exempelapoteket-centrum-a${APOTEK_CASES.stockholm}`,
			status: "active",
			indexable: true,
			place: "0180",
			county: "01",
			precision: "city",
			phone: null,
			address_line: "Exempelgatan 1",
			postcode: "111 22",
			commune_label: "Stockholm",
			site_kind: "office",
			source: "se-apotek",
		});
		const licence = await qualifications("SE-GLN", APOTEK_CASES.stockholm);
		expect(licence).toEqual([
			{ source: "tillstand", code: expect.stringMatching(/^5\.9\.3-2020-/), label: "2015-09-01" },
			{ source: "tillstandshavare", code: "559999-0016", label: "Exempel Apotek AB" },
		]);
		expect(await facility("SE-GLN", APOTEK_CASES.severalGlns)).toMatchObject({ place: "0180" });
		expect(await facility("SE-GLN", APOTEK_CASES.closed)).toBeUndefined();
		expect(await facility("SE-GLN", APOTEK_CASES.unknownMunicipality)).toBeUndefined();
		expect(await facility("SE-GLN", APOTEK_CASES.lowerCounty)).toMatchObject({ county: "14" });
		expect(await facility("SE-GLN", APOTEK_CASES.townCasing)).toMatchObject({
			commune_label: "Upplands Väsby",
		});
		expect(await facility("SE-GLN", APOTEK_CASES.otherTown)).toMatchObject({
			place: "1440",
			commune_label: "Exempelby",
		});
		expect(await facility("SE-GLN", APOTEK_CASES.hyphen)).toMatchObject({ place: "2039" });
		expect(await facility("SE-GLN", APOTEK_CASES.gotland)).toMatchObject({
			place: "0980",
			county: "09",
		});
	});

	it("never stores a sole trader holder", async () => {
		expect(await qualifications("SE-GLN", APOTEK_CASES.soleTrader)).toEqual([
			{ source: "tillstand", code: expect.any(String), label: "2020-03-01" },
		]);
		const [leaks] = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'SE' AND (q.label = ${SOLE_TRADER_HOLDER} OR q.code LIKE '811218%')
		`;
		expect(leaks?.n).toBe(0);
	});

	it("lists a health centre at its own point, placed in Västra Götaland", async () => {
		expect(await facility("SE-HSA", VC_CASES.company)).toMatchObject({
			last_name: "Exempel Vårdcentral Centrum",
			listing_slug: "vardcentraler",
			slug: "exempel-vardcentral-centrum-v2321000131fx0001",
			place: "1480",
			precision: "address",
			postcode: "411 03",
			site_kind: "health_center",
			source: "se-vgr-vardcentraler",
		});
		expect(await qualifications("SE-HSA", VC_CASES.company)).toEqual([
			{ source: "vardgivare", code: "exempel-vard-ab", label: "Exempel Vård AB" },
		]);
		expect(await facility("SE-HSA", VC_CASES.region)).toBeDefined();
		expect(await facility("SE-HSA", VC_CASES.postTown)).toMatchObject({ place: "1488" });
		expect(await facility("SE-HSA", VC_CASES.nearest)).toMatchObject({
			place: "1480",
			commune_label: "Exempelö",
		});
		expect(await facility("SE-HSA", VC_CASES.outside)).toBeUndefined();
		expect(await count("directory.sites WHERE source LIKE 'se-%' AND place_id IS NULL")).toBe(0);
	});

	it("lists Sweden by county and municipality", async () => {
		const listing = async (slug: string, kind: string, code: string) => {
			const [row] = await sql<{ n: number; indexable: boolean }[]>`
				SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id
				WHERE lp.listing_slug = ${slug} AND p.country = 'SE' AND p.kind = ${kind} AND p.code = ${code}
			`;
			return row;
		};
		expect(await listing("apoteken", "commune", "0180")).toMatchObject({ n: 6 });
		expect(await listing("apoteken", "department", "01")).toMatchObject({ n: 7 });
		expect(await listing("vardcentraler", "department", "14")).toMatchObject({ n: 16 });
		expect(await listing("vardcentraler", "department", "01")).toBeUndefined();
		expect(await count("directory.search_docs WHERE country = 'SE'")).toBe(
			await count("directory.practitioners WHERE country = 'SE' AND status = 'active'"),
		);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runSweden(base)).status).toBe("skipped");
		const before = await snapshot("SE");
		const forced = await runSweden(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("SE")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("SE");
		expect((await runSweden(base, { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("SE")).toEqual(before);
	});

	it("leaves a list out when its licence changed or its export is filtered, keeping its pages", async () => {
		const dir = seDir();
		writeFileSync(join(dir, "apotek.xlsx"), apotekWorkbook({ filtered: true }));
		writeFileSync(
			join(dir, "vardcentraler.licence.json"),
			licenceJson("x", "http://creativecommons.org/licenses/by-nc/4.0/"),
		);
		const before = await snapshot("SE");
		for (let run = 0; run < 2; run++) {
			const outcome = await runSweden(dir, { force: true });
			expect(outcome.status).toBe("failed");
			expect(Object.keys(outcome.sourceErrors).sort()).toEqual(["apotek", "vardcentraler"]);
			expect(outcome.sourceErrors.apotek).toMatch(/^parse: the export is filtered/);
			expect(outcome.sourceErrors.vardcentraler).toMatch(/^licence changed/);
		}
		expect(await snapshot("SE")).toEqual(before);
		// One list left out: the other is imported and the left-out one keeps its pages.
		writeFileSync(join(dir, "apotek.xlsx"), apotekWorkbook());
		const partial = await runSweden(dir, { force: true });
		expect(partial.status).toBe("succeeded");
		expect(Object.keys(partial.sourceErrors)).toEqual(["vardcentraler"]);
		expect(
			await count(
				"directory.practitioners WHERE country = 'SE' AND id_scheme = 'SE-HSA' AND status = 'active' AND missing_runs = 0",
			),
		).toBe(16);
		// A partial run never makes the next one skip.
		expect((await runSweden(base)).status).toBe("succeeded");
		rmSync(dir, { recursive: true, force: true });
	});

	it("always honours an objection: the facility is dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('SE', 'SE-GLN', ${APOTEK_CASES.hyphen}, 'objection (test)')
		`;
		const outcome = await runSweden(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			apotek: { idScheme: "SE-GLN", ids: 1, lines: 1 },
		});
		expect(await facility("SE-GLN", APOTEK_CASES.hyphen)).toBeUndefined();
		expect(
			await count(
				`directory.sites WHERE source = 'se-apotek' AND source_key = '${APOTEK_CASES.hyphen}'`,
			),
		).toBe(0);
	});
});
