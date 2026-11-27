/**
 * End-to-end Estonian import over the SYNTHETIC fixtures (`fixtures/generate-ee.ts`), next to the
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
	EE_FACILITIES,
	type EeFixtureSet,
	withFillerPhones,
	writeEeFixtures,
} from "../fixtures/generate-ee";
import { buildEeOptions, buildFrOptions } from "../src/config";
import { runEe } from "../src/run-ee";
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

function eeDir(set: EeFixtureSet = EE_FACILITIES): string {
	const dir = tempDir("ee");
	writeEeFixtures(dir, set);
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
		["as-of", "2026-11-27"],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runEstonia = (dir: string, flags: Record<string, string | true> = {}) =>
	runEe(buildEeOptions(offline(dir, flags), env()), () => {});
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

/** The fixture set without the providers and pharmacies named `name` in the files (`Näidise Logopeed OÜ`). */
const without = (name: string): EeFixtureSet => ({
	...EE_FACILITIES,
	providers: EE_FACILITIES.providers.filter((row) => row.name !== name),
	pharmacies: EE_FACILITIES.pharmacies.filter((row) => row.name !== name),
});

describe.skipIf(!url)("etl:ee on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = eeDir();

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
	type Site = {
		id: number;
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
		lon: number | null;
		address_line: string | null;
		postcode: string | null;
		phone: string | null;
		commune_label: string | null;
	};
	const sites = async (name: string) =>
		sql<Site[]>`
			SELECT p.id, p.id_scheme, p.national_id, p.slug, p.last_name, p.first_name, p.profession_code,
				p.listing_slug, p.status, p.indexable, p.missing_runs, pl.name AS place,
				pl.code AS place_code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon, s.address_line,
				s.postcode, s.phone, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'EE' AND p.last_name = ${name}
			ORDER BY pl.code
		`;
	const provider = async (name: string) => (await sites(name))[0];
	const qualifications = async (id: number) =>
		sql<{ source: string; code: string; label: string }[]>`
			SELECT source, code, label FROM directory.practitioner_qualifications
			WHERE practitioner_id = ${id} ORDER BY source, code
		`;
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'EE' AND p.kind = ${kind} AND p.code = ${code}
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

	it("imports places and providers without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runEstonia(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.providers).toBe(223);
		expect(totals.unlocated).toBe(0);
		expect(totals.centroid).toBe(2);
		expect(totals.byProfession).toEqual({
			EE_HOSPITAL: 1,
			EE_FAMILY_PRACTICE: 51,
			EE_DENTAL: 51,
			EE_SPECIALIST: 51,
			EE_NURSING: 1,
			EE_MIDWIFERY: 1,
			EE_PHYSIOTHERAPY: 1,
			EE_PSYCHOLOGY: 1,
			EE_SPEECH_THERAPY: 1,
			EE_PHARMACY: 64,
		});
		expect(outcome.stats.sources).toMatchObject({
			medre: { lines: 164, rows: 160, quarantined: 1, edition: 20261127 },
			apteegid: { lines: 66, rows: 64, counters: { sharedPhones: 4 } },
		});
		expect(outcome.stats.batch).toMatchObject({
			placement: { address: 222, settlement: 2, unplaced: 1, withoutPlace: 1 },
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'EE' AND kind = '${kind}'`);
		expect(await places("region")).toBe(6);
		expect(await places("department")).toBe(9);
		expect(await places("commune")).toBe(11);
		const [tallinn] = await sql<{ slug: string; name: string; region_code: string }[]>`
			SELECT slug, name, region_code FROM directory.places
			WHERE country = 'EE' AND kind = 'department' AND code = '0784'
		`;
		expect(tallinn).toEqual({ slug: "tallinn", name: "Tallinn", region_code: "0037" });
		// France's next run keeps Estonia as it is.
		const estonia = await snapshot("EE");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("EE")).toEqual(estonia);
	});

	it("keys a provider by its first licence, keeps its places and licences, and nothing else", async () => {
		const hospital = await sites("Näidise Haigla");
		const tartu = hospital.find((site) => site.place_code === "8151");
		const village = hospital.find((site) => site.place_code === "2049");
		expect(hospital).toHaveLength(2);
		expect(tartu).toMatchObject({
			id_scheme: "EE-TTL",
			national_id: "00011",
			slug: "naidise-haigla-l00011",
			first_name: "",
			profession_code: "EE_HOSPITAL",
			listing_slug: "haiglad",
			indexable: true,
			place: "Tartu linn",
			place_code: "8151",
			precision: "address",
			geo_source: "source",
			address_line: "Näidise tn 1",
			postcode: "50410",
			commune_label: "Tartu",
			phone: null,
		});
		expect(tartu?.lat).toBeCloseTo(58.3712, 5);
		// A village named alone: at its centre, city precision, no street.
		expect(village).toMatchObject({
			place: "Ilmatsalu küla",
			precision: "city",
			geo_source: "centroid",
			address_line: null,
			postcode: null,
		});
		expect(await qualifications(tartu?.id ?? 0)).toEqual([
			{ source: "haiglaliik", code: "YLD", label: "Üldhaigla" },
			{ source: "teenus", code: "T0038", label: "ambulatoorsed üldkirurgiateenused" },
			{ source: "teenus", code: "T0058", label: "intensiivraviteenused" },
			{ source: "teenus", code: "T0204", label: "koduõendusteenus" },
			{ source: "tegevusluba", code: "L00011", label: "Eriarstiabi" },
			{ source: "tegevusluba", code: "L00012", label: "Õendusabi" },
		]);
		expect(await provider("Näidise Perearstikeskus")).toMatchObject({
			profession_code: "EE_FAMILY_PRACTICE",
			place_code: "0298",
			commune_label: "Tallinn",
			address_line: "Näite pst 7",
		});
		// A single-town municipality: its town has the municipality's code.
		expect(await provider("Hambakliinik Näide")).toMatchObject({
			listing_slug: "hambaravi",
			place_code: "0296",
			commune_label: "Keila",
		});
		expect((await provider("Näidise Õendushaigla"))?.listing_slug).toBe("oendusabi");
		// An ambulance, a school nurse, an ended licence, a broken one, an unknown place: no page.
		for (const name of [
			"Näidise Kiirabi",
			"Näidise Koolitervishoid",
			"Näidise Lõppenud Kliinik",
			"Näidise Vigane Kliinik",
			"Näidise Kaugkliinik",
		]) {
			expect(await provider(name), name).toBeUndefined();
		}
		// Health workers, registry codes, legal addresses: never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'EE' AND (
				concat_ws('|', p.last_name, p.last_name_source, p.national_id, s.address_line, s.name,
					s.legal_name, s.trade_name, s.commune_label) ~ '(Mari|Jaan|D99001|19999999|90099901|registriaadress|Pille|Proviisor|example\\.test|Näidisapteegid)'
				OR s.email IS NOT NULL OR s.fax IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.practitioner_qualifications q JOIN directory.practitioners p ON p.id = q.practitioner_id WHERE p.country = 'EE' AND q.label ~ '(Mari|Jaan|Arst$)'",
			),
		).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'ee' AND stats::text ~ 'Näidis|Mari|D99001'"),
		).toBe(0);
	});

	it("locates pharmacies by address id or address and drops a chain's number", async () => {
		expect(await provider("Näidise Apteek")).toMatchObject({
			id_scheme: "EE-APT",
			national_id: "9001",
			slug: "naidise-apteek-ap9001",
			profession_code: "EE_PHARMACY",
			listing_slug: "apteegid",
			place_code: "8151",
			precision: "address",
			phone: "+3726990001",
		});
		const kesklinn = await provider("Näidisapteek Kesklinn");
		expect(kesklinn).toMatchObject({ place_code: "0298", precision: "address", postcode: "10118" });
		expect(await qualifications(kesklinn?.id ?? 0)).toEqual([
			{ source: "apteegi-tegevusluba", code: "902", label: "Üldapteek" },
		]);
		// A hospital's and a veterinary pharmacy: left out.
		expect(await provider("Näidise Haiglaapteek")).toBeUndefined();
		expect(await provider("Näidise Loomaapteek")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'ee-ravimiamet' AND phone = '+3726999999'"),
		).toBe(0);
	});

	it("builds Estonia's read models: municipality and settlement listings, no county listing", async () => {
		expect((await listing("perearstikeskused", "department", "0784"))?.n).toBe(51);
		expect((await listing("haiglad", "department", "0793"))?.n).toBe(1);
		expect((await listing("haiglad", "commune", "2049"))?.n).toBe(1);
		expect((await listing("apteegid", "department", "0784"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'apteegid:ee'")).toBe(1);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'EE'",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'EE'")).toBe(223);
		expect(await count("directory.practitioner_pages WHERE country = 'EE'")).toBe(223);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runEstonia(base)).status).toBe("skipped");
		const before = await snapshot("EE");
		const forced = await runEstonia(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("EE")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("EE");
		expect(
			(await runEstonia(eeDir(without("Näidise Silmakeskus AS")), { "dry-run": true })).status,
		).toBe("dry_run");
		expect(await snapshot("EE")).toEqual(before);
	});

	it("never goes back to an older extract of the register", async () => {
		const outcome = await runEstonia(eeDir({ ...EE_FACILITIES, extract: "2026-11-20T08:00:00" }), {
			force: true,
		});
		expect(outcome.sourceErrors).toMatchObject({
			medre: expect.stringMatching(/extract of 20261120 vs 20261127/),
		});
		expect(outcome.status).toBe("succeeded");
		expect((await provider("Näidise Haigla"))?.missing_runs).toBe(0);
		expect((await runEstonia(base, { force: true })).status).toBe("succeeded");
	});

	it("leaves out a source it cannot read and keeps its pharmacies as they are", async () => {
		const dir = eeDir();
		writeFileSync(join(dir, "apteekide_koondandmed.csv"), "not an export\n".repeat(400));
		const outcome = await runEstonia(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["apteegid"]);
		expect(
			await count(
				"directory.practitioners WHERE country = 'EE' AND id_scheme = 'EE-APT' AND missing_runs > 0",
			),
		).toBe(0);
		expect((await provider("Näidise Apteek"))?.status).toBe("active");
		// A run that left a source out never makes the next one skip it.
		expect((await runEstonia(base)).status).toBe("succeeded");
	});

	it("fails without the address file, and leaves the pages as they are", async () => {
		const dir = eeDir();
		writeFileSync(join(dir, "sihtnumbrid.zip"), "x");
		const before = await snapshot("EE");
		await expect(runEstonia(dir, { force: true })).rejects.toThrow(/ADS address file/);
		expect(await snapshot("EE")).toEqual(before);
	});

	it("removes a provider after two consecutive runs without it", async () => {
		const dir = eeDir(without("Näidise Logopeed OÜ"));
		expect((await runEstonia(dir, { force: true })).status).toBe("succeeded");
		expect(await provider("Näidise Logopeed")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runEstonia(dir, { force: true })).status).toBe("succeeded");
		expect((await provider("Näidise Logopeed"))?.status).toBe("removed");
		expect(
			await count(
				"directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.country = 'EE' AND p.national_id = '00101'",
			),
		).toBe(0);
		expect((await runEstonia(base, { force: true })).status).toBe("succeeded");
		expect((await provider("Näidise Logopeed"))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		const target = await provider("Näidisfüsio");
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('EE', 'EE-TTL', ${target?.national_id ?? ""}, 'objection (test)')
		`;
		const outcome = await runEstonia(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			medre: { idScheme: "EE-TTL", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await provider("Näidisfüsio")).toBeUndefined();
		expect(
			await count(
				`directory.sites WHERE source = 'ee-medre' AND source_key LIKE '${target?.national_id}-%'`,
			),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Estonia's pages until approved", async () => {
		const dir = eeDir(withFillerPhones(EE_FACILITIES, "5199"));
		const blocked = await runEstonia(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(
			await count("directory.sites WHERE source = 'ee-ravimiamet' AND phone LIKE '+3725199%'"),
		).toBe(0);
		const approved = await runEstonia(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count("directory.sites WHERE source = 'ee-ravimiamet' AND phone LIKE '+3725199%'"),
		).toBe(62);
	});
});
