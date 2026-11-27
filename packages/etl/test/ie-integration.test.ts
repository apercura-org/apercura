/**
 * End-to-end Irish import over the SYNTHETIC fixtures (`fixtures/generate-ie.ts`), next to the
 * French ones, against a real PostgreSQL + PostGIS database with the migrations applied: the
 * places first (`etl:places --country ie`), then `etl:ie`, as CI and a deployment run them.
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
	generateIeFixtures,
	HIQA_CASES,
	hseItem,
	PSI_CASES,
	psiWorkbook,
} from "../fixtures/generate-ie";
import { buildFrOptions, buildIeOptions } from "../src/config";
import { connect } from "../src/lib/db";
import { runFr } from "../src/run-fr";
import { runIe } from "../src/run-ie";
import { importIePlaces, readIePlaceSources } from "../src/sources/ie/places";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function ieDir(): string {
	const dir = tempDir("ie");
	generateIeFixtures(dir);
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
const runIreland = (dir: string, flags: Record<string, string | true> = {}) =>
	runIe(buildIeOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

describe.skipIf(!url)("etl:ie on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = ieDir();
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
				missing_runs: number;
				place_kind: string | null;
				place: string | null;
				precision: string | null;
				phone: string | null;
				address_line: string | null;
				postcode: string | null;
				commune_label: string | null;
				site_kind: string | null;
				practice_kind: string | null;
			}[]
		>`
			SELECT p.slug, p.last_name, p.first_name, p.profession_code, p.listing_slug, p.status,
				p.indexable, p.missing_runs, pl.kind AS place_kind, pl.name AS place,
				s.geo_precision AS precision, s.phone, s.address_line, s.postcode, s.commune_label,
				s.kind AS site_kind, a.practice_kind
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'IE' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
		`;
		return row;
	};
	const qualifications = async (scheme: string, id: string) =>
		sql<{ source: string; code: string; label: string | null }[]>`
			SELECT q.source, q.code, q.label FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'IE' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
			ORDER BY q.source, q.code
		`;
	const byName = async (name: string) =>
		count(
			`directory.practitioners WHERE country = 'IE' AND last_name = '${name.replace(/'/g, "''")}'`,
		);

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

	it("imports the places, then the four lists, without touching France", async () => {
		const france = await snapshot("FR");
		const places = connect(url ?? "");
		try {
			const stats = await importIePlaces(places, await readIePlaceSources(base), 0);
			expect(stats).toMatchObject({ regions: 4, departments: 26, communes: 23 });
			expect(stats.lookup).toMatchObject({ areas: 49 });
		} finally {
			await places.end();
		}
		const outcome = await runIreland(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.byProfession).toEqual({
			IE_PHARMACY: 222,
			IE_NURSING_HOME: 67,
			IE_HOSPITAL: 18,
			IE_HEALTH_CENTRE: 104,
		});
		// The county-only pharmacy and nursing home have no point.
		expect(totals.unlocated).toBe(2);
		expect(await snapshot("FR")).toEqual(france);
		const placeCount = (kind: string) =>
			count(`directory.places WHERE country = 'IE' AND kind = '${kind}'`);
		expect(await placeCount("region")).toBe(4);
		expect(await placeCount("department")).toBe(26);
		expect(await placeCount("commune")).toBe(23);
		const sources = outcome.stats.sources as Record<string, Record<string, unknown>>;
		expect(sources.psi).toMatchObject({ rows: 222, quarantined: 1, correctAt: "2026-11-02" });
		expect(sources.psi?.placed).toEqual({ town: 218, alias: 2, otherCounty: 1, county: 1 });
		expect(sources["hse-hospitals"]).toMatchObject({
			modified: "2025-12-18T09:53:51.000Z",
			snapshot: "2020-03",
		});
		expect(outcome.stats.combine).toMatchObject({ hseDuplicatesOfHiqa: 1 });
		const [run] = await sql<{ files: Record<string, { lastModified: string }> }[]>`
			SELECT files FROM directory.etl_runs WHERE id = ${outcome.runId}
		`;
		expect(run?.files.psi?.lastModified).toBe("2026-11-02");
		expect(run?.files.hiqa?.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		// France's run keeps Ireland as it is.
		const irish = await snapshot("IE");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("IE")).toEqual(irish);
	});

	it("places a pharmacy by its district, other name, town across the border, or county", async () => {
		expect(await facility("IE-PSI", PSI_CASES.district)).toMatchObject({
			last_name: "Example Pharmacy Blanchardstown",
			first_name: "",
			slug: `example-pharmacy-blanchardstown-p${PSI_CASES.district}`,
			profession_code: "IE_PHARMACY",
			listing_slug: "pharmacy",
			indexable: true,
			place: "Dublin",
			commune_label: "Dublin 15",
			address_line: "Unit 1, Example Centre",
			postcode: "D15 X901",
			precision: "city",
			site_kind: "office",
		});
		expect(await facility("IE-PSI", PSI_CASES.alias)).toMatchObject({
			place: "Dublin",
			commune_label: "Tallaght",
		});
		expect(await facility("IE-PSI", PSI_CASES.otherCounty)).toMatchObject({ place: "Athlone" });
		expect(await facility("IE-PSI", PSI_CASES.countyOnly)).toMatchObject({
			place_kind: "department",
			place: "County Kerry",
			precision: null,
			indexable: true,
		});
		expect(await facility("IE-PSI", PSI_CASES.compound)).toMatchObject({
			place: "Ballybofey-Stranorlar",
		});
		expect(await facility("IE-PSI", PSI_CASES.manualAlias)).toMatchObject({ place: "Cork" });
		expect(await facility("IE-PSI", PSI_CASES.upperCase)).toMatchObject({
			last_name: "Sample Chemist",
		});
	});

	it("shows a nursing home's capacity, its operator unless a person, and its HIQA page", async () => {
		expect(await facility("IE-HIQA", HIQA_CASES.company)).toMatchObject({
			last_name: "Sample Nursing Home Boyle",
			listing_slug: "nursing-homes",
			place: "Boyle",
			phone: "+353719990111",
			postcode: "F52 X911",
		});
		expect(await qualifications("IE-HIQA", HIQA_CASES.company)).toEqual([
			{ source: "ie-capacity", code: "63", label: null },
			{ source: "ie-hiqa-page", code: "sample-nursing-home-boyle", label: null },
			{ source: "ie-operator", code: "company", label: "Example Care Homes Limited" },
		]);
		expect(await qualifications("IE-HIQA", HIQA_CASES.individual)).toEqual([
			{ source: "ie-hiqa-page", code: "example-house-nursing-home", label: null },
		]);
		expect(await qualifications("IE-HIQA", HIQA_CASES.partners)).not.toContainEqual(
			expect.objectContaining({ source: "ie-operator" }),
		);
		expect(await qualifications("IE-HIQA", HIQA_CASES.hse)).toContainEqual({
			source: "ie-operator",
			code: "hse",
			label: "Health Service Executive",
		});
		expect(await facility("IE-HIQA", HIQA_CASES.noTown)).toMatchObject({
			place_kind: "department",
			place: "County Dublin",
		});
		expect(await facility("IE-HIQA", HIQA_CASES.alias)).toMatchObject({
			place: "Cork",
			commune_label: "Ballincollig",
		});
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.practitioner_qualifications q ON q.practitioner_id = p.id
			WHERE p.country = 'IE' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, q.label, s.phone)
					~* '(fixture|a\\. n\\. example|example one|\\+35387999)'
				OR s.email IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.etl_runs WHERE source = 'ie' AND stats::text ~* 'fixture|a\\. n\\. example'",
			),
		).toBe(0);
	});

	it("names the HSE's facilities and keeps one page for a HIQA centre", async () => {
		expect(await byName("Exampleton Community Hospital")).toBe(1);
		expect(await byName("Saint Example's Hospital")).toBe(1);
		expect(await byName("Ionad Sláinte Sampla")).toBe(1);
		expect(await byName("Example Road Health Centre")).toBe(1);
		// The HSE's twin of HIQA's centre 905 is not a page; the centre is.
		expect(await byName("Sample Community Hospital")).toBe(0);
		expect(await byName("Sample Community Nursing Unit")).toBe(1);
		const [hospital] = await sql<{ id_scheme: string; national_id: string }[]>`
			SELECT id_scheme, national_id FROM directory.practitioners
			WHERE country = 'IE' AND last_name = 'Exampleton Community Hospital'
		`;
		expect(await facility("IE-HSE-HOSP", hospital?.national_id ?? "")).toMatchObject({
			profession_code: "IE_HOSPITAL",
			listing_slug: "hospitals",
			place: "Killarney",
			precision: "address",
			site_kind: "hospital",
			practice_kind: "hospital",
		});
		expect(await qualifications("IE-HSE-HOSP", hospital?.national_id ?? "")).toEqual([
			{ source: "ie-hospital-kind", code: "Community", label: "Community hospital" },
		]);
		expect(
			await count(
				"directory.sites WHERE source = 'ie-hse-health-centres' AND kind = 'health_center' AND geo_precision = 'address'",
			),
		).toBe(104);
		expect(await count("directory.sites WHERE source LIKE 'ie-%' AND place_id IS NULL")).toBe(0);
	});

	it("lists Ireland by county and town, never by province", async () => {
		const listing = async (slug: string, kind: string, code: string) => {
			const [row] = await sql<{ n: number; indexable: boolean }[]>`
				SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id
				WHERE lp.listing_slug = ${slug} AND p.country = 'IE' AND p.kind = ${kind} AND p.code = ${code}
			`;
			return row;
		};
		expect((await listing("pharmacy", "commune", "02341"))?.indexable).toBe(true);
		expect((await listing("pharmacy", "department", "260000"))?.indexable).toBe(true);
		expect(await listing("pharmacy", "region", "L")).toBeUndefined();
		expect(await count("directory.landing_pages WHERE key = 'pharmacy:ie'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'IE'")).toBe(
			await count("directory.practitioners WHERE country = 'IE' AND status = 'active'"),
		);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runIreland(base)).status).toBe("skipped");
		const before = await snapshot("IE");
		const forced = await runIreland(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("IE")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("IE");
		expect((await runIreland(base, { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("IE")).toEqual(before);
	});

	it("leaves a list out when its terms or licence changed, keeping its pages", async () => {
		const dir = ieDir();
		writeFileSync(join(dir, "psi-pharmacies.xlsx"), psiWorkbook({ terms: false }));
		writeFileSync(join(dir, "hse-hospitals.item.json"), hseItem("Hospitals - HSE Ireland", false));
		const pharmacies = await count(
			"directory.practitioners WHERE country = 'IE' AND id_scheme = 'IE-PSI' AND status = 'active'",
		);
		for (let run = 0; run < 2; run++) {
			const outcome = await runIreland(dir, { force: true });
			expect(outcome.status).toBe("succeeded");
			expect(Object.keys(outcome.sourceErrors).sort()).toEqual(["hse-hospitals", "psi"]);
			expect(outcome.sourceErrors.psi).toMatch(/^terms changed/);
			expect(outcome.sourceErrors["hse-hospitals"]).toMatch(/^licence changed/);
		}
		expect(
			await count(
				"directory.practitioners WHERE country = 'IE' AND id_scheme = 'IE-PSI' AND status = 'active' AND missing_runs = 0",
			),
		).toBe(pharmacies);
		expect(await byName("Exampleton Community Hospital")).toBe(1);
		// A partial run never makes the next one skip.
		expect((await runIreland(base)).status).toBe("succeeded");
		rmSync(dir, { recursive: true, force: true });
	});

	it("without HIQA's register, reads no HSE community hospital and keeps their pages", async () => {
		const outcome = await runIreland(base, { sources: "-hiqa", force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		expect(outcome.stats.combine).toMatchObject({ hseHeldBack: 4, hseDuplicatesOfHiqa: 0 });
		// The twin is still no page, and the kept community hospitals are not counted missing.
		expect(await byName("Sample Community Hospital")).toBe(0);
		expect(
			await count(
				"directory.practitioners WHERE country = 'IE' AND id_scheme = 'IE-HSE-HOSP' AND missing_runs > 0",
			),
		).toBe(0);
		expect((await runIreland(base)).status).toBe("succeeded");
	});

	it("always honours an objection: the facility is dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('IE', 'IE-PSI', ${PSI_CASES.compound}, 'objection (test)')
		`;
		const outcome = await runIreland(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			psi: { idScheme: "IE-PSI", ids: 1, lines: 1 },
		});
		expect(await facility("IE-PSI", PSI_CASES.compound)).toBeUndefined();
		expect(
			await count(
				`directory.sites WHERE source = 'ie-psi' AND source_key = '${PSI_CASES.compound}'`,
			),
		).toBe(0);
	});
});
