/**
 * End-to-end import over the synthetic fixtures, against a real PostgreSQL +
 * PostGIS database with the migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when
 * ETL_TEST_DATABASE_URL is set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CASES,
	fakeRpps,
	fillerPeople,
	PEOPLE,
	type Person,
	writeFixtures,
} from "../fixtures/generate";
import { buildFrOptions } from "../src/config";
import { runFr } from "../src/run-fr";

const url = process.env.ETL_TEST_DATABASE_URL;
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "fr");
const PLACE_FILES = ["regions.json", "departements.json", "communes.json", "arrondissements.json"];

function fixtureDir(people: Person[] = PEOPLE): string {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-test-"));
	writeFixtures(dir, people);
	for (const name of PLACE_FILES) copyFileSync(join(FIXTURES, name), join(dir, name));
	return dir;
}

const run = (dir: string, flags: Record<string, string | true> = {}) =>
	runFr(
		buildFrOptions(
			new Map<string, string | true>([
				["source-dir", dir],
				["offline", true],
				...Object.entries(flags),
			]),
			{
				DATABASE_URL_ETL: url,
			},
		),
		() => {},
	);

const changes = (outcome: Awaited<ReturnType<typeof run>>) =>
	(outcome.stats.changes as { total: number } | undefined)?.total;

describe.skipIf(!url)("etl:fr on synthetic fixtures", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
	const base = fixtureDir();

	const count = async (query: string) => {
		const [row] = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::integer AS n FROM ${query}`);
		return row?.n ?? 0;
	};

	beforeAll(async () => {
		await sql.unsafe(`
			TRUNCATE directory.etl_runs, directory.invalidation_outbox, directory.geocode_cache,
				directory.suppressions, directory.places RESTART IDENTITY CASCADE
		`);
	});

	afterAll(async () => {
		await sql.end();
	});

	it("imports the fixtures", async () => {
		const outcome = await run(base);
		expect(outcome.status).toBe("succeeded");
		expect(await count("directory.practitioners WHERE status = 'active'")).toBe(215);
		expect(await count("directory.practitioners WHERE indexable")).toBe(212);
		expect(await count("directory.practitioner_pages")).toBe(215);
		// The locum, the registration without activity and the occupational doctor.
		expect(
			await count(
				"directory.practitioners WHERE NOT indexable AND national_id IN ('19999990096', '19999990104', '19999990112')",
			),
		).toBe(3);
		expect(await count("directory.landing_pages WHERE indexable")).toBeGreaterThan(0);
		expect(await count("directory.practitioners WHERE ameli_matched_at IS NOT NULL")).toBe(4);
		expect(await count("directory.sites WHERE geo_source = 'finess'")).toBe(2);
		expect(await count("directory.sites WHERE slug IS NOT NULL")).toBe(2);
		expect(await count("directory.invalidation_outbox")).toBeGreaterThan(0);
		// Paris (75056 + postcode) and a postcode without commune both land in an arrondissement.
		const places = await sql<{ code: string }[]>`
			SELECT pl.code FROM directory.sites s JOIN directory.places pl ON pl.id = s.place_id
			WHERE s.source_key IN ('R10999999000003', 'R10999999000004') ORDER BY s.source_key
		`;
		expect(places.map((row) => row.code)).toEqual(["75106", "75112"]);
		// The registry's "ChloE" regains the accent of the practitioner's first name.
		const [site] = await sql<{ name: string }[]>`
			SELECT name FROM directory.sites WHERE source_key = 'R10999999000004'
		`;
		expect(site?.name).toBe("Cabinet du Dr Chloé d'Essai");
	});

	it("skips unchanged sources, and a forced rerun changes nothing", async () => {
		expect((await run(base)).status).toBe("skipped");
		const forced = await run(base, { force: true });
		expect(forced.status).toBe("succeeded");
		expect(changes(forced)).toBe(0);
	});

	it("dry-runs without writing", async () => {
		const before = await count("directory.practitioners");
		const dir = fixtureDir([
			...PEOPLE,
			{
				n: 99,
				title: "DR",
				civility: "M",
				last: "NOUVEAU",
				first: "OSCAR",
				profession: "10",
				activities: [{}],
			},
		]);
		const outcome = await run(dir, { "dry-run": true });
		expect(outcome.status).toBe("dry_run");
		expect((outcome.stats.practitioners as { inserted: number }).inserted).toBe(1);
		expect(await count("directory.practitioners")).toBe(before);
	});

	it("aborts on a truncated source file and commits nothing", async () => {
		const dir = fixtureDir();
		const path = join(dir, "personne-activite.txt");
		const content = readFileSync(path, "utf8");
		writeFileSync(path, content.slice(0, Math.floor(content.length * 0.6)));
		const pages = await count("directory.practitioner_pages");
		const outcome = await run(dir);
		expect(outcome.status).toBe("failed");
		expect(
			outcome.guards.find((check) => check.name === "personneActivite.final_newline")?.ok,
		).toBe(false);
		expect(await count("directory.practitioner_pages")).toBe(pages);
		expect(await count("directory.practitioners WHERE status = 'active'")).toBe(215);
	});

	it("removes a practitioner after two consecutive runs without them", async () => {
		const gone = fakeRpps(2);
		const dir = fixtureDir(PEOPLE.filter((person) => person.n !== 2));
		const first = await run(dir);
		expect(first.status).toBe("succeeded");
		const [afterFirst] = await sql<{ status: string; missing_runs: number }[]>`
			SELECT status, missing_runs FROM directory.practitioners WHERE national_id = ${gone}
		`;
		expect(afterFirst).toEqual({ status: "active", missing_runs: 1 });

		const second = await run(dir, { force: true });
		expect(second.status).toBe("succeeded");
		const [removed] = await sql<{ status: string }[]>`
			SELECT status FROM directory.practitioners WHERE national_id = ${gone}
		`;
		expect(removed?.status).toBe("removed");
		expect(
			await count(
				`directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.national_id = '${gone}'`,
			),
		).toBe(0);
	});

	it("blocks a run that would modify more than 10% of the pages until approved", async () => {
		const people = [...CASES.filter((person) => person.n !== 2), ...fillerPeople(200, 3)];
		const dir = fixtureDir(people);
		const blocked = await run(dir);
		expect(blocked.status).toBe("blocked");
		expect(blocked.guards.find((check) => check.name === "breaker.modified")?.ok).toBe(false);
		// Rolled back: the old phone numbers are still there.
		expect(await count("directory.sites WHERE phone LIKE '+3319902%'")).toBe(200);

		expect(await run(dir, { approve: "999999" }).catch((error: Error) => error.message)).toMatch(
			/does not exist/,
		);
		const approved = await run(dir, { approve: String(blocked.runId) });
		expect(approved.status).toBe("succeeded");
		expect(await count("directory.sites WHERE phone LIKE '+3319903%'")).toBe(200);
	});

	it("always honours suppressions, without tripping the breakers", async () => {
		const target = fakeRpps(3);
		await sql`
			INSERT INTO directory.suppressions (national_id, reason) VALUES (${target}, 'objection (test)')
		`;
		const people = [...CASES.filter((person) => person.n !== 2), ...fillerPeople(200, 3)];
		const outcome = await run(fixtureDir(people), { force: true });
		expect(outcome.status).toBe("succeeded");
		const [row] = await sql<{ status: string; indexable: boolean }[]>`
			SELECT status, indexable FROM directory.practitioners WHERE national_id = ${target}
		`;
		expect(row).toEqual({ status: "suppressed", indexable: false });
		expect(
			await count(
				`directory.practitioner_pages pg JOIN directory.practitioners p ON p.id = pg.practitioner_id WHERE p.national_id = '${target}'`,
			),
		).toBe(0);
	});

	it("never overwrites practitioner-owned data", async () => {
		const [person] = await sql<{ id: number }[]>`
			SELECT id FROM directory.practitioners WHERE national_id = ${fakeRpps(1)}
		`;
		await sql`
			INSERT INTO directory.practitioner_profiles (practitioner_id, headline, languages, published_at)
			VALUES (${person?.id ?? 0}, 'Owner headline', '{fr,en}', now())
		`;
		await sql`UPDATE directory.practitioners SET claim_status = 'claimed' WHERE id = ${person?.id ?? 0}`;
		const people = [...CASES.filter((p) => p.n !== 2), ...fillerPeople(200, 3)];
		const outcome = await run(fixtureDir(people), { force: true });
		expect(outcome.status).toBe("succeeded");
		const [after] = await sql<
			{ headline: string; claim_status: string; payload_headline: string }[]
		>`
			SELECT pr.headline, p.claim_status, pg.payload -> 'profile' ->> 'headline' AS payload_headline
			FROM directory.practitioners p
			JOIN directory.practitioner_profiles pr ON pr.practitioner_id = p.id
			JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
			WHERE p.id = ${person?.id ?? 0}
		`;
		expect(after).toEqual({
			headline: "Owner headline",
			claim_status: "claimed",
			payload_headline: "Owner headline",
		});
	});

	it("keeps a page withheld by a removal request hidden, and never clears the request", async () => {
		const target = fakeRpps(4);
		await sql`
			UPDATE directory.practitioners SET withheld_at = now(), indexable = false
			WHERE national_id = ${target}
		`;
		const people = [...CASES.filter((p) => p.n !== 2), ...fillerPeople(200, 3)];
		const outcome = await run(fixtureDir(people), { force: true });
		expect(outcome.status).toBe("succeeded");
		const [row] = await sql<{ indexable: boolean; withheld: boolean; page_indexable: boolean }[]>`
			SELECT p.indexable, p.withheld_at IS NOT NULL AS withheld, pg.indexable AS page_indexable
			FROM directory.practitioners p
			JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
			WHERE p.national_id = ${target}
		`;
		expect(row).toEqual({ indexable: false, withheld: true, page_indexable: false });
		expect(
			await count(
				`directory.search_docs sd JOIN directory.practitioners p ON p.id = sd.practitioner_id WHERE p.national_id = '${target}' AND sd.indexable`,
			),
		).toBe(0);
	});
});
