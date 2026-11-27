/**
 * End-to-end Norwegian import over the SYNTHETIC fixtures (`fixtures/generate-no.ts`), next to
 * the French one, against a real PostgreSQL + PostGIS database with the migrations applied.
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
import { NO_KEYS, type NoFixtureOptions, writeNoFixtures } from "../fixtures/generate-no";
import { buildFrOptions, buildNoOptions } from "../src/config";
import { runFr } from "../src/run-fr";
import { runNo } from "../src/run-no";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function noDir(options: NoFixtureOptions = {}): string {
	const dir = tempDir("no");
	writeNoFixtures(dir, options);
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
const runNorway = (dir: string, flags: Record<string, string | true> = {}) =>
	runNo(buildNoOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

describe.skipIf(!url)("etl:no on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = noDir();

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
	type Page = {
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
		department_code: string | null;
		precision: string | null;
		geo_source: string | null;
		lat: number | null;
		address_line: string | null;
		postcode: string | null;
		phone: string | null;
		commune_label: string | null;
	};
	const establishment = async (nationalId: string) => {
		const [row] = await sql<Page[]>`
			SELECT p.id, p.id_scheme, p.national_id, p.slug, p.last_name, p.first_name, p.profession_code,
				p.listing_slug, p.status, p.indexable, p.missing_runs, pl.name AS place,
				pl.code AS place_code, pl.department_code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, s.address_line, s.postcode, s.phone, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'NO' AND p.national_id = ${nationalId}
		`;
		return row;
	};
	const qualifications = async (id: number) =>
		sql<{ source: string; code: string; label: string }[]>`
			SELECT source, code, label FROM directory.practitioner_qualifications
			WHERE practitioner_id = ${id} ORDER BY source, code
		`;
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'NO' AND p.kind = ${kind} AND p.code = ${code}
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

	it("imports places and establishments without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runNorway(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.establishments).toBe(150);
		expect(totals.atAddress).toBe(149);
		expect(totals.atPostcode).toBe(1);
		expect(totals.unlocated).toBe(0);
		expect(totals.byProfession).toEqual({
			NO_HOSPITAL: 1,
			NO_MENTAL_HEALTH: 1,
			NO_GP: 29,
			NO_EMERGENCY: 1,
			NO_SPECIALIST: 29,
			NO_DENTAL: 30,
			NO_NURSING_HOME: 29,
			NO_PHARMACY: 30,
		});
		expect(outcome.stats.sources).toMatchObject({
			brreg: {
				lines: 160,
				candidates: 159,
				rows: 151,
				quarantined: 0,
				skipped: {
					"sole-proprietorship": 1,
					"named-after-a-person": 2,
					"not-a-place-of-care": 2,
					"no-place-of-care-in-name": 1,
					"winding-up": 1,
					closed: 1,
				},
				counters: { sharedPhones: 4, careOfLines: 1 },
			},
		});
		expect(outcome.stats.batch).toMatchObject({
			placement: { address: 149, postcode: 1, municipality: 0, unplaced: 1 },
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'NO' AND kind = '${kind}'`);
		expect(await places("region")).toBe(0);
		expect(await places("department")).toBe(5);
		expect(await places("commune")).toBe(7);
		const [tromso] = await sql<{ slug: string; name: string; department_code: string }[]>`
			SELECT slug, name, department_code FROM directory.places
			WHERE country = 'NO' AND kind = 'commune' AND code = '5501'
		`;
		expect(tromso).toEqual({ slug: "tromso", name: "Tromsø", department_code: "55" });
		// France's next run keeps Norway as it is.
		const norway = await snapshot("NO");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("NO")).toEqual(norway);
	});

	it("keys an establishment by its organisation number and keeps its kind, place and owner", async () => {
		const hospital = await establishment(NO_KEYS.hospital);
		expect(hospital).toMatchObject({
			id_scheme: "NO-ORGNR",
			slug: `eksempel-universitetssykehus-hf-avd-ulleval-${NO_KEYS.hospital}`,
			last_name: "Eksempel Universitetssykehus HF avd. Ullevål",
			first_name: "",
			profession_code: "NO_HOSPITAL",
			listing_slug: "sykehus",
			indexable: true,
			place: "Oslo",
			place_code: "0301",
			department_code: "03",
			precision: "address",
			geo_source: "source",
			address_line: "Eksempelveien 1",
			postcode: "0450",
			commune_label: "Oslo",
			phone: null,
		});
		expect(await qualifications(hospital?.id ?? 0)).toEqual([
			{
				source: "eier",
				code: expect.stringMatching(/^\d{9}$/),
				label: "Eksempel Universitetssykehus HF",
			},
			{ source: "naeringskode", code: "86.101", label: "Somatiske sykehustjenester" },
		]);
		expect(await establishment(NO_KEYS.emergency)).toMatchObject({
			last_name: "Eksempel Interkommunale Legevakt",
			listing_slug: "legevakter",
			place_code: "5001",
		});
		expect(await establishment(NO_KEYS.dental)).toMatchObject({
			listing_slug: "tannklinikker",
			place: "Ullensaker",
			commune_label: "Jessheim",
		});
		// A company's practice: its owner is never named.
		const gp = await establishment(NO_KEYS.gp);
		expect(gp).toMatchObject({ last_name: "Eksempel Legesenter", listing_slug: "legekontorer" });
		expect((await qualifications(gp?.id ?? 0)).map((row) => row.source)).toEqual(["naeringskode"]);
		expect(await establishment(NO_KEYS.pharmacy)).toMatchObject({
			listing_slug: "apotek",
			phone: "+4722123456",
		});
		// Not in the address file: at its postcode's centre, city precision.
		expect(await establishment(NO_KEYS.pharmacyAtPostcode)).toMatchObject({
			last_name: "Eksempel Apotek Tromsø",
			precision: "city",
			geo_source: "postcode",
		});
		// A care-of line is never kept.
		expect((await establishment(NO_KEYS.careOf))?.address_line).toBe("Eksempelveien 11");
	});

	it("never lists people, holding companies, closed or failing units, or Svalbard", async () => {
		for (const key of [
			"soleProprietorship",
			"namedAfterDoctor",
			"holding",
			"noCareWord",
			"physiotherapy",
			"bankruptOwner",
			"purchasing",
			"closed",
			"svalbard",
			"partners",
		] as const) {
			expect(await establishment(NO_KEYS[key]), key).toBeUndefined();
		}
		// E-mails, mobile numbers, care-of names, a shared number: never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'NO' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, s.legal_name,
					s.trade_name, s.commune_label, s.phone) ~ '(Kari|Ola|example|eksempel\\.example|\\+4791234567|\\+4722999999)'
				OR s.email IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'no' AND stats::text ~ 'Eksempel|Kari|Ola'"),
		).toBe(0);
	});

	it("builds Norway's read models: county and municipality listings", async () => {
		expect((await listing("sykehjem", "department", "46"))?.n).toBe(9);
		expect((await listing("tannklinikker", "commune", "3209"))?.n).toBeGreaterThan(0);
		expect((await listing("apotek", "commune", "5501"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'apotek:no'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'NO'")).toBe(150);
		expect(await count("directory.practitioner_pages WHERE country = 'NO'")).toBe(150);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runNorway(base)).status).toBe("skipped");
		const before = await snapshot("NO");
		const forced = await runNorway(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("NO")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("NO");
		expect(
			(await runNorway(noDir({ without: [NO_KEYS.specialist] }), { "dry-run": true })).status,
		).toBe("dry_run");
		expect(await snapshot("NO")).toEqual(before);
	});

	it("fails on a file it cannot read, and leaves the pages as they are", async () => {
		const dir = noDir();
		writeFileSync(join(dir, "enheter.csv.gz"), "not the register\n".repeat(400));
		const before = await snapshot("NO");
		const outcome = await runNorway(dir, { force: true });
		expect(outcome.status).toBe("failed");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["brreg"]);
		expect(await snapshot("NO")).toEqual(before);
		// The files last imported are still the ones of the last success: nothing to do.
		expect((await runNorway(base)).status).toBe("skipped");
	});

	it("fails without the address file, and leaves the pages as they are", async () => {
		const dir = noDir();
		writeFileSync(join(dir, "adresser.zip"), "x");
		const before = await snapshot("NO");
		await expect(runNorway(dir, { force: true })).rejects.toThrow(/address file/);
		expect(await snapshot("NO")).toEqual(before);
	});

	it("removes an establishment after two consecutive runs without it", async () => {
		const dir = noDir({ without: [NO_KEYS.specialist] });
		expect((await runNorway(dir, { force: true })).status).toBe("succeeded");
		expect(await establishment(NO_KEYS.specialist)).toMatchObject({
			status: "active",
			missing_runs: 1,
		});
		expect((await runNorway(dir, { force: true })).status).toBe("succeeded");
		expect((await establishment(NO_KEYS.specialist))?.status).toBe("removed");
		expect(
			await count(
				`directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.country = 'NO' AND p.national_id = '${NO_KEYS.specialist}'`,
			),
		).toBe(0);
		expect((await runNorway(base, { force: true })).status).toBe("succeeded");
		expect((await establishment(NO_KEYS.specialist))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('NO', 'NO-ORGNR', ${NO_KEYS.nursingHome}, 'objection (test)')
		`;
		const outcome = await runNorway(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			brreg: { idScheme: "NO-ORGNR", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await establishment(NO_KEYS.nursingHome)).toBeUndefined();
		expect(
			await count(
				`directory.sites WHERE source = 'no-brreg' AND source_key = '${NO_KEYS.nursingHome}'`,
			),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Norway's pages until approved", async () => {
		const dir = noDir({
			fillerPhone: (index) => `22 97 ${String(10 + (index % 90)).padStart(2, "0")} 00`,
		});
		const blocked = await runNorway(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE source = 'no-brreg' AND phone LIKE '+472297%'")).toBe(
			0,
		);
		const approved = await runNorway(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(await count("directory.sites WHERE source = 'no-brreg' AND phone LIKE '+472297%'")).toBe(
			140,
		);
	});
});
