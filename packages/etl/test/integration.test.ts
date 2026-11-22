/**
 * End-to-end import over the synthetic fixtures, against a real PostgreSQL +
 * PostGIS database with the migrations applied.
 *
 * Opt-in and DESTRUCTIVE for the directory tables: it only runs when
 * ETL_TEST_DATABASE_URL is set (CI sets it to a throwaway service container).
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nameMatchKey } from "@apercura/core";
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
import { parseQuotedRecord } from "../src/lib/text";
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

/** An import that calls the geocoder at `geocoderUrl` (the local mock below). */
const runOnline = (dir: string, geocoderUrl: string, flags: Record<string, string | true> = {}) =>
	runFr(
		buildFrOptions(
			new Map<string, string | true>([["source-dir", dir], ...Object.entries(flags)]),
			{
				DATABASE_URL_ETL: url,
				ETL_GEOCODER_URL: geocoderUrl,
			},
		),
		() => {},
	);

type BanAnswer = { score: number; street: string; citycode?: string };

/**
 * SYNTHETIC answers of the mock geocoder, by the street the import sends: the
 * BAN writes street names with their accents.
 */
const BAN_ANSWERS: Record<string, BanAnswer> = {
	"AVENUE DU SPECIMEN": { score: 0.93, street: "Avenue du Spécimen" },
	"RUE DU GENERAL FICTIF": { score: 0.97, street: "Rue du Général Fictif" },
	"BOULEVARD DE LA MAQUETTE": { score: 0.91, street: "Boulevard de la Maquette" },
	// Another commune code, a low score, another street: the registry text stays.
	"COURS DU TEMOIN": { score: 0.95, street: "Cours du Témoin", citycode: "69381" },
	"QUAI DE L ECHANTILLON": { score: 0.7, street: "Quai de l'Échantillon" },
	"PLACE DE L ESSAI": { score: 0.9, street: "Place de l'Épreuve" },
};

const GEOCODER_COLUMNS = [
	"key",
	"adresse",
	"postcode",
	"citycode",
	"latitude",
	"longitude",
	"result_score",
	"result_type",
	"result_citycode",
	"result_label",
	"result_housenumber",
	"result_name",
	"result_street",
	"result_postcode",
	"result_city",
];

