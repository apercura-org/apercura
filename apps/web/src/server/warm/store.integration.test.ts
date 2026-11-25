/**
 * The warm-up's cursor (`directory.cache_warmup`) against a real, migrated database
 * (DATABASE_URL_TEST). Skipped when the variable is unset.
 */
import { createDb, type Database } from "@apercura/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolatedDatabase } from "~/test/isolated-database";
import { type CursorRow, sqlWarmStore } from "./store";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("cache warm-up cursor (database)", () => {
	let db: Database;
	// A database of its own: the cursor is a single row, and the sitemap walk reads every page
	// (the files running alongside add and delete theirs meanwhile).
	const isolated = isolatedDatabase("warm_store");

	beforeAll(async () => {
		db = createDb({ url: await isolated.create(), max: 2 });
		// One synthetic practitioner with an office: a page for the sitemap walk.
		const sql = db.$client;
		const [place] = await sql<{ id: number }[]>`
			INSERT INTO directory.places (kind, code, name, slug, department_code, postcodes, centroid)
			VALUES ('commune', 'W99999', 'Exempleville', 'exempleville-w', '99', '{99999}',
				'SRID=4326;POINT(2.35 48.85)')
			RETURNING id
		`;
		const [person] = await sql<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, first_name, last_name, first_name_source,
				last_name_source, profession_code, listing_slug, slug, primary_place_id, indexable)
			VALUES ('19999999998', 'Exemple', 'Martin', 'EXEMPLE', 'MARTIN', '10',
				'medecin-generaliste', 'exemple-martin-w', ${place?.id ?? null}, true)
			RETURNING id
		`;
		const [site] = await sql<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode, place_id,
				location, geo_precision)
			VALUES ('ans', 'warm-site', 'office', 'Cabinet Exemple', '1 rue de l’Exemple', '99999',
				${place?.id ?? null}, 'SRID=4326;POINT(2.35 48.85)', 'address')
			RETURNING id
		`;
		await sql`
			INSERT INTO directory.activities (practitioner_id, site_id, source, source_key, practice_kind, is_primary)
			VALUES (${person?.id ?? 0}, ${site?.id ?? 0}, 'ans', 'warm-activity', 'office', true)
		`;
		await sql`SELECT directory.refresh_practitioner(${[person?.id ?? 0]}::integer[])`;
	});

	afterAll(async () => {
		await db?.close();
		await isolated.drop();
	});

	it("restarts, records progress and keeps an import's request made meanwhile", async () => {
		const store = sqlWarmStore(db.$client);
		const fresh: CursorRow = await store.restart("test:1", null);
		expect(fresh).toMatchObject({ generation: "test:1", unit: null, position: 0, warmed: 0 });
		expect(fresh.completedAt).toBeNull();

		await store.save({ unit: "listes-0", position: 12, warmed: 12, errors: 1, completed: false });
		await store.save({ unit: "praticiens-0", position: 3, warmed: 3, errors: 0, completed: true });
		const row = await store.read();
		expect(row).toMatchObject({ unit: "praticiens-0", position: 3, warmed: 15, errors: 1 });
		expect(row.completedAt).toEqual(expect.any(String));

		// The import asks for a new walk (as packages/etl/src/outbox.ts does).
		await db.$client`UPDATE directory.cache_warmup SET restart_requested_at = now() WHERE id = 1`;
		const asked = await store.read();
		expect(asked.restartRequestedAt).toEqual(expect.any(String));
		// A run that read an older request (none) keeps the newer one for the next run.
		expect((await store.restart("test:2", null)).restartRequestedAt).toBe(asked.restartRequestedAt);
		// A run that read this request clears it.
		expect((await store.restart("test:2", asked.restartRequestedAt)).restartRequestedAt).toBeNull();
	});

	it("reads the sitemap walk and the last successful import", async () => {
		const store = sqlWarmStore(db.$client);
		const chunks = await store.chunks();
		expect(chunks.map((chunk) => `${chunk.market}:${chunk.kind}`)).toContain("fr:praticiens");
		for (const chunk of chunks) {
			expect(chunk.urls).toBeGreaterThan(0);
			const entries = await store.entries(chunk.market, chunk.kind, chunk.chunk);
			expect(entries).toHaveLength(chunk.urls);
			expect(entries.every((path) => path.startsWith("/"))).toBe(true);
		}
		expect(await store.entries("fr", "praticiens", 0)).toContain("/praticien/exemple-martin-w");
		expect(await store.lastImportRun()).toBeNull();
	});
});
