/**
 * End-to-end Italian import over the SYNTHETIC fixtures (`fixtures/generate-it.ts`), next to the
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
	IT_HOSPITALS,
	IT_PLACES,
	type ItFixtureSet,
	itFixtureSet,
	openShops,
	writeItFixtures,
} from "../fixtures/generate-it";
import { buildCzOptions, buildFrOptions, buildItOptions } from "../src/config";
import { runCz } from "../src/run-cz";
import { runFr } from "../src/run-fr";
import { runIt } from "../src/run-it";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function itDir(set: ItFixtureSet = IT_PLACES): string {
	const dir = tempDir("it");
	writeItFixtures(dir, set);
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
const runItaly = (dir: string, flags: Record<string, string | true> = {}) =>
	runIt(buildItOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});
const runCzechia = (dir: string, flags: Record<string, string | true> = {}) =>
	runCz(buildCzOptions(offline(dir, flags), env()), () => {});

const PHARMACIES = openShops(IT_PLACES.pharmacies).length;
const PARAPHARMACIES = openShops(IT_PLACES.parapharmacies).length;
const CLINICS = IT_HOSPITALS.filter((hospital) => hospital.typeCode.startsWith("5")).length;

describe.skipIf(!url)("etl:it on synthetic fixtures, next to France and Czechia", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = itDir();
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
	const place = async (scheme: string, id: string) => {
		const [row] = await sql<
			{
				id: number;
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
			SELECT id, slug, last_name, first_name, profession_code, listing_slug, status, indexable,
				missing_runs
			FROM directory.practitioners
			WHERE country = 'IT' AND id_scheme = ${scheme} AND national_id = ${id}
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
				located: boolean;
				address_line: string | null;
				postcode: string | null;
				commune_label: string | null;
			}[]
		>`
			SELECT p.name AS place, p.kind, p.department_code AS department, s.geo_precision AS precision,
				s.geo_source, s.location IS NOT NULL AS located, s.address_line, s.postcode, s.commune_label
			FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
			WHERE s.source = ${source} AND s.source_key = ${key}
		`;
		return row;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'IT' AND p.kind = ${kind} AND p.code = ${code}
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

	it("imports the three lists without touching France or Czechia", async () => {
		const others = { FR: await snapshot("FR"), CZ: await snapshot("CZ") };
		const outcome = await runItaly(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.places).toBe(PHARMACIES + PARAPHARMACIES + IT_HOSPITALS.length);
		expect(totals.byProfession).toEqual({
			IT_PHARMACY: PHARMACIES,
			IT_PARAPHARMACY: PARAPHARMACIES,
			IT_HOSPITAL: IT_HOSPITALS.length - CLINICS,
			IT_CLINIC: CLINICS,
		});
		expect(totals.registerPoint).toBe(0);
		expect(await snapshot("FR")).toEqual(others.FR);
		expect(await snapshot("CZ")).toEqual(others.CZ);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'IT' AND kind = '${kind}'`);
		expect(await places("region")).toBe(20);
		expect(await places("department")).toBe(6);
		expect(await places("commune")).toBe(11);
		// The other markets' runs keep Italy as it is.
		const italian = await snapshot("IT");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect((await runCzechia(czDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("IT")).toEqual(italian);
	});

	it("keeps a place's own name and type, and nothing of its owners", async () => {
		expect(await place("IT-FARM", "9000001")).toMatchObject({
			last_name: "Farmacia Esempio",
			first_name: "",
			slug: "farmacia-esempio-f9000001",
			profession_code: "IT_PHARMACY",
			listing_slug: "farmacie",
			indexable: true,
		});
		expect(await place("IT-PFARM", "900001")).toMatchObject({
			last_name: "Parafarmacia Esempio",
			listing_slug: "parafarmacie",
		});
		expect(await place("IT-HSP", "990003")).toMatchObject({
			last_name: "Casa di Cura Villa Campione",
			profession_code: "IT_CLINIC",
			listing_slug: "case-di-cura",
		});
		const qualifications = await sql<{ source: string; code: string; label: string }[]>`
			SELECT q.source, q.code, q.label FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'IT' AND p.national_id IN ('9000003', '990001')
			ORDER BY p.national_id DESC, q.source DESC, q.code
		`;
		expect(qualifications).toEqual([
			{ source: "tipo-struttura", code: "1", label: "Ospedale a gestione diretta" },
			{ source: "disciplina", code: "ACUTI", label: "Acuti (250 posti letto)" },
			{ source: "disciplina", code: "RIABILITAZIONE", label: "Riabilitazione (20 posti letto)" },
			{ source: "tipologia", code: "3", label: "Dispensario farmaceutico" },
		]);
		// The VAT numbers, the pharmacists named in company names, the closed lines' owners.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'IT' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, s.legal_name,
					s.trade_name, s.siret, s.siren) ~* '(999[0-9]{8}|fittizio mario|prova anna|modello giulia|precedente|dott)'
				OR s.phone IS NOT NULL OR s.email IS NOT NULL OR s.siret IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.etl_runs WHERE source = 'it' AND stats::text ~* 'fittizio mario|999[0-9]{8}'",
			),
		).toBe(0);
	});

	it("places sites by code, by name, else in their province, at their municipality's centre", async () => {
		expect(await siteOf("it-farmacie", "9000001")).toMatchObject({
			place: "Roma",
			kind: "commune",
			department: "258",
			precision: "city",
			geo_source: "centroid",
			address_line: "Via dell'Esempio, 1",
			postcode: "00184",
			commune_label: "Roma",
		});
		expect(await siteOf("it-farmacie", "9000003")).toMatchObject({
			place: "Fiumicino",
			address_line: "Via del Campione, 3, Fregene",
		});
		// A renumbered municipality: placed by its name in its region.
		expect(await siteOf("it-farmacie", "9000006")).toMatchObject({
			place: "Roma",
			kind: "commune",
		});
		// Neither the code nor the name is ISTAT's: the province only, unlocated.
		expect(await siteOf("it-farmacie", "9000007")).toMatchObject({
			place: "Milano",
			kind: "department",
			precision: null,
			located: false,
			commune_label: "Borgo Immaginario",
		});
		// ISTAT's Italian name of a bilingual municipality.
		expect(await siteOf("it-farmacie", "9000012")).toMatchObject({
			place: "Bolzano",
			commune_label: "Bolzano",
		});
		expect(await siteOf("it-posti-letto", "990001")).toMatchObject({
			place: "Roma",
			precision: "city",
			postcode: null,
		});
		expect(await count("directory.sites WHERE source LIKE 'it-%' AND place_id IS NULL")).toBe(0);
		expect(
			await count("directory.sites WHERE source LIKE 'it-%' AND geo_precision = 'address'"),
		).toBe(0);
	});

	it("builds Italy's read models, regions included", async () => {
		expect((await listing("farmacie", "commune", "058091"))?.indexable).toBe(true);
		expect((await listing("ospedali", "commune", "058091"))?.indexable).toBe(true);
		expect((await listing("case-di-cura", "commune", "058091"))?.indexable).toBe(true);
		expect((await listing("parafarmacie", "commune", "015146"))?.indexable).toBe(true);
		expect((await listing("farmacie", "department", "258"))?.n).toBeGreaterThan(40);
		expect((await listing("farmacie", "department", "007"))?.indexable).toBe(true);
		const lazio = await listing("farmacie", "region", "12");
		expect(lazio?.indexable).toBe(true);
		// Roma is Lazio's only province in the fixtures.
		expect(lazio?.n).toBe((await listing("farmacie", "department", "258"))?.n);
		expect(await count("directory.landing_pages WHERE key = 'farmacie:it'")).toBe(1);
		// France's and Czechia's regions still have no listing page.
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country IN ('FR', 'CZ')",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'IT'")).toBe(
			await count("directory.practitioners WHERE country = 'IT' AND status = 'active'"),
		);
		expect(await count("directory.practitioner_pages WHERE country = 'IT'")).toBe(
			PHARMACIES + PARAPHARMACIES + IT_HOSPITALS.length,
		);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runItaly(base)).status).toBe("skipped");
		const before = await snapshot("IT");
		const forced = await runItaly(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("IT")).toEqual(before);
	});

	it("keeps the register's coordinates only when asked", async () => {
		// Moving every pin is a change to review: the run is blocked, and writes nothing.
		const outcome = await runItaly(base, { "dry-run": true, "register-coordinates": true });
		expect(outcome.status).toBe("blocked");
		expect((outcome.stats.totals as Record<string, number>).registerPoint).toBeGreaterThan(100);
		expect(
			await count("directory.sites WHERE source LIKE 'it-%' AND geo_precision = 'address'"),
		).toBe(0);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("IT");
		const set = {
			...IT_PLACES,
			pharmacies: IT_PLACES.pharmacies.filter((shop) => shop.id !== "9000014"),
		};
		expect((await runItaly(itDir(set), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("IT")).toEqual(before);
	});

	it("leaves out a list it cannot read, keeps its places and imports the others", async () => {
		const dir = itDir();
		writeFileSync(join(dir, "parafarmacie.csv"), `${"not;the;expected;columns\n".repeat(3000)}`);
		const outcome = await runItaly(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["parafarmacie"]);
		expect(
			await count(
				"directory.practitioners WHERE country = 'IT' AND id_scheme = 'IT-PFARM' AND missing_runs > 0",
			),
		).toBe(0);
		expect(
			await count(
				"directory.practitioners WHERE country = 'IT' AND id_scheme = 'IT-PFARM' AND status = 'active'",
			),
		).toBe(PARAPHARMACIES);
		// A partial run never makes the next one skip.
		expect((await runItaly(base)).status).toBe("succeeded");
	});

	it("removes a place after two consecutive runs without it", async () => {
		const set = {
			...IT_PLACES,
			pharmacies: IT_PLACES.pharmacies.filter((shop) => shop.id !== "9000014"),
		};
		const dir = itDir(set);
		expect((await runItaly(dir, { force: true })).status).toBe("succeeded");
		expect(await place("IT-FARM", "9000014")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runItaly(dir, { force: true })).status).toBe("succeeded");
		expect((await place("IT-FARM", "9000014"))?.status).toBe("removed");
		expect(
			await count(
				"directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.national_id = '9000014' AND p.country = 'IT'",
			),
		).toBe(0);
	});

	it("always honours an objection: the lines are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('IT', 'IT-FARM', '9000013', 'objection (test)')
		`;
		const outcome = await runItaly(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			farmacie: { idScheme: "IT-FARM", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await place("IT-FARM", "9000013")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'it-farmacie' AND source_key = '9000013'"),
		).toBe(0);
		expect((await runItaly(base, { force: true })).status).toBe("succeeded");
		expect(
			await count("directory.practitioners WHERE country = 'IT' AND national_id = '9000013'"),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Italy's pages until approved", async () => {
		const dir = itDir(itFixtureSet(" Nuova"));
		const blocked = await runItaly(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(
			await count("directory.sites WHERE address_line LIKE 'Via del Riempimento Nuova%'"),
		).toBe(0);
		const approved = await runItaly(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source = 'it-farmacie' AND address_line LIKE 'Via del Riempimento Nuova%'",
			),
		).toBeGreaterThan(100);
	});
});
