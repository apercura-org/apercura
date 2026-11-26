/**
 * End-to-end Spanish import over the SYNTHETIC fixtures (`fixtures/generate-es.ts`), next to the
 * French and Czech ones, against a real PostgreSQL + PostGIS database with the migrations
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
import { writeCzFixtures } from "../fixtures/generate-cz";
import {
	ES_ANCHORS,
	ES_CENTRES,
	type EsFixtureSet,
	writeEsFixtures,
} from "../fixtures/generate-es";
import { buildCzOptions, buildEsOptions, buildFrOptions } from "../src/config";
import { runCz } from "../src/run-cz";
import { runEs } from "../src/run-es";
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

function esDir(set: EsFixtureSet = ES_CENTRES): string {
	const dir = tempDir("es");
	writeEsFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
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
const runSpain = (dir: string, flags: Record<string, string | true> = {}) =>
	runEs(buildEsOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});
const runCzechia = (dir: string, flags: Record<string, string | true> = {}) =>
	runCz(buildCzOptions(offline(dir, flags), env()), () => {});

/** The fixture set without one centre. */
const without = (id: string): EsFixtureSet => ({
	...ES_CENTRES,
	cases: ES_CENTRES.cases.filter((item) => item.id !== id),
});

describe.skipIf(!url)("etl:es on synthetic fixtures, next to France and Czechia", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = esDir();

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
	const centre = async (id: string) => {
		const [row] = await sql<
			{
				id: number;
				slug: string;
				last_name: string;
				first_name: string;
				profession_code: string;
				primary_specialty_code: string | null;
				listing_slug: string;
				status: string;
				indexable: boolean;
				missing_runs: number;
			}[]
		>`
			SELECT id, slug, last_name, first_name, profession_code, primary_specialty_code,
				listing_slug, status, indexable, missing_runs
			FROM directory.practitioners WHERE country = 'ES' AND id_scheme = 'ES-REGCESS' AND national_id = ${id}
		`;
		return row;
	};
	const siteOf = async (key: string) => {
		const [row] = await sql<
			{
				source: string;
				place: string | null;
				kind: string | null;
				code: string | null;
				precision: string | null;
				geo_source: string | null;
				lat: number | null;
				address_line: string | null;
				postcode: string | null;
				phone: string | null;
				commune_label: string | null;
			}[]
		>`
			SELECT s.source, p.name AS place, p.kind, p.code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, s.address_line, s.postcode, s.phone, s.commune_label
			FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
			WHERE s.source LIKE 'es-regcess-%' AND s.source_key = ${key} AND s.removed_at IS NULL
		`;
		return row;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'ES' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
		expect((await runCzechia(czDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the register without touching France or Czechia", async () => {
		const others = { FR: await snapshot("FR"), CZ: await snapshot("CZ") };
		const outcome = await runSpain(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.centres).toBe(ES_CENTRES.cases.length);
		expect(totals.byProfession).toMatchObject({
			ES_HOSPITAL: 39,
			ES_DENTAL: 41,
			ES_PHARMACY: 44,
			ES_HEALTH_CENTRE: 31,
			ES_LOCAL_CLINIC: 9,
		});
		expect(await snapshot("FR")).toEqual(others.FR);
		expect(await snapshot("CZ")).toEqual(others.CZ);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'ES' AND kind = '${kind}'`);
		expect(await places("region")).toBe(5);
		expect(await places("department")).toBe(6);
		expect(await places("commune")).toBe(11);
		expect(await places("arrondissement")).toBe(0);
		// The other markets' runs keep Spain as it is.
		const spain = await snapshot("ES");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect((await runCzechia(czDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("ES")).toEqual(spain);
	});

	it("keeps a centre's name, kind and care units, and nothing it does not need", async () => {
		expect(await centre(ES_ANCHORS.dental)).toMatchObject({
			last_name: "Clinica Dental Ejemplo Centro",
			first_name: "",
			slug: `clinica-dental-ejemplo-centro-${ES_ANCHORS.dental}`,
			profession_code: "ES_DENTAL",
			listing_slug: "dentistas",
			indexable: true,
		});
		expect(await centre(ES_ANCHORS.cardiology)).toMatchObject({
			profession_code: "ES_MEDICAL_PRACTICE",
			primary_specialty_code: "U.7",
			listing_slug: "cardiologos",
		});
		expect(await centre(ES_ANCHORS.psychology)).toMatchObject({
			primary_specialty_code: "U.70",
			listing_slug: "psicologos",
		});
		expect((await centre(ES_ANCHORS.localClinic))?.listing_slug).toBe("centros-de-salud");
		expect((await centre(ES_ANCHORS.otherProfessional))?.listing_slug).toBe(
			"otros-profesionales-sanitarios",
		);
		const quals = await sql<{ code: string; label: string; source: string }[]>`
			SELECT q.code, q.label, q.source FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'ES' AND p.national_id = ${ES_ANCHORS.hospital} ORDER BY q.source, q.code
		`;
		expect(quals).toContainEqual({ code: "PUBLIC", label: "Público", source: "dependencia" });
		expect(quals).toContainEqual({ code: "U.68", label: "Urgencias", source: "oferta" });
		expect(quals.filter((q) => q.source === "oferta")).toHaveLength(8);
		// E-mail, fax, web address, regional code, health area, authorisation dates.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'ES' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, s.legal_name,
					s.trade_name) ~ '(example\\.invalid|AREA FICTICIA|R-[0-9]|2003)'
				OR s.email IS NOT NULL OR s.fax IS NOT NULL OR s.siret IS NOT NULL
				OR s.phone = '+34919990000'
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'es' AND stats::text ~ 'Ejemplar|example'"),
		).toBe(0);
		// A chain's number is no clinic's own.
		expect(
			await count("directory.sites WHERE source LIKE 'es-regcess-%' AND phone = '+34902999000'"),
		).toBe(0);
	});

	it("places centres by INE code, at their municipality's point and city precision", async () => {
		expect(await siteOf(ES_ANCHORS.dental)).toMatchObject({
			source: "es-regcess-c2",
			place: "Madrid",
			kind: "commune",
			code: "28079",
			precision: "city",
			geo_source: "centroid",
			address_line: "Calle Alcala, 10",
			postcode: "28014",
			phone: "+34910000001",
			commune_label: "Madrid",
		});
		expect((await siteOf(ES_ANCHORS.dental))?.lat).toBeCloseTo(40.419026, 5);
		expect((await siteOf(ES_ANCHORS.pharmacy))?.source).toBe("es-regcess-e");
		expect((await siteOf(ES_ANCHORS.hospital))?.source).toBe("es-regcess-c1");
		// A municipality the places do not know: its province, without a point.
		expect(await siteOf(ES_ANCHORS.unknownMunicipality)).toMatchObject({
			kind: "department",
			code: "03",
			precision: null,
			lat: null,
		});
		// A municipality without a population centre: placed, without a point.
		expect(await siteOf(ES_ANCHORS.noPoint)).toMatchObject({
			place: "el Brull",
			kind: "commune",
			precision: null,
			lat: null,
		});
		expect(
			await count("directory.sites WHERE source LIKE 'es-regcess-%' AND place_id IS NULL"),
		).toBe(0);
		expect(
			await count(
				"directory.sites WHERE source LIKE 'es-regcess-%' AND geo_precision IS DISTINCT FROM 'city' AND location IS NOT NULL",
			),
		).toBe(0);
	});

	it("builds Spain's read models: country, province and municipality listings", async () => {
		expect(await listing("dentistas", "commune", "28079")).toMatchObject({ indexable: true });
		expect((await listing("dentistas", "department", "28"))?.n).toBeGreaterThanOrEqual(14);
		expect((await listing("farmacias", "commune", "35016"))?.indexable).toBe(true);
		expect((await listing("centros-de-salud", "commune", "28079"))?.n).toBe(7);
		expect((await listing("cardiologos", "commune", "28079"))?.indexable).toBe(true);
		expect((await listing("psicologos", "commune", "28079"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'dentistas:es'")).toBe(1);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'ES'",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'ES'")).toBe(
			await count("directory.practitioners WHERE country = 'ES' AND status = 'active'"),
		);
		expect(await count("directory.practitioner_pages WHERE country = 'ES'")).toBe(
			ES_CENTRES.cases.length,
		);
	});

	it("skips unchanged extracts, and a forced rerun changes nothing", async () => {
		expect((await runSpain(base)).status).toBe("skipped");
		const before = await snapshot("ES");
		const forced = await runSpain(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("ES")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("ES");
		expect(
			(await runSpain(esDir(without(ES_ANCHORS.plainPractice)), { "dry-run": true })).status,
		).toBe("dry_run");
		expect(await snapshot("ES")).toEqual(before);
	});

	it("leaves out an extract it cannot read and keeps its centres as they are", async () => {
		const dir = esDir(without(ES_ANCHORS.dental));
		writeFileSync(join(dir, "centros_E.xlsx"), "not a workbook");
		const outcome = await runSpain(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["regcess-e"]);
		// The pharmacies were not read: none counts as missing.
		expect(
			await count(
				"directory.practitioners WHERE country = 'ES' AND profession_code = 'ES_PHARMACY' AND missing_runs > 0",
			),
		).toBe(0);
		expect((await centre(ES_ANCHORS.pharmacy))?.status).toBe("active");
		// The dental clinic missing from the extract that was read: once.
		expect(await centre(ES_ANCHORS.dental)).toMatchObject({ status: "active", missing_runs: 1 });
		// A run that left an extract out never makes the next one skip it.
		expect((await runSpain(base)).status).toBe("succeeded");
		expect((await centre(ES_ANCHORS.dental))?.missing_runs).toBe(0);
	});

	it("removes a centre after two consecutive runs without it", async () => {
		const dir = esDir(without(ES_ANCHORS.plainPractice));
		expect((await runSpain(dir, { force: true })).status).toBe("succeeded");
		expect(await centre(ES_ANCHORS.plainPractice)).toMatchObject({
			status: "active",
			missing_runs: 1,
		});
		expect((await runSpain(dir, { force: true })).status).toBe("succeeded");
		expect((await centre(ES_ANCHORS.plainPractice))?.status).toBe("removed");
		expect(
			await count(
				`directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.national_id = '${ES_ANCHORS.plainPractice}' AND p.country = 'ES'`,
			),
		).toBe(0);
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('ES', 'ES-REGCESS', ${ES_ANCHORS.namedDoctor}, 'objection (test)')
		`;
		const outcome = await runSpain(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			"regcess-c2": { idScheme: "ES-REGCESS", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await centre(ES_ANCHORS.namedDoctor)).toBeUndefined();
		expect(await siteOf(ES_ANCHORS.namedDoctor)).toBeUndefined();
		expect((await runSpain(base, { force: true })).status).toBe("succeeded");
		expect(
			await count(
				`directory.practitioners WHERE country = 'ES' AND national_id = '${ES_ANCHORS.namedDoctor}'`,
			),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Spain's pages until approved", async () => {
		const dir = esDir({ ...ES_CENTRES, fillerStreetSuffix: " OESTE" });
		const blocked = await runSpain(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE address_line LIKE '% Oeste,%'")).toBe(0);
		const approved = await runSpain(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source LIKE 'es-regcess-%' AND address_line LIKE '% Oeste,%'",
			),
		).toBeGreaterThan(150);
	});
});
