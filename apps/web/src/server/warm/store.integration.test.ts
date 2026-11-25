/**
 * The warm-up's cursor (`directory.cache_warmup`) against a real, migrated database
 * (DATABASE_URL_TEST). Skipped when the variable is unset. Puts the row back as it was.
 */
import { createDb, type Database } from "@apercura/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CursorRow, sqlWarmStore } from "./store";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("cache warm-up cursor (database)", () => {
	let db: Database;
	let saved: Record<string, unknown> | undefined;

	beforeAll(async () => {
		db = createDb({ url: url as string, max: 2 });
		[saved] = await db.$client`SELECT * FROM directory.cache_warmup WHERE id = 1`;
	});

	afterAll(async () => {
		if (!db) return;
		if (saved) {
			await db.$client`
				UPDATE directory.cache_warmup SET ${db.$client(saved, "generation", "unit", "position", "warmed", "errors", "started_at", "completed_at", "restart_requested_at")}
				WHERE id = 1
			`;
		}
		await db.close();
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
		for (const chunk of chunks) {
			expect(chunk.urls).toBeGreaterThan(0);
			const entries = await store.entries(chunk.kind, chunk.chunk);
			expect(entries.length).toBeGreaterThan(0);
			expect(entries.every((path) => path.startsWith("/"))).toBe(true);
		}
		const run = await store.lastImportRun();
		expect(run === null || Number.isInteger(run)).toBe(true);
	});
});
