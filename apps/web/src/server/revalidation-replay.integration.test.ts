/**
 * Replay protection of `/api/revalidate` against a real, migrated database
 * (DATABASE_URL_TEST). Skipped when the variable is unset.
 */
import { randomBytes } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { rateLimits } from "@apercura/db/schema";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptRevalidationOnce } from "./revalidation-replay";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("revalidation replay (database)", () => {
	let db: Database;
	const signature = randomBytes(32).toString("hex");
	const other = randomBytes(32).toString("hex");

	beforeAll(() => {
		db = createDb({ url: url as string, max: 2 });
	});

	afterAll(async () => {
		if (!db) return;
		await db
			.delete(rateLimits)
			.where(inArray(rateLimits.key, [`revalidate:${signature}`, `revalidate:${other}`]));
		await db.close();
	});

	it("accepts a signed request once and refuses its replay", async () => {
		expect(await acceptRevalidationOnce(db, signature)).toBe(true);
		expect(await acceptRevalidationOnce(db, signature)).toBe(false);
		expect(await acceptRevalidationOnce(db, signature.toUpperCase())).toBe(false);
		expect(await acceptRevalidationOnce(db, other)).toBe(true);
	});
});
