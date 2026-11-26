/**
 * End-to-end German import over the SYNTHETIC fixtures (`fixtures/generate-de.ts`), next to the
 * French and Spanish ones, against a real PostgreSQL + PostGIS database with the migrations
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
import {
	DE_FACILITIES,
	type DeFixtureSet,
	withFillerPhones,
	writeDeFixtures,
} from "../fixtures/generate-de";
import { writeEsFixtures } from "../fixtures/generate-es";
import { buildDeOptions, buildEsOptions, buildFrOptions } from "../src/config";
import { runDe } from "../src/run-de";
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

function deDir(set: DeFixtureSet = DE_FACILITIES): string {
	const dir = tempDir("de");
	writeDeFixtures(dir, set);
	return dir;
}

function frDir(): string {
	const dir = tempDir("fr");
	writeFixtures(dir);
	for (const name of FR_PLACE_FILES) copyFileSync(join(FR_FIXTURES, name), join(dir, name));
	return dir;
}

function esDir(): string {
	const dir = tempDir("es");
	writeEsFixtures(dir);
	return dir;
}

const offline = (dir: string, flags: Record<string, string | true>) =>
	new Map<string, string | true>([
		["source-dir", dir],
		["offline", true],
		...Object.entries(flags),
	]);

const env = () => ({ DATABASE_URL_ETL: url });
const runGermany = (dir: string, flags: Record<string, string | true> = {}) =>
	runDe(buildDeOptions(offline(dir, flags), env()), () => {});
const runFrance = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(buildFrOptions(offline(dir, flags), env()), () => {});
const runSpain = (dir: string, flags: Record<string, string | true> = {}) =>
	runEs(buildEsOptions(offline(dir, flags), env()), () => {});

/** The fixture set without the named facilities matching `name`. */
const without = (name: string): DeFixtureSet => ({
	...DE_FACILITIES,
	hospitals: DE_FACILITIES.hospitals.filter((row) => row.name !== name),
	clinics: DE_FACILITIES.clinics.filter((row) => row.name !== name),
	thuringia: DE_FACILITIES.thuringia.filter((row) => row.name !== name),
	brandenburg: DE_FACILITIES.brandenburg.filter((row) => row.name !== name),
});

