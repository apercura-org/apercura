/**
 * End-to-end Czech import over the SYNTHETIC fixtures (`fixtures/generate-cz.ts`), next to the
 * French, Austrian and UK ones, against a real PostgreSQL + PostGIS database with the
 * migrations applied.
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
import { writeAtFixtures } from "../fixtures/generate-at";
import { CZ_FACILITIES, type CzFixtureSet, writeCzFixtures } from "../fixtures/generate-cz";
import { writeGbFixtures } from "../fixtures/generate-gb";
import { buildAtOptions, buildCzOptions, buildFrOptions, buildGbOptions } from "../src/config";
import { runAt } from "../src/run-at";
import { runCz } from "../src/run-cz";
import { runFr } from "../src/run-fr";
import { runGb } from "../src/run-gb";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function czDir(set: CzFixtureSet = CZ_FACILITIES): string {
	const dir = tempDir("cz");
	writeCzFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

function atDir(): string {
	const dir = tempDir("at");
	writeAtFixtures(dir);
	return dir;
}

function gbDir(): string {
	const dir = tempDir("gb");
	writeGbFixtures(dir);
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runCzechia = (dir: string, flags: Record<string, string | true> = {}) =>
	runCz(buildCzOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});
const runAustria = (dir: string, flags: Record<string, string | true> = {}) =>
	runAt(buildAtOptions(offline(dir, flags), env()), () => {});
const runUk = (dir: string, flags: Record<string, string | true> = {}) =>
	runGb(buildGbOptions(offline(dir, flags), env()), () => {});

describe.skipIf(!url)("etl:cz on synthetic fixtures, next to France, Austria and the UK", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = czDir();

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
	const facility = async (id: string) => {
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
			FROM directory.practitioners WHERE country = 'CZ' AND id_scheme = 'CZ-NRPZS' AND national_id = ${id}
		`;
		return row;
	};
	const siteOf = async (key: string) => {
		const [row] = await sql<
			{
				place: string | null;
				kind: string | null;
				department: string | null;
				precision: string | null;
				geo_source: string | null;
				lat: number | null;
				address_line: string | null;
				postcode: string | null;
				phone: string | null;
			}[]
		>`
			SELECT p.name AS place, p.kind, p.department_code AS department, s.geo_precision AS precision,
				s.geo_source, ST_Y(s.location::geometry) AS lat, s.address_line, s.postcode, s.phone
			FROM directory.sites s LEFT JOIN directory.places p ON p.id = s.place_id
			WHERE s.source = 'cz-nrpzs' AND s.source_key = ${key}
		`;
		return row;
	};
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'CZ' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
		expect((await runAustria(atDir())).status).toBe("succeeded");
		expect((await runUk(gbDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the register without touching France, Austria or the UK", async () => {
		const others = {
			FR: await snapshot("FR"),
			AT: await snapshot("AT"),
			GB: await snapshot("GB"),
		};
		const outcome = await runCzechia(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.facilities).toBe(CZ_FACILITIES.cases.length);
		expect(totals.byProfession).toMatchObject({
			CZ_GP: 64,
			CZ_PAEDIATRIC: 24,
			CZ_DENTIST: 62,
			CZ_SPECIALIST: 106,
			CZ_PHARMACY: 61,
			CZ_PHYSIOTHERAPY: 25,
		});
		expect(await snapshot("FR")).toEqual(others.FR);
		expect(await snapshot("AT")).toEqual(others.AT);
		expect(await snapshot("GB")).toEqual(others.GB);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'CZ' AND kind = '${kind}'`);
		expect(await places("region")).toBe(14);
		expect(await places("department")).toBe(6);
		expect(await places("commune")).toBe(12);
		expect(await places("arrondissement")).toBe(22);
		// The other markets' runs keep Czechia as it is.
		const czech = await snapshot("CZ");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect((await runAustria(atDir(), { force: true })).status).toBe("succeeded");
		expect((await runUk(gbDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("CZ")).toEqual(czech);
	});

	it("keeps a facility's name and fields, and nothing of its provider", async () => {
		expect(await facility("900001")).toMatchObject({
			last_name: "MUDr. Jana Ukázková",
			first_name: "",
			slug: "mudr-jana-ukazkova-900001",
			profession_code: "CZ_GP",
			listing_slug: "prakticky-lekar",
			indexable: true,
		});
		expect(await facility("900003")).toMatchObject({
			profession_code: "CZ_SPECIALIST",
			primary_specialty_code: "kardiologie",
			listing_slug: "kardiolog",
		});
		const fields = await sql<{ code: string; label: string; source: string }[]>`
			SELECT q.code, q.label, q.source FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'CZ' AND p.national_id = '900003' ORDER BY q.code
		`;
		expect(fields).toEqual([
			{ code: "kardiologie", label: "kardiologie", source: "obor" },
			{ code: "vnitrni-lekarstvi", label: "vnitřní lékařství", source: "obor" },
		]);
		// The provider's company number, seat, representative, e-mail, fax, web and data box.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'CZ' AND (
				p.national_id LIKE '99%' OR concat_ws('|', p.last_name, p.last_name_source, s.address_line,
					s.name, s.legal_name, s.trade_name, s.siret, s.siren) ~ '(Zástupce|Domovská|example\\.invalid|ds9)'
				OR s.email IS NOT NULL OR s.fax IS NOT NULL OR s.siret IS NOT NULL OR s.address_line LIKE '%99900%'
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count("directory.etl_runs WHERE source = 'cz' AND stats::text ~ 'Zástupce|Ukázková'"),
		).toBe(0);
		// A chain's head-office number is no pharmacy's own.
		expect(
			await count("directory.sites WHERE source = 'cz-nrpzs' AND phone = '+420222999000'"),
		).toBe(0);
		expect((await siteOf("9900001"))?.phone).toBe("+420222333444");
	});

	it("places facilities in Prague's districts, municipalities or by distance", async () => {
		expect(await siteOf("9900001")).toMatchObject({
			place: "Praha 2",
			kind: "arrondissement",
			department: "CZ0100",
			precision: "address",
			geo_source: "source",
			address_line: "Ukázková 1234/12",
			postcode: "120 00",
		});
		expect(await siteOf("9900002")).toMatchObject({ place: "Brno", kind: "commune" });
		expect(await siteOf("9900004")).toMatchObject({
			place: "Chocerady",
			address_line: "Chocerady 15",
		});
		// Prague without its district: the nearest one.
		expect(await siteOf("9913001")).toMatchObject({ place: "Praha 2", kind: "arrondissement" });
		// A name RÚIAN does not know, an ambiguous one: the nearest municipality of the district.
		expect(await siteOf("9913002")).toMatchObject({ kind: "commune", department: "CZ0201" });
		expect(await siteOf("9913003")).toMatchObject({ place: "Pohled", department: "CZ0631" });
		// No point in the register: the municipality's centre, at city precision.
		expect(await siteOf("9913004")).toMatchObject({
			place: "Benešov",
			precision: "city",
			geo_source: "centroid",
		});
		expect(await count("directory.sites WHERE source = 'cz-nrpzs' AND place_id IS NULL")).toBe(0);
		// Nobody is placed in the city of Prague itself: its districts list it.
		expect(
			await count(
				"directory.sites s JOIN directory.places p ON p.id = s.place_id WHERE s.source = 'cz-nrpzs' AND p.code = '554782'",
			),
		).toBe(0);
	});

	it("builds Czechia's read models, Prague's city page being its district's", async () => {
		expect(await listing("prakticky-lekar", "arrondissement", "27")).toMatchObject({
			indexable: true,
		});
		expect((await listing("lekarna", "commune", "582786"))?.indexable).toBe(true);
		expect((await listing("kardiolog", "commune", "554821"))?.indexable).toBe(true);
		expect((await listing("zubni-lekar", "commune", "529796"))?.indexable).toBe(true);
		expect((await listing("prakticky-lekar", "department", "CZ0100"))?.n).toBeGreaterThan(5);
		expect(await listing("prakticky-lekar", "commune", "554782")).toBeUndefined();
		expect(await count("directory.landing_pages WHERE key = 'prakticky-lekar:cz'")).toBe(1);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'CZ'",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'CZ'")).toBe(
			await count("directory.practitioners WHERE country = 'CZ' AND status = 'active'"),
		);
		expect(await count("directory.practitioner_pages WHERE country = 'CZ'")).toBeGreaterThan(400);
	});

	it("skips an unchanged export, and a forced rerun changes nothing", async () => {
		expect((await runCzechia(base)).status).toBe("skipped");
		const before = await snapshot("CZ");
		const forced = await runCzechia(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("CZ")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("CZ");
		const set = { ...CZ_FACILITIES, cases: CZ_FACILITIES.cases.filter((c) => c.id !== 901_001) };
		expect((await runCzechia(czDir(set), { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("CZ")).toEqual(before);
	});

	it("fails on an export it cannot read and keeps the facilities as they are", async () => {
		const dir = czDir();
		writeFileSync(join(dir, "nrpzs.csv"), `${"not,the,expected,columns\n".repeat(3000)}`);
		const outcome = await runCzechia(dir, { force: true });
		expect(outcome.status).toBe("failed");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["nrpzs"]);
		expect(await count("directory.practitioners WHERE country = 'CZ' AND missing_runs > 0")).toBe(
			0,
		);
	});

	it("removes a facility after two consecutive runs without it", async () => {
		const set = { ...CZ_FACILITIES, cases: CZ_FACILITIES.cases.filter((c) => c.id !== 901_001) };
		const dir = czDir(set);
		expect((await runCzechia(dir, { force: true })).status).toBe("succeeded");
		expect(await facility("901001")).toMatchObject({ status: "active", missing_runs: 1 });
		expect((await runCzechia(dir, { force: true })).status).toBe("succeeded");
		expect((await facility("901001"))?.status).toBe("removed");
		expect(
			await count(
				"directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.national_id = '901001' AND p.country = 'CZ'",
			),
		).toBe(0);
	});

	it("always honours an objection: the lines are dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('CZ', 'CZ-NRPZS', '900005', 'objection (test)')
		`;
		const outcome = await runCzechia(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			nrpzs: { idScheme: "CZ-NRPZS", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await facility("900005")).toBeUndefined();
		expect(
			await count("directory.sites WHERE source = 'cz-nrpzs' AND source_key = '9900005'"),
		).toBe(0);
		expect((await runCzechia(base, { force: true })).status).toBe("succeeded");
		expect(
			await count("directory.practitioners WHERE country = 'CZ' AND national_id = '900005'"),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Czechia's pages until approved", async () => {
		const dir = czDir({ ...CZ_FACILITIES, fillerStreetSuffix: " Západní" });
		const blocked = await runCzechia(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE address_line LIKE 'Výplňová % Západní %'")).toBe(0);
		const approved = await runCzechia(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(
			await count(
				"directory.sites WHERE source = 'cz-nrpzs' AND address_line LIKE 'Výplňová % Západní %'",
			),
		).toBeGreaterThan(300);
	});
});
