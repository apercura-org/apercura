/**
 * End-to-end Swiss import over the SYNTHETIC fixtures (`fixtures/generate-ch.ts`), next to the
 * French ones, against a real PostgreSQL + PostGIS database with the migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when ETL_TEST_DATABASE_URL is
 * set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFixtures } from "../fixtures/generate";
import { generateChFixtures } from "../fixtures/generate-ch";
import { buildChOptions, buildFrOptions } from "../src/config";
import { runCh } from "../src/run-ch";
import { runFr } from "../src/run-fr";
import { derivedKeyCh } from "../src/sources/ch/names";

const url = process.env.ETL_TEST_DATABASE_URL;
const FR_FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const FR_PLACE_FILES = [
	"regions.json",
	"departements.json",
	"communes.json",
	"arrondissements.json",
];

const tempDir = (name: string) => mkdtempSync(join(tmpdir(), `apercura-etl-${name}-test-`));

function chDir(): string {
	const dir = tempDir("ch");
	generateChFixtures(dir);
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
const runSwitzerland = (dir: string, flags: Record<string, string | true> = {}) =>
	runCh(buildChOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});

/** The key of a FOPH site of the fixtures (`bag.ts`: canton, hospital, site, postcode). */
const bagKey = (canton: string, hospital: string, site: string, postcode: string) =>
	derivedKeyCh([canton, hospital, site, postcode]);