describe.skipIf(!url)("etl:de on synthetic fixtures, next to France and Spain", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = deDir();

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
	const facility = async (name: string) => {
		const [row] = await sql<
			{
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
				place_kind: string | null;
				place_code: string | null;
				precision: string | null;
				geo_source: string | null;
				lat: number | null;
				lon: number | null;
				address_line: string | null;
				postcode: string | null;
				phone: string | null;
				commune_label: string | null;
			}[]
		>`
			SELECT p.id, p.id_scheme, p.national_id, p.slug, p.last_name, p.first_name, p.profession_code,
				p.listing_slug, p.status, p.indexable, p.missing_runs, pl.name AS place,
				pl.kind AS place_kind, pl.code AS place_code, s.geo_precision AS precision, s.geo_source,
				ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon, s.address_line,
				s.postcode, s.phone, s.commune_label
			FROM directory.practitioners p
			LEFT JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE p.country = 'DE' AND p.last_name = ${name}
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
			WHERE lp.listing_slug = ${slug} AND p.country = 'DE' AND p.kind = ${kind} AND p.code = ${code}
		`;
		return row;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
		expect((await runFrance(frDir())).status).toBe("succeeded");
		expect((await runSpain(esDir())).status).toBe("succeeded");
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports places and facilities without touching France or Spain", async () => {
		const others = { FR: await snapshot("FR"), ES: await snapshot("ES") };
		const outcome = await runGermany(base);
		expect(outcome.status).toBe("succeeded");
		expect(outcome.sourceErrors).toEqual({});
		const totals = outcome.stats.totals as Record<string, unknown>;
		expect(totals.facilities).toBe(450);
		expect(totals.unlocated).toBe(0);
		expect(totals.byProfession).toEqual({
			DE_HOSPITAL: 176,
			DE_PSYCHIATRIC_HOSPITAL: 43,
			DE_CHILDRENS_HOSPITAL: 1,
			DE_REHAB_CLINIC: 105,
			DE_PHARMACY: 125,
		});
		expect(outcome.stats.sources).toMatchObject({
			khv: { lines: 222, rows: 220, quarantined: 2, edition: 2024 },
			rhv: { lines: 105, rows: 105, edition: 2024, counters: { sharedPhones: 4 } },
			"apo-th": { lines: 63, rows: 63 },
			"apo-bb": { lines: 63, rows: 62, skipped: { "hospital pharmacy": 1 } },
		});
		expect(await snapshot("FR")).toEqual(others.FR);
		expect(await snapshot("ES")).toEqual(others.ES);
		const places = async (kind: string) =>
			count(`directory.places WHERE country = 'DE' AND kind = '${kind}'`);
		expect(await places("region")).toBe(9);
		expect(await places("department")).toBe(12);
		// The uninhabited area outside any Gemeinde is left out.
		expect(await places("commune")).toBe(13);
		const [munich] = await sql<{ slug: string; name: string }[]>`
			SELECT slug, name FROM directory.places WHERE country = 'DE' AND kind = 'department' AND code = '09184'
		`;
		expect(munich).toEqual({ slug: "landkreis-muenchen", name: "Landkreis München" });
		// The other markets' runs keep Germany as it is.
		const germany = await snapshot("DE");
		expect((await runFrance(frDir(), { force: true })).status).toBe("succeeded");
		expect((await runSpain(esDir(), { force: true })).status).toBe("succeeded");
		expect(await snapshot("DE")).toEqual(germany);
	});

	it("names a hospital's sites, lists it by its departments and keeps only what a page needs", async () => {
		const north = await facility("Universitätsklinikum Beispielstadt – Campus Nord");
		expect(north).toMatchObject({
			id_scheme: "DE-KHV",
			first_name: "",
			profession_code: "DE_HOSPITAL",
			listing_slug: "krankenhaeuser",
			indexable: true,
			// Filed under a Berlin district: placed in the city.
			place: "Berlin",
			place_kind: "commune",
			place_code: "11000000",
			precision: "city",
			geo_source: "centroid",
			address_line: "Musterallee 1",
			postcode: "10117",
			phone: "+4930999900",
		});
		expect(north?.slug).toMatch(/^universitaetsklinikum-beispielstadt-campus-nord-k[0-9a-f]{10}$/);
		expect(north?.lat).toBeCloseTo(52.51767, 5);
		expect((await facility("Universitätsklinikum Beispielstadt – Campus Süd"))?.phone).toBe(
			"+4930999900",
		);
		const quals = await qualifications(north?.id ?? 0);
		expect(quals).toContainEqual({
			source: "fachabteilung",
			code: "2400",
			label: "Frauenheilkunde und Geburtshilfe",
		});
		expect(quals).toContainEqual({
			source: "notfallstufe",
			code: "3",
			label: "Umfassende Notfallversorgung",
		});
		expect(quals).toContainEqual({
			source: "notfallmodul",
			code: "SCHLAGANFALL",
			label: "Schlaganfallversorgung",
		});
		expect(quals).toContainEqual({
			source: "traeger",
			code: "PUBLIC",
			label: "Öffentlicher Träger",
		});
		expect(quals).toContainEqual({
			source: "einrichtungstyp",
			code: "1",
			label: "Hochschulklinik",
		});
		expect(quals.filter((q) => q.source === "notfallmodul")).toHaveLength(4);
		expect(await facility("Muster-Tagesklinik für Psychiatrie und Psychotherapie")).toMatchObject({
			profession_code: "DE_PSYCHIATRIC_HOSPITAL",
			listing_slug: "psychiatrische-kliniken",
		});
		expect(await facility("Kinderkrankenhaus Musterhafen")).toMatchObject({
			profession_code: "DE_CHILDRENS_HOSPITAL",
			place_code: "02000000",
		});
		expect((await facility("Probe-Krankenhaus Flensburg"))?.place_code).toBe("01001000");
		// Two hospitals at one address: two pages.
		expect((await facility("Fiktivklinik München"))?.place_code).toBe("09162000");
		expect((await facility("Fiktivklinik München Privatklinik"))?.place_code).toBe("09162000");
		// Filed under its hospital's Land: placed by its town.
		expect(await facility("Fiktiv-Klinikum Wiesbaden")).toMatchObject({
			place_code: "06414000",
			precision: "city",
		});
		// E-mail, web address, operator name: never stored.
		const leaks = await sql<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.practitioners p
			JOIN directory.activities a ON a.practitioner_id = p.id
			JOIN directory.sites s ON s.id = a.site_id
			WHERE p.country = 'DE' AND (
				concat_ws('|', p.last_name, p.last_name_source, s.address_line, s.name, s.legal_name,
					s.trade_name) ~ '(example\\.test|Trägergesellschaft|Rehaträger|gGmbH|GmbH)'
				OR s.email IS NOT NULL OR s.fax IS NOT NULL
			)
		`;
		expect(leaks[0]?.n).toBe(0);
		expect(
			await count(
				"directory.practitioner_qualifications q JOIN directory.practitioners p ON p.id = q.practitioner_id WHERE p.country = 'DE' AND q.label ~ '(example|Träger [0-9]|keine vollstationären)'",
			),
		).toBe(0);
		expect(
			await count(
				"directory.etl_runs WHERE source = 'de' AND stats::text ~ 'example|Fiktivklinik'",
			),
		).toBe(0);
		// A chain's number is no clinic's own.
		expect(
			await count("directory.sites WHERE source LIKE 'de-%' AND phone = '+498009999999'"),
		).toBe(0);
	});

	it("places pharmacies at their address, by key, by town and district names", async () => {
		const erfurt = await facility("Beispiel-Apotheke");
		expect(erfurt).toMatchObject({
			id_scheme: "DE-APO-TH",
			national_id: "9001",
			slug: "beispiel-apotheke-th9001",
			profession_code: "DE_PHARMACY",
			listing_slug: "apotheken",
			place_code: "16051000",
			precision: "address",
			geo_source: "source",
			phone: null,
		});
		expect(erfurt?.lat).toBeCloseTo(50.9781, 4);
		expect(erfurt?.lon).toBeCloseTo(11.0301, 4);
		const weimar = await facility("Muster-Apotheke am Markt");
		expect(await qualifications(weimar?.id ?? 0)).toEqual([
			{ source: "apotheke", code: "MAIN", label: "Hauptapotheke" },
			{
				source: "barrierefreiheit",
				code: "PARTIAL",
				label: "Barrierefrei mit Einschränkung (Rampe, Klingel)",
			},
		]);
		// A note that is no place is no part of the name.
		expect((await facility("Probe-Apotheke im Zentrum"))?.slug).toBe(
			"probe-apotheke-im-zentrum-th9003",
		);
		expect(await facility("Fiktiv-Apotheke am Park")).toMatchObject({
			id_scheme: "DE-APO-BB",
			place_code: "12054000",
			precision: "address",
			phone: "+493319999901",
		});
		expect((await facility("Beispiel-Apotheke Brieselang"))?.place_code).toBe("12063036");
		// A hospital's pharmacy serves its wards: left out.
		expect(await facility("Klinikum Fiktivstadt GmbH")).toBeUndefined();
	});

	it("builds Germany's read models: country, Kreis and Gemeinde listings, no Land listing", async () => {
		expect((await listing("krankenhaeuser", "department", "11000"))?.n).toBe(2);
		expect((await listing("krankenhaeuser", "commune", "09184148"))?.n).toBe(1);
		expect((await listing("apotheken", "department", "16053"))?.indexable).toBe(true);
		expect((await listing("reha-kliniken", "department", "09184"))?.n).toBeGreaterThan(40);
		expect(await count("directory.landing_pages WHERE key = 'krankenhaeuser:de'")).toBe(1);
		expect(
			await count(
				"directory.landing_pages lp JOIN directory.places p ON p.id = lp.place_id WHERE p.kind = 'region' AND p.country = 'DE'",
			),
		).toBe(0);
		expect(await count("directory.search_docs WHERE country = 'DE'")).toBe(450);
		expect(await count("directory.practitioner_pages WHERE country = 'DE'")).toBe(450);
	});

	it("skips unchanged files, and a forced rerun changes nothing", async () => {
		expect((await runGermany(base)).status).toBe("skipped");
		const before = await snapshot("DE");
		const forced = await runGermany(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(forced.stats.practitioners).toEqual({ inserted: 0, updated: 0 });
		expect(forced.stats.sites).toEqual({ inserted: 0, updated: 0 });
		expect(await snapshot("DE")).toEqual(before);
	});

	it("dry-runs without writing", async () => {
		const before = await snapshot("DE");
		expect(
			(await runGermany(deDir(without("Kreisklinik Probehausen")), { "dry-run": true })).status,
		).toBe("dry_run");
		expect(await snapshot("DE")).toEqual(before);
	});

	it("never goes back to an older edition of the directory", async () => {
		const outcome = await runGermany(deDir({ ...DE_FACILITIES, edition: 2023 }), { force: true });
		expect(outcome.sourceErrors).toMatchObject({
			khv: expect.stringMatching(/edition 2023 vs 2024/),
		});
		expect(outcome.status).toBe("succeeded");
		expect((await facility("Klinikum Beispiel Erfurt"))?.missing_runs).toBe(0);
		// Restore a clean last success.
		expect((await runGermany(base, { force: true })).status).toBe("succeeded");
	});

	it("leaves out a list it cannot read and keeps its pharmacies as they are", async () => {
		const dir = deDir(without("Klinikum Beispiel Erfurt"));
		writeFileSync(join(dir, "apotheken_bb.json"), "not a list");
		const outcome = await runGermany(dir, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(Object.keys(outcome.sourceErrors)).toEqual(["apo-bb"]);
		expect(
			await count(
				"directory.practitioners WHERE country = 'DE' AND id_scheme = 'DE-APO-BB' AND missing_runs > 0",
			),
		).toBe(0);
		expect((await facility("Fiktiv-Apotheke am Park"))?.status).toBe("active");
		// A hospital site missing from a new edition of the yearly directory: removed at once.
		expect((await facility("Klinikum Beispiel Erfurt"))?.status).toBe("removed");
		// A run that left a list out never makes the next one skip it.
		const back = await runGermany(base);
		expect(back.status).toBe("succeeded");
		expect((await facility("Klinikum Beispiel Erfurt"))?.status).toBe("active");
	});

	it("removes a pharmacy after two consecutive runs without it", async () => {
		const dir = deDir(without("Beispiel-Apotheke"));
		expect((await runGermany(dir, { force: true })).status).toBe("succeeded");
		expect(await facility("Beispiel-Apotheke")).toMatchObject({
			status: "active",
			missing_runs: 1,
		});
		expect((await runGermany(dir, { force: true })).status).toBe("succeeded");
		expect((await facility("Beispiel-Apotheke"))?.status).toBe("removed");
		expect(
			await count(
				"directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.country = 'DE' AND p.national_id = '9001'",
			),
		).toBe(0);
		expect((await runGermany(base, { force: true })).status).toBe("succeeded");
		expect((await facility("Beispiel-Apotheke"))?.status).toBe("active");
	});

	it("always honours an objection: the rows are dropped and nothing else is kept", async () => {
		const target = await facility("Rehaklinik Fiktivia");
		await sql`
			INSERT INTO directory.suppressions (country, id_scheme, national_id, reason)
			VALUES ('DE', 'DE-RHV', ${target?.national_id ?? ""}, 'objection (test)')
		`;
		const outcome = await runGermany(base, { force: true });
		expect(outcome.status).toBe("succeeded");
		expect(outcome.stats.suppressedLines).toMatchObject({
			rhv: { idScheme: "DE-RHV", ids: 1, lines: 1 },
		});
		expect(outcome.guards.filter((check) => !check.ok)).toEqual([]);
		expect(await facility("Rehaklinik Fiktivia")).toBeUndefined();
		expect(
			await count(
				`directory.sites WHERE source = 'de-destatis-rhv' AND source_key = '${target?.national_id}'`,
			),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of Germany's pages until approved", async () => {
		const dir = deDir(withFillerPhones(DE_FACILITIES, "0700"));
		const blocked = await runGermany(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		expect(await count("directory.sites WHERE source LIKE 'de-%' AND phone LIKE '+49700%'")).toBe(
			0,
		);
		const approved = await runGermany(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(await count("directory.sites WHERE source LIKE 'de-%' AND phone LIKE '+49700%'")).toBe(
			210 + 100,
		);
	});
});
