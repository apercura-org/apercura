/**
 * End-to-end Cypriot import over the SYNTHETIC fixtures (`fixtures/generate-cy.ts`), next to the
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
import { CY_FACILITIES, type CyFixtureSet, writeCyFixtures } from "../fixtures/generate-cy";
import { buildCyOptions, buildFrOptions } from "../src/config";
import { runCy } from "../src/run-cy";
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

function cyDir(set: CyFixtureSet = CY_FACILITIES): string {
	const dir = tempDir("cy");
	writeCyFixtures(dir, set);
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
const runCyprus = (dir: string, flags: Record<string, string | true> = {}) =>
	runCy(buildCyOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

/** The fixture set without the pharmacy of registration number `number`. */
const withoutPharmacy = (number: string): CyFixtureSet => ({
	...CY_FACILITIES,
	pharmacies: CY_FACILITIES.pharmacies.filter((row) => row.number !== number),
});

describe.skipIf(!url)("etl:cy on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = cyDir();

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
	type Facility = {
		id_scheme: string;
		national_id: string;
		slug: string;
		last_name: string;
		first_name: string;
		profession_code: string;
		listing_slug: string;
		status: string;
		indexable: boolean;
		missing_runs: number;
		place: string | null;
		place_code: string | null;
		precision: string | null;
		geo_source: string | null;
		lat: number | null;
		address_line: string | null;
		postcode: string | null;
		phone: string | null;
		commune_label: string | null;
	};
	const facility = async (name: string) => {
		const [row] = await sql<Facility[]>`
			SELECT p.id_scheme, p.national_id, p.slug, p.last_name, p.first_name, p.profession_code,
				p.listing_slug, p.status, p.indexable, p.missing_runs, pl.name AS place,
				pl.code AS place_code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, s.address_line, s.postcode, s.phone, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'CY' AND p.last_name = ${name}
		`;
		return row;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'CY' AND p.kind = ${kind} AND p.code = ${code}
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

	it("imports places and facilities without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runCyprus(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.facilities).toBe(176);
		expect(totals.unlocated).toBe(0);
		expect(totals.atAddress).toBe(3);
		expect(totals.byProfession).toEqual({ CY_PHARMACY: 162, CY_HOSPITAL: 4, CY_HEALTH_CENTRE: 10 });
		expect(outcome.stats.sources).toMatchObject({
			farmakeia: {
				lines: 165,
				rows: 163,
				quarantined: 1,
				skipped: { "same pharmacy": 1 },
				counters: { mobilePhones: 1, sharedPhones: 4 },
			},
			nosokomeia: { lines: 4, rows: 4, quarantined: 0 },
			kentra: { lines: 11, rows: 11, quarantined: 0 },
		});
		expect(outcome.stats.batch).toMatchObject({
			placement: { byPostcode: 163, byName: 13, byPoint: 0, unplaced: 2 },
		});
		expect(await snapshot("FR")).toEqual(france);
		// The five districts the Government controls, and the units the census counted only.
		expect(
			await sql`SELECT code, name, slug FROM directory.places WHERE country = 'CY' AND kind = 'department' ORDER BY code`,
		).toEqual([
			{ code: "1", name: "Επαρχία Λευκωσίας", slug: "eparchia-lefkosias" },
			{ code: "3", name: "Επαρχία Αμμοχώστου", slug: "eparchia-ammochostou" },
			{ code: "4", name: "Επαρχία Λάρνακας", slug: "eparchia-larnakas" },
			{ code: "5", name: "Επαρχία Λεμεσού", slug: "eparchia-lemesou" },
			{ code: "6", name: "Επαρχία Πάφου", slug: "eparchia-pafou" },
		]);
		expect(await count("directory.places WHERE country = 'CY' AND kind = 'commune'")).toBe(7);
		expect(
			await count("directory.places WHERE country = 'CY' AND code IN ('3000', '2000', '100001')"),
		).toBe(0);
		const [strovolos] = await sql<{ slug: string; postcodes: string[]; population: number }[]>`
			SELECT slug, postcodes, population FROM directory.places
			WHERE country = 'CY' AND kind = 'commune' AND code = '1012'
		`;
		expect(strovolos).toEqual({
			slug: "strovolos",
			postcodes: ["2003", "2029"],
			population: 71123,
		});
		const [aglantzia] = await sql<{ name: string; slug: string }[]>`
			SELECT name, slug FROM directory.places WHERE country = 'CY' AND code = '1013'
		`;
		expect(aglantzia).toEqual({ name: "Αγλαντζιά", slug: "aglantzia" });
		// France's next run keeps Cyprus as it is.
		const cyprus = await snapshot("CY");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("CY")).toEqual(cyprus);
	});

	it("names a pharmacy after its address, by its registration number, and never its pharmacist", async () => {
		expect(await facility("Φαρμακείο, Οδός Παραδείγματος 12, Λευκωσία")).toMatchObject({
			id_scheme: "CY-FARM",
			national_id: "101",
			slug: "farmakeio-odos-paradeigmatos-12-lefkosia-f101",
			first_name: "",
			profession_code: "CY_PHARMACY",
			listing_slug: "farmakeia",
			indexable: true,
			place: "Λευκωσία",
			place_code: "1000",
			precision: "city",
			geo_source: "centroid",
			address_line: "Οδός Παραδείγματος 12",
			postcode: "1010",
			commune_label: "Λευκωσία",
			phone: "+35722000101",
		});
		// The town repeated after the street is dropped; an unknown postcode is placed by its town.
		expect(await facility("Φαρμακείο, Λεωφ. Παραδείγματος 2, Αγία Νάπα")).toMatchObject({
			address_line: "Λεωφ. Παραδείγματος 2",
			place_code: "3100",
		});
		expect(await facility("Φαρμακείο, Οδός Παραδείγματος 7, Λεμεσός")).toMatchObject({
			place_code: "5000",
			postcode: "3999",
		});
		// A mobile number, a switchboard's: not shown. A second pharmacist of one pharmacy: one page.
		expect((await facility("Φαρμακείο, Οδός Υποδείγματος 9, Πάφος"))?.phone).toBeNull();
		expect(
			await count("directory.sites WHERE country_code = 'CY' AND phone = '+35722000999'"),
		).toBe(0);
		expect(
			await count("directory.practitioners WHERE country = 'CY' AND national_id = '106'"),
		).toBe(0);
		// Nowhere known, or no registration number: no page.
		expect(
			await count(
				"directory.practitioners WHERE country = 'CY' AND national_id IN ('108', 'x109')",
			),
		).toBe(0);
		// The pharmacist's name, house telephone number and the landmark line: never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'CY' AND (
				concat_ws('|', p.last_name, p.first_name, p.last_name_source, s.address_line, s.name,
					s.commune_label, s.phone) ~ '(Δοκιμ|99000001|κατάστημα)'
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'cy' AND stats::text ~ 'Δοκιμ|99000001'"),
		).toBe(0);
	});

	it("places the state hospitals at their point and the health centres by their name", async () => {
		const general = await facility("Γενικό Νοσοκομείο Παραδείγματος");
		expect(general).toMatchObject({
			id_scheme: "CY-MOH",
			profession_code: "CY_HOSPITAL",
			listing_slug: "nosokomeia",
			place_code: "1012",
			precision: "address",
			geo_source: "source",
			address_line: "Οδός Παραδείγματος 215",
			postcode: "2029",
			commune_label: "Στρόβολος",
			phone: "+35722000201",
		});
		expect(general?.national_id).toMatch(/^[0-9a-f]{10}$/);
		expect(general?.slug).toBe(`geniko-nosokomeio-paradeigmatos-m${general?.national_id}`);
		expect(general?.lat).toBeCloseTo(35.1275, 4);
		// An address on two lines; a hospital the list gives no point for, at its community's centre.
		expect(await facility("Νοσοκομείο Υποδείγματος Πάφου")).toMatchObject({
			place_code: "6000",
			postcode: "8020",
			address_line: "Οδός Υποδείγματος 4",
		});
		expect(await facility("Αγροτικό Νοσοκομείο Παραδείγματος")).toMatchObject({
			place_code: "3100",
			precision: "city",
			address_line: null,
		});
		expect(await facility("Κέντρο Υγείας Παραδείγματος Αγίας Νάπας")).toMatchObject({
			profession_code: "CY_HEALTH_CENTRE",
			listing_slug: "kentra-ygeias",
			place_code: "3100",
			precision: "city",
			phone: "+35723000304",
		});
		expect((await facility("Κέντρο Υγείας Παραδείγματος Στροβόλου"))?.phone).toBe("+35722000301");
		expect((await facility("Κέντρο Υγείας Παραδείγματος Αγλαντζιάς"))?.place_code).toBe("1013");
		expect(await facility("Κέντρο Υγείας Παραδείγματος")).toBeUndefined();
		// Fax numbers are never read.
		expect(
			await count(
				"directory.sites WHERE country_code = 'CY' AND (fax IS NOT NULL OR phone LIKE '%0399')",
			),
		).toBe(0);
	});

	it("builds Cyprus's read models: district and municipality listings", async () => {
		expect((await listing("farmakeia", "department", "1"))?.n).toBe(70);
		expect((await listing("farmakeia", "commune", "1012"))?.n).toBe(24);
		expect((await listing("nosokomeia", "commune", "1012"))?.n).toBe(1);
		expect((await listing("kentra-ygeias", "department", "1"))?.n).toBe(4);
		expect(await count("directory.landing_pages WHERE key = 'farmakeia:cy'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'CY'")).toBe(176);
		expect(await count("directory.practitioner_pages WHERE country = 'CY'")).toBe(176);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runCyprus(base)).status).toBe("skipped");
		const before = await snapshot("CY");
		const forced = await runCyprus(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("CY")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("CY");
		expect((await runCyprus(cyDir(withoutPharmacy("103")), { "dry-run": true })).status).toBe(
			"dry_run",
		);
		expect(await snapshot("CY")).toEqual(before);
	});

	it("leaves out a list it cannot read and keeps its facilities as they are", async () => {
		const dir = cyDir();
		writeFileSync(join(dir, "kentra-ygeias.csv"), "not a list\n".repeat(40));
		const outcome = await runCyprus(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["kentra"]);
		// The hospitals share the health centres' scheme: neither is counted missing.
		expect(
			await count(
				"directory.practitioners WHERE country = 'CY' AND id_scheme = 'CY-MOH' AND missing_runs > 0",
			),
		).toBe(0);
		expect((await facility("Κέντρο Υγείας Παραδείγματος Λάρνακας"))?.status).toBe("active");
		// A run that left a list out never makes the next one skip it.
		expect((await runCyprus(base)).status).toBe("succeeded");
	});

	it("removes a pharmacy after two consecutive runs without it", async () => {
		const name = "Φαρμακείο, Οδός Παραδείγματος 51Γ, Λάρνακα";
		const dir = cyDir(withoutPharmacy("103"));
		expect((await runCyprus(dir, { force: true })).status).toBe("succeeded");
		expect(await facility(name)).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runCyprus(dir, { force: true })).status).toBe("succeeded");
		expect((await facility(name))?.status).toBe("removed");
		expect((await runCyprus(base, { force: true })).status).toBe("succeeded");
		expect((await facility(name))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('CY', 'CY-FARM', '102', 'objection (test)')
		`;
		const outcome = await runCyprus(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			farmakeia: { idScheme: "CY-FARM", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await facility("Φαρμακείο, Λεωφ. Υποδείγματος 5, Κατ. 2, Στρόβολος")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'cy-farmakeia' AND source_key = '102'"),
		).toBe(0);
	});
});