/** A stand-in for the Géoplateforme CSV endpoint, answering from `BAN_ANSWERS`. */
async function startMockGeocoder() {
	const batches: number[] = [];
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(chunk as Buffer);
		const form = await new Response(Buffer.concat(chunks), {
			headers: { "content-type": request.headers["content-type"] ?? "" },
		}).formData();
		const file = form.get("data") as File;
		const lines = (await file.text()).split("\n").filter(Boolean).slice(1);
		batches.push(lines.length);
		const csv = [GEOCODER_COLUMNS.join(",")];
		for (const line of lines) {
			const [key = "", address = "", postcode = "", citycode = ""] =
				parseQuotedRecord(line, ",") ?? [];
			const answer = Object.entries(BAN_ANSWERS).find(([street]) =>
				nameMatchKey(address).includes(street),
			)?.[1];
			const number = /^\d+/.exec(address)?.[0] ?? "";
			const name = answer ? [number, answer.street].filter(Boolean).join(" ") : "";
			const row = answer
				? [
						key,
						address,
						postcode,
						citycode,
						"48.85",
						"2.3",
						String(answer.score),
						number ? "housenumber" : "street",
						answer.citycode ?? citycode,
						`${name} ${postcode} Ville Fictive`,
						number,
						name,
						answer.street,
						postcode,
						"Ville Fictive",
					]
				: [key, address, postcode, citycode, "", "", "0.3", "municipality", citycode];
			csv.push(
				row
					.map((field) => (/[",]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
					.join(","),
			);
		}
		response.writeHead(200, { "content-type": "text/csv; charset=utf-8" });
		response.end(`${csv.join("\n")}\n`);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/geocodage/search/csv`,
		batches,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

/** A fictitious practitioner whose registry structure name lost the accents of her first name. */
const HELENE: Person = {
	n: 98,
	title: "DR",
	civility: "MME",
	last: "FICTIVE",
	first: "HÉLÈNE",
	profession: "10",
	activities: [
		{
			structure: {
				id: "R10999999000098",
				name: "CABINET DU DR HELENE FICTIVE",
				number: "7",
				typeCode: "R",
				typeLabel: "Rue",
				street: "DU GENERAL FICTIF",
				postcode: "75016",
				commune: "75116",
				communeLabel: "Paris 16e  Arrondissement",
				phone: "0199000198",
			},
			mode: "L",
			sector: "SA07",
			role: "FON-01",
			genre: "GENR01",
			specialty: "SM53",
		},
	],
};

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
	it("restores own-name accents and displays the geocoder's street names, idempotently", async () => {
		const geocoder = await startMockGeocoder();
		try {
			const people = [...CASES.filter((p) => p.n !== 2), ...fillerPeople(200, 3), HELENE];
			const dir = fixtureDir(people);
			const first = await runOnline(dir, geocoder.url);
			expect(first.status).toBe("succeeded");
			// Every cached address was geocoded again, once, for its label.
			expect(geocoder.batches.length).toBe(1);
			expect(await count("directory.geocode_cache WHERE NOT with_labels")).toBe(0);
			const labelled = await count("directory.sites WHERE geo_address_line IS NOT NULL");
			expect(labelled).toBeGreaterThanOrEqual(3);

			const sites = await sql<
				{
					source_key: string;
					name: string;
					address_line: string;
					geo_label: string | null;
					geo_address_line: string | null;
				}[]
			>`
				SELECT source_key, name, address_line, geo_label, geo_address_line
				FROM directory.sites
				WHERE source_key IN ('R10999999000002', 'R10999999000098', 'R10999999000005',
					'R10999999000006', 'R10999999000004')
				ORDER BY source_key
			`;
			const bySite = Object.fromEntries(sites.map((site) => [site.source_key, site]));
			// The registry wrote "HELENE"; the practitioner's own name has the accents.
			expect(bySite.R10999999000098?.name).toBe("Cabinet du Dr Hélène Fictive");
			expect(bySite.R10999999000098).toMatchObject({
				address_line: "7 Rue du General Fictif",
				geo_address_line: "7 Rue du Général Fictif",
				geo_label: "7 Rue du Général Fictif 75016 Ville Fictive",
			});
			expect(bySite.R10999999000002).toMatchObject({
				address_line: "3 bis Avenue du Specimen",
				geo_address_line: "3 bis Avenue du Spécimen",
			});
			// Another commune code and a low score: nothing stored, the registry text is shown.
			expect(bySite.R10999999000005).toMatchObject({ geo_label: null, geo_address_line: null });
			expect(bySite.R10999999000006).toMatchObject({ geo_label: null, geo_address_line: null });
			// A sure match on another street: the label is kept, the registry's line is shown.
			expect(bySite.R10999999000004?.geo_label).not.toBeNull();
			expect(bySite.R10999999000004?.geo_address_line).toBeNull();

			// The read models print the BAN's street name.
			const [page] = await sql<{ lines: string[] }[]>`
				SELECT array_agg(a ->> 'addressLine' ORDER BY a ->> 'addressLine') AS lines
				FROM directory.practitioner_pages pg
				JOIN directory.practitioners p ON p.id = pg.practitioner_id,
					jsonb_path_query(pg.payload, '$.activities[*].site') AS a
				WHERE p.national_id = ${fakeRpps(98)}
			`;
			expect(page?.lines).toEqual(["7 Rue du Général Fictif"]);
			const [doc] = await sql<{ line: string }[]>`
				SELECT sd.payload -> 'site' ->> 'addressLine' AS line
				FROM directory.search_docs sd
				JOIN directory.practitioners p ON p.id = sd.practitioner_id
				WHERE p.national_id = ${fakeRpps(98)}
			`;
			expect(doc?.line).toBe("7 Rue du Général Fictif");

			// Rerun online and offline: nothing to geocode, nothing changes.
			const again = await runOnline(dir, geocoder.url, { force: true });
			expect(again.status).toBe("succeeded");
			expect(geocoder.batches.length).toBe(1);
			expect(changes(again)).toBe(0);
			const offline = await run(dir, { force: true });
			expect(offline.status).toBe("succeeded");
			expect(changes(offline)).toBe(0);
			expect(await count("directory.sites WHERE geo_address_line IS NOT NULL")).toBe(labelled);
		} finally {
			await geocoder.close();
		}
	});
});
