/**
 * Better Auth's rate limiter and the purge of both rate-limit tables, against a real, migrated
 * database (DATABASE_URL_TEST): sign-in attempts are limited per address as before, but
 * `directory.auth_rate_limit` never holds the address; `jobs:tick rate-limits` deletes only the
 * counters whose window has elapsed. Synthetic addresses (documentation ranges) and emails
 * only; skipped when the variable is unset.
 */
import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { authRateLimit, authSchema, rateLimits } from "@apercura/db/schema";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authRateLimitKey, consumeRateLimit, purgeExpiredRateLimits } from "~/server/rate-limit";
import { CLIENT_IP_HEADER } from "./client-ip";
import { AUTH_RATE_LIMIT_RULES, authRateLimitStorage } from "./rate-limit-storage";

const url = process.env.DATABASE_URL_TEST;
const env = { RATE_LIMIT_KEY: "synthetic-rate-limit-key-for-tests-only" };

describe.skipIf(!url)("auth rate limits (database)", () => {
	let db: Database;
	const run = randomUUID().slice(0, 8);
	// Distinct documentation addresses per run, so parallel runs never share a bucket.
	const octet = Number.parseInt(run.slice(0, 2), 16);
	const ipv4 = `198.51.100.${octet}`;
	const ipv6 = `2001:db8:${run.slice(0, 4)}:${run.slice(4, 8)}::7`;
	const createdKeys: string[] = [];
	const signInKeys: string[] = [];

	beforeAll(() => {
		db = createDb({ url: url as string, max: 4 });
	});

	afterAll(async () => {
		if (!db) return;
		if (createdKeys.length > 0) {
			await db.delete(rateLimits).where(inArray(rateLimits.key, createdKeys));
		}
		await db.delete(authRateLimit).where(like(authRateLimit.key, `%-${run}`));
		if (signInKeys.length > 0) {
			await db.delete(authRateLimit).where(inArray(authRateLimit.key, signInKeys));
		}
		await db.close();
	});

	function testAuth() {
		return betterAuth({
			baseURL: "http://localhost:4166",
			basePath: "/api/auth",
			secret: "synthetic-better-auth-secret-for-tests-0123456789",
			database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
			telemetry: { enabled: false },
			emailAndPassword: { enabled: true },
			rateLimit: {
				enabled: true,
				window: 60,
				max: 100,
				customRules: AUTH_RATE_LIMIT_RULES,
				customStorage: authRateLimitStorage(db, { env }),
			},
			advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
		});
	}

	const signIn = (auth: ReturnType<typeof testAuth>, ip: string) =>
		auth.handler(
			new Request("http://localhost:4166/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:4166",
					[CLIENT_IP_HEADER]: ip,
				},
				body: JSON.stringify({
					email: `nobody-${run}@example.test`,
					password: "synthetic-password-123",
				}),
			}),
		);

	it("limits sign-in attempts per address without storing the address", async () => {
		const signInRows = () =>
			db.select().from(authRateLimit).where(like(authRateLimit.key, "%|/sign-in/email"));
		const before = new Set((await signInRows()).map((row) => row.key));
		const auth = testAuth();
		const statuses: number[] = [];
		for (let attempt = 0; attempt < 6; attempt += 1) {
			statuses.push((await signIn(auth, ipv4)).status);
		}
		expect(statuses.slice(0, 5)).not.toContain(429);
		expect(statuses[5]).toBe(429);
		// Another address keeps its own bucket.
		expect((await signIn(auth, ipv6)).status).not.toBe(429);

		const created = (await signInRows()).filter((row) => !before.has(row.key));
		signInKeys.push(...created.map((row) => row.key));
		expect(created).toHaveLength(2);
		for (const row of created) {
			expect(row.key).toMatch(/^auth:[\w-]{43}\|\/sign-in\/email$/);
			expect(row.windowSeconds).toBe(60);
		}
		const v4Key = authRateLimitKey(`${ipv4}|/sign-in/email`, env);
		expect(created.find((row) => row.key === v4Key)?.count).toBe(
			AUTH_RATE_LIMIT_RULES["/sign-in/email"].max + 1,
		);

		const table = JSON.stringify(await db.execute(sql`select * from directory.auth_rate_limit`));
		expect(table).not.toContain(ipv4);
		expect(table).not.toMatch(new RegExp(`2001:0?db8:0*${run.slice(0, 4).replace(/^0+/, "")}`));
	});

	it("keeps Better Auth's rule: a window, refused hits that do not extend it, then a reset", async () => {
		let now = 1_000_000_000_000;
		const storage = authRateLimitStorage(db, { env, now: () => now });
		const key = `203.0.113.9|/rule-${run}`;
		const rule = { window: 60, max: 2 };
		expect(await storage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });
		now += 10_000;
		expect(await storage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });
		now += 10_000;
		expect(await storage.consume(key, rule)).toEqual({ allowed: false, retryAfter: 50 });
		now += 49_000;
		expect((await storage.consume(key, rule)).allowed).toBe(false);
		now += 1_000;
		expect(await storage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });
	});

	it("lets exactly `max` concurrent hits through", async () => {
		const storage = authRateLimitStorage(db, { env });
		const key = `203.0.113.10|/concurrent-${run}`;
		const results = await Promise.all(
			Array.from({ length: 12 }, () => storage.consume(key, { window: 60, max: 5 })),
		);
		expect(results.filter((result) => result.allowed)).toHaveLength(5);
	});

	it("purges only the counters whose window has elapsed", async () => {
		const now = Date.now();
		const key = (name: string) => {
			const value = `purge-${name}-${run}`;
			createdKeys.push(value);
			return value;
		};
		await db.insert(rateLimits).values([
			{ key: key("old"), count: 3, windowSeconds: 60, windowStartedAt: new Date(now - 61_000) },
			{ key: key("live"), count: 3, windowSeconds: 3600, windowStartedAt: new Date(now - 61_000) },
			{
				key: key("day"),
				count: 1,
				windowSeconds: 86_400,
				windowStartedAt: new Date(now - 3_600_000),
			},
		]);
		await db.insert(authRateLimit).values([
			{
				id: randomUUID(),
				key: `auth:purge-old-${run}`,
				count: 5,
				lastRequest: now - 60_000,
				windowSeconds: 60,
			},
			{
				id: randomUUID(),
				key: `auth:purge-live-${run}`,
				count: 5,
				lastRequest: now - 59_000,
				windowSeconds: 60,
			},
			{
				id: randomUUID(),
				key: `auth:purge-hour-${run}`,
				count: 1,
				lastRequest: now - 600_000,
				windowSeconds: 3600,
			},
		]);

		const purged = await purgeExpiredRateLimits(db, now);
		expect(purged.rateLimits).toBeGreaterThanOrEqual(1);
		expect(purged.authRateLimits).toBeGreaterThanOrEqual(1);

		const left = await db
			.select({ key: rateLimits.key })
			.from(rateLimits)
			.where(inArray(rateLimits.key, createdKeys));
		expect(left.map((row) => row.key).sort()).toEqual(
			[`purge-day-${run}`, `purge-live-${run}`].sort(),
		);
		const authLeft = await db
			.select({ key: authRateLimit.key })
			.from(authRateLimit)
			.where(like(authRateLimit.key, `auth:purge-%-${run}`));
		expect(authLeft.map((row) => row.key).sort()).toEqual(
			[`auth:purge-hour-${run}`, `auth:purge-live-${run}`].sort(),
		);
	});

	it("records each window, so a counter the limiter still counts is never purged", async () => {
		const key = `purge-consumed-${run}`;
		createdKeys.push(key);
		expect(await consumeRateLimit(db, key, { max: 3, windowSeconds: 3600 })).toBe(true);
		const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
		expect(row?.windowSeconds).toBe(3600);
		// Age this counter rather than purge with a clock an hour ahead: the purge is global, and
		// a clock ahead would also delete the live counters of the test files running in
		// parallel on the same database, resetting them mid-test.
		const age = (seconds: number) =>
			db
				.update(rateLimits)
				.set({
					windowStartedAt: sql`${rateLimits.windowStartedAt} - make_interval(secs => ${seconds})`,
				})
				.where(eq(rateLimits.key, key));
		await age(3540);
		await purgeExpiredRateLimits(db, Date.now());
		expect(await db.select().from(rateLimits).where(eq(rateLimits.key, key))).toHaveLength(1);
		await age(120);
		await purgeExpiredRateLimits(db, Date.now());
		expect(await db.select().from(rateLimits).where(eq(rateLimits.key, key))).toHaveLength(0);
	});
});