describe.skipIf(!url)("etl:ch on synthetic fixtures, next to France", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = chDir();
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
				precision: string | null;
				phone: string | null;
				address_line: string | null;
				postcode: string | null;
				commune_label: string | null;
			}[]
		>`
			SELECT p.id, p.slug, p.last_name, p.first_name, p.profession_code, p.listing_slug, p.status,
				p.indexable, p.missing_runs, pl.name AS place, s.geo_precision AS precision, s.phone,
				s.address_line, s.postcode, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'CH' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
		`;
		return row;
	};
	const qualifications = async (scheme: string, id: string) =>
		sql<{ source: string; code: string; label: string }[]>`
			SELECT q.source, q.code, q.label FROM directory.practitioner_qualifications q
			JOIN directory.practitioners p ON p.id = q.practitioner_id
			WHERE p.country = 'CH' AND p.id_scheme = ${scheme} AND p.national_id = ${id}
			ORDER BY q.source, q.code, q.label
		`;
	const listing = async (slug: string, kind: string, code: string) => {
		const [row] = await sql<{ n: number; indexable: boolean }[]>`
			SELECT lp.practitioner_count AS n, lp.indexable FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id
			WHERE lp.listing_slug = ${slug} AND p.country = 'CH' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	const NORTH = bagKey("ZH", "Stadtspital Musterberg AG", "Stadtspital Musterberg Nord", "8050");
	const BASEL = bagKey(
		"BS",
		"Universitätsspital Muster Basel",
		"Universitätsspital Muster Basel",
		"4056",
	);
	const CLINICA = bagKey("TI", "Clinica Esempio", "Clinica Esempio", "6900");

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

	it("imports the places and the twelve lists without touching France", async () => {
		const france = await snapshot("FR");
		const outcome = await runSwitzerland(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.facilities).toBe(209);
		expect(totals.unlocated).toBe(0);
		expect(totals.byProfession).toEqual({
			CH_HOSPITAL: 64,
			CH_PSYCHIATRIC_CLINIC: 12,
			CH_REHAB_CLINIC: 1,
			CH_SPECIALTY_CLINIC: 3,
			CH_BIRTH_CENTRE: 4,
			CH_NURSING_HOME: 97,
			CH_PHARMACY: 28,
		});
		expect(await snapshot("FR")).toEqual(france);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'CH' AND kind = '${kind}'`);
		expect(await places("region")).toBe(26);
		expect(await places("department")).toBe(14);
		expect(await places("commune")).toBe(15);
		// France's run keeps Switzerland as it is.
		const swiss = await snapshot("CH");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("CH")).toEqual(swiss);
	});

	it("keeps a site's own name, its hospital's facts and nothing of a person", async () => {
		expect(await facility("CH-BAG", NORTH)).toMatchObject({
			last_name: "Stadtspital Musterberg Nord",
			first_name: "",
			slug: `stadtspital-musterberg-nord-h${NORTH}`,
			profession_code: "CH_HOSPITAL",
			listing_slug: "spital",
			indexable: true,
			place: "Zürich",
			precision: "city",
			postcode: "8050",
			commune_label: "Zürich",
		});
		expect(await qualifications("CH-BAG", NORTH)).toEqual([
			{ source: "akt", code: "A", label: "Akutsomatik" },
			{ source: "akt", code: "R", label: "Rehabilitation" },
			{ source: "angebot", code: "AMB", label: "ambulant" },
			{ source: "angebot", code: "STAT", label: "stationär" },
			{ source: "betrieb", code: "", label: "Stadtspital Musterberg AG" },
			{ source: "leistung", code: "IPS", label: "Intensivstation" },
			{ source: "leistung", code: "NF", label: "Notfallstation" },
			{ source: "rechtsform", code: "R4", label: "Öffentliches Unternehmen" },
			{ source: "typ", code: "K112", label: "Allgemeinspital, Zentrumsversorgung" },
		]);
		expect(await facility("CH-BAG", CLINICA)).toMatchObject({
			last_name: "Clinica Esempio",
			slug: `clinica-esempio-h${CLINICA}`,
			profession_code: "CH_SPECIALTY_CLINIC",
		});
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			LEFT JOIN directory.practitioner_qualifications q ON q.practitioner_id = p.id
			WHERE p.country = 'CH' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, q.label, s.email)
					~* '(fittizio|fiduciaria|fiktiva|erika|example\\.ch|fixture_user)'
				OR s.email IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.etl_runs WHERE source = 'ch' AND stats::text ~* 'fittizio|fiktiva|erika'",
			),
		).toBe(0);
	});

	it("merges a canton's hospital into the FOPH's site, crediting it", async () => {
		expect(await facility("CH-BAG", BASEL)).toMatchObject({
			last_name: "Universitätsspital Muster Basel",
			precision: "address",
			phone: "+41619990111",
			place: "Basel",
		});
		expect(await qualifications("CH-BAG", BASEL)).toContainEqual({
			source: "quelle",
			code: "ch-bs-spitaeler",
			label: "",
		});
		expect(
			await count(
				"directory.practitioners WHERE country = 'CH' AND last_name = 'Universitätsspital Muster'",
			),
		).toBe(0);
		// Geneva's units the figures give at another address have pages of their own.
		expect(
			await count(
				"directory.practitioners WHERE country = 'CH' AND id_scheme = 'CH-GE-HOP' AND status = 'active'",
			),
		).toBe(3);
		expect(await count("directory.sites WHERE source LIKE 'ch-%' AND place_id IS NULL")).toBe(0);
	});

	it("lists Switzerland by canton, district and commune; a stand-in district is never indexed", async () => {
		expect((await listing("pflegeheim", "commune", "261"))?.indexable).toBe(true);
		expect((await listing("pflegeheim", "region", "ZH"))?.n).toBe(32);
		expect((await listing("pflegeheim", "department", "112"))?.indexable).toBe(true);
		// Geneva has no districts: "Canton de Genève" repeats the canton's listing, noindex.
		const geneva = await listing("apotheke", "region", "GE");
		const standIn = await listing("apotheke", "department", "2500");
		expect(geneva).toMatchObject({ indexable: true });
		expect(standIn).toMatchObject({ n: geneva?.n, indexable: false });
		expect((await listing("apotheke", "commune", "6621"))?.indexable).toBe(true);
		expect(await count("directory.landing_pages WHERE key = 'spital:ch'")).toBe(1);
		expect(await count("directory.search_docs WHERE country = 'CH'")).toBe(
			await count("directory.practitioners WHERE country = 'CH' AND status = 'active'"),
		);
	});

	it("skips unchanged lists, and a forced rerun changes nothing", async () => {
		expect((await runSwitzerland(base)).status).toBe("skipped");
		const before = await snapshot("CH");
		const forced = await runSwitzerland(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("CH")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("CH");
		expect((await runSwitzerland(base, { "dry-run": true })).status).toBe("dry_run");
		expect(await snapshot("CH")).toEqual(before);
	});

	it("leaves out the FOPH's figures when they cannot be read, keeping every hospital", async () => {
		const dir = chDir();
		copyFileSync(join(dir, "ge-ems.zip"), join(dir, "bag-kzp.xlsx"));
		const outcome = await runSwitzerland(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["bag"]);
		// The cantons' hospitals are not read either, and nobody's hospital is counted missing.
		expect(
			await count(
				"directory.practitioners WHERE country = 'CH' AND profession_code IN ('CH_HOSPITAL', 'CH_PSYCHIATRIC_CLINIC', 'CH_REHAB_CLINIC', 'CH_SPECIALTY_CLINIC', 'CH_BIRTH_CENTRE') AND missing_runs > 0",
			),
		).toBe(0);
		expect(await facility("CH-BAG", NORTH)).toMatchObject({ status: "active", missing_runs: 0 });
		// A partial run never makes the next one skip.
		expect((await runSwitzerland(base)).status).toBe("succeeded");
		rmSync(dir, { recursive: true, force: true });
	});

	it("always honours an objection: the facility is dropped and nothing else is kept", async () => {
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('CH', 'CH-BL-PHARM', '7699999000002', 'objection (test)')
		`;
		const outcome = await runSwitzerland(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			"bl-apotheken": { idScheme: "CH-BL-PHARM", ids: 1, lines: 1 },
		});
		expect(await facility("CH-BL-PHARM", "7699999000002")).toBeUndefined();
		expect(
			await count(
				"directory.sites WHERE source = 'ch-bl-apotheken' AND source_key = '7699999000002'",
			),
		).toBe(0);
	});
});
