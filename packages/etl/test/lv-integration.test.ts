/**
 * End-to-end Latvian import over the SYNTHETIC fixtures (`fixtures/generate-lv.ts`), next to the
 * French ones, against a real PostgreSQL + PostGIS database with the migrations applied.
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
	LV_PLACES_OF_CARE,
	type LvFixtureSet,
	withFillerPhones,
	writeLvFixtures,
} from "../fixtures/generate-lv";
import { buildFrOptions, buildLvOptions } from "../src/config";
import { runFr } from "../src/run-fr";
import { runLv } from "../src/run-lv";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function lvDir(set: LvFixtureSet = LV_PLACES_OF_CARE): string {
	const dir = tempDir("lv");
	writeLvFixtures(dir, set);
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
const runLatvia = (dir: string, flags: Record<string, string | true> = {}) =>
	runLv(buildLvOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

/** The fixture set without the pharmacy numbered `id`. */
const withoutPharmacy = (id: number): LvFixtureSet => ({
	...LV_PLACES_OF_CARE,
	pharmacies: LV_PLACES_OF_CARE.pharmacies.filter((row) => row.id !== id),
});

describe.skipIf(!url)("etl:lv on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = lvDir();

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
		const rows = await sql<
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
				place: string | null;
				place_kind: string | null;
				place_code: string | null;
				precision: string | null;
				address_line: string | null;
				address_complement: string | null;
				postcode: string | null;
				phone: string | null;
			}[]
		>`
			SELECT p.id, p.slug, p.last_name, p.first_name, p.profession_code, p.listing_slug, p.status,
				p.indexable, p.missing_runs, pl.name AS place, pl.kind AS place_kind, pl.code AS place_code,
				s.geo_precision AS precision, s.address_line, s.address_complement, s.postcode, s.phone
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'LV' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
			ORDER BY s.source_key
		`;
		return rows;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'LV' AND p.kind = ${kind} AND p.code = ${code}
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

	it("imports places and places of care without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runLatvia(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.places).toBe(331);
		expect(totals.unlocated).toBe(0);
		expect(totals.byProfession).toEqual({
			LV_GP_PRACTICE: 85,
			LV_HOSPITAL: 21,
			LV_PHARMACY: 225,
		});
		expect(outcome.stats.sources).toMatchObject({
			gp: { lines: 310, rows: 85, quarantined: 1, counters: { gps: 108 } },
			hospitals: { lines: 22, rows: 21, skipped: { notOpenToPatients: 1 } },
			pharmacies: { lines: 226, rows: 225, counters: { sharedPhones: 4 } },
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'LV' AND kind = '${kind}'`);
		expect(await places("region")).toBe(5);
		expect(await places("department")).toBe(8);
		// Six towns, eight parishes and the three state cities' own communes.
		expect(await places("commune")).toBe(17);
		// France's run keeps Latvia as it is.
		const latvia = await snapshot("LV");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("LV")).toEqual(latvia);
	});

	it("names a practice's GPs and keeps only what a page needs", async () => {
		const [practice] = await place("LV-GP", "010000006");
		expect(practice).toMatchObject({
			slug: "ilzes-paraugas-gimenes-arsta-prakse-g010000006",
			last_name: "Ilzes Paraugas ģimenes ārsta prakse",
			first_name: "",
			profession_code: "LV_GP_PRACTICE",
			listing_slug: "gimenes-arstu-prakses",
			indexable: true,
			place: "Rīga",
			place_kind: "commune",
			place_code: "0001000",
			precision: "address",
			address_line: "Parauga iela 1",
			address_complement: "Rīga",
			phone: null,
		});
		const centre = await place("LV-GP", "900000014");
		expect(centre.map((row) => [row.place, row.address_complement])).toEqual([
			["Sigulda", "Sigulda, Siguldas nov."],
			["Mores pagasts", "More, Mores pag., Siguldas nov."],
		]);
		const gps = await sql<{ source: string; code: string; label: string }[]>`
			SELECT source, code, label FROM directory.practitioner_qualifications
			WHERE practitioner_id = ${centre[0]?.id ?? 0} ORDER BY code
		`;
		expect(gps).toEqual([
			{ source: "gimenes_arsts", code: "01", label: "Anna Piemēre" },
			{ source: "gimenes_arsts", code: "02", label: "Jānis Izdomāts" },
			{ source: "gimenes_arsts", code: "03", label: "Līga Fiktīva" },
		]);
		// A sole trader's legal name is no part of the page's name.
		expect((await place("LV-GP", "900000057"))[0]).toMatchObject({
			last_name: "Izdomātas Zanes ģimenes ārsta prakse",
			// The village's municipality of before the reform: placed by the point.
			place: "Carnikavas pagasts",
		});
		// No address: no page.
		expect(await place("LV-GP", "900000030")).toEqual([]);
		// The GPs' identifiers, the patient counts, the pharmacies' managers and e-mails: never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'LV' AND (
				concat_ws('|', p.last_name, p.national_id, s.address_line, s.address_complement, s.name)
					~ '(999[0-9]{8}|Pārvaldniece|example\\.test|40000000000)'
				OR s.email IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.practitioner_qualifications q JOIN directory.practitioners p ON p.id = q.practitioner_id WHERE p.country = 'LV' AND q.label ~ '(999[0-9]{8}|2108|Pārvaldniece)'",
			),
		).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'lv' AND stats::text ~ 'Parauga|Piemēr|Ilze'"),
		).toBe(0);
	});

	it("lists hospitals and pharmacies, at their address, a chain's number left out", async () => {
		expect((await place("LV-SLIM", "9005"))[0]).toMatchObject({
			last_name: "Paraugu reģionālā slimnīca filiāle Mazsalacā",
			listing_slug: "slimnicas",
			place: "Mazsalaca",
		});
		expect((await place("LV-SLIM", "9006"))[0]?.place).toBe("Rīga");
		expect(await place("LV-SLIM", "9007")).toEqual([]);
		expect((await place("LV-APT", "900001"))[0]).toMatchObject({
			slug: "paraugu-aptieka-1-a900001",
			last_name: "Paraugu aptieka 1",
			listing_slug: "aptiekas",
			place: "Rīga",
			postcode: "LV-1050",
			phone: "+37160000001",
			precision: "address",
		});
		expect((await place("LV-APT", "900002"))[0]).toMatchObject({
			place: "Ances pagasts",
			address_line: '"Paraugi"-2',
			address_complement: "Ance, Ances pag., Ventspils nov.",
		});
		expect((await place("LV-APT", "900004"))[0]?.last_name).toBe("Izdomātā aptieka");
		expect((await place("LV-APT", "900005"))[0]?.precision).toBe("city");
		for (const id of ["900006", "900007", "900008"]) expect(await place("LV-APT", id)).toEqual([]);
		expect(await count("directory.sites WHERE source = 'lv-zva' AND phone = '+37160099999'")).toBe(
			0,
		);
	});

	it("builds Latvia's read models: country, municipality and town listings, no region listing", async () => {
		expect(await count("directory.landing_pages WHERE key = 'aptiekas:lv'")).toBe(1);
		expect((await listing("gimenes-arstu-prakses", "department", "0001000"))?.n).toBeGreaterThan(0);
		expect((await listing("slimnicas", "commune", "0054200"))?.n).toBeGreaterThan(0);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'LV'",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'LV'")).toBe(331);
		expect(await count("directory.practitioner_pages WHERE country = 'LV'")).toBe(331);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runLatvia(base)).status).toBe("skipped");
		const before = await snapshot("LV");
		const forced = await runLatvia(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("LV")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("LV");
		expect((await runLatvia(lvDir(withoutPharmacy(900001)), { "dry-run": true })).status).toBe(
			"dry_run",
		);
		expect(await snapshot("LV")).toEqual(before);
	});

	it("leaves out the GP practices and hospitals when the addresses cannot be read", async () => {
		const dir = lvDir(withoutPharmacy(900001));
		writeFileSync(join(dir, "medicinasiestades.csv"), "not a list\n".repeat(400));
		const outcome = await runLatvia(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors).sort()).toEqual(["gp", "hospitals"]);
		expect(
			await count(
				"directory.practitioners WHERE country = 'LV' AND id_scheme IN ('LV-GP', 'LV-SLIM') AND missing_runs > 0",
			),
		).toBe(0);
		expect((await place("LV-APT", "900001"))[0]).toMatchObject({
			status: "active",
			missing_runs: 1,
		});
		// A run that left a list out never makes the next one skip it.
		const back = await runLatvia(base);
		expect(back.status).toBe("succeeded");
		expect((await place("LV-APT", "900001"))[0]?.missing_runs).toBe(0);
	});

	it("removes a pharmacy after two consecutive runs without it", async () => {
		const dir = lvDir(withoutPharmacy(900001));
		expect((await runLatvia(dir, { force: true })).status).toBe("succeeded");
		expect((await place("LV-APT", "900001"))[0]?.missing_runs).toBe(1);
		expect((await runLatvia(dir, { force: true })).status).toBe("succeeded");
		expect((await place("LV-APT", "900001"))[0]?.status).toBe("removed");
		expect((await runLatvia(base, { force: true })).status).toBe("succeeded");
		expect((await place("LV-APT", "900001"))[0]?.status).toBe("active");
	});

	it("always honours an objection: the practice is dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('LV', 'LV-GP', '900000049', 'objection (test)')
		`;
		const outcome = await runLatvia(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			gp: { idScheme: "LV-GP", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await place("LV-GP", "900000049")).toEqual([]);
		expect(await count("directory.sites WHERE source = 'lv-nvd-gp' AND source_key = '9009'")).toBe(
			0,
		);
	});

	it("blocks a run that would modify more than 10% of Latvia's pages until approved", async () => {
		const dir = lvDir(withFillerPhones(LV_PLACES_OF_CARE, "6007"));
		const blocked = await runLatvia(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE source = 'lv-zva' AND phone LIKE '+3716007%'")).toBe(
			0,
		);
		const approved = await runLatvia(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count("directory.sites WHERE source = 'lv-zva' AND phone LIKE '+3716007%'"),
		).toBeGreaterThan(200);
	});
});
