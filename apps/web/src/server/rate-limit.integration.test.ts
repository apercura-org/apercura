/**
 * The app's rate limiter (`consumeRateLimit`) against a real, migrated database
 * (DATABASE_URL_TEST), under real concurrency: enough connections that the hits
 * actually race. Skipped when the variable is unset.
 */
import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { rateLimits } from "@apercura/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "./rate-limit";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("rate limiter (database)", () => {
	let db: Database;
	const run = randomUUID().slice(0, 8);
	const createdKeys: string[] = [];
	const key = (name: string) => {
		const value = `stress-${name}-${run}`;
		createdKeys.push(value);
		return value;
	};

	beforeAll(() => {
		db = createDb({ url: url as string, max: 16 });
	});

	afterAll(async () => {
		if (!db) return;
		if (createdKeys.length > 0) {
			await db.delete(rateLimits).where(inArray(rateLimits.key, createdKeys));
		}
		await db.close();
	});

	it("lets exactly `max` of 50 concurrent hits through and counts every one", async () => {
		const limit = key("burst");
		const rule = { max: 7, windowSeconds: 3600 };
		const results = await Promise.all(
			Array.from({ length: 50 }, () => consumeRateLimit(db, limit, rule)),
		);
		expect(results.filter(Boolean)).toHaveLength(rule.max);
		const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, limit));
		expect(row?.count).toBe(50);
	});

	it("restarts an elapsed window once, even when concurrent hits find it elapsed", async () => {
		const limit = key("rollover");
		const rule = { max: 3, windowSeconds: 60 };
		await db.insert(rateLimits).values({
			key: limit,
			count: 99,
			windowSeconds: rule.windowSeconds,
			windowStartedAt: sql`now() - interval '61 seconds'`,
		});
		const results = await Promise.all(
			Array.from({ length: 20 }, () => consumeRateLimit(db, limit, rule)),
		);
		expect(results.filter(Boolean)).toHaveLength(rule.max);
		const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, limit));
		expect(row?.count).toBe(20);
	});
});
