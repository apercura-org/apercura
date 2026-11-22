import { randomUUID } from "node:crypto";
import type { Database } from "@apercura/db";
import type { BetterAuthRateLimitOptions, BetterAuthRateLimitStorage } from "better-auth";
import { sql } from "drizzle-orm";
import { authRateLimitKey } from "~/server/rate-limit-key";

const HOUR = 60 * 60;

/** Per client address and path, on top of the per-email limits of ./policy. */
export const AUTH_RATE_LIMIT_RULES = {
	"/sign-up/email": { window: HOUR, max: 5 },
	"/sign-in/email": { window: 60, max: 5 },
	"/send-verification-email": { window: HOUR, max: 3 },
	"/two-factor/*": { window: 60, max: 5 },
	"/passkey/verify-authentication": { window: 60, max: 10 },
} satisfies NonNullable<BetterAuthRateLimitOptions["customRules"]>;

type Env = Parameters<typeof authRateLimitKey>[1];

/**
 * Better Auth's rate-limit storage on `directory.auth_rate_limit`, in place of its built-in
 * "database" storage, which stored its keys (`{ip}|{path}`) with the raw client address. Keys
 * go through `authRateLimitKey` (a keyed hash of the address, the path in clear).
 *
 * Same rule as the built-in storage: a hit is allowed while fewer than `max` were allowed
 * since the last allowed hit less than `window` ago, and resets the window once that has
 * elapsed. One `INSERT … ON CONFLICT DO UPDATE` per hit, so concurrent requests cannot both
 * take the last slot. A refused hit leaves the window as it is and stores `max + 1`, which is
 * how the statement tells it apart. The row also records its window for the purge
 * (`purgeExpiredRateLimits`, `jobs:tick rate-limits`).
 */
export function authRateLimitStorage(
	db: Pick<Database, "execute">,
	options: { now?: () => number; env?: Env } = {},
): BetterAuthRateLimitStorage {
	const now = options.now ?? Date.now;
	return {
		async consume(key, rule) {
			const nowMs = now();
			const windowMs = rule.window * 1000;
			const stored = authRateLimitKey(key, options.env);
			const elapsed = sql`r.last_request <= ${nowMs}::bigint - ${windowMs}::bigint`;
			const [row] = await db.execute<{ count: number; last_request: string | number }>(sql`
				insert into directory.auth_rate_limit as r (id, key, count, last_request, window_seconds)
				values (${randomUUID()}, ${stored}, 1, ${nowMs}::bigint, ${rule.window}::integer)
				on conflict (key) do update set
					count = case
						when ${elapsed} then 1
						when r.count < ${rule.max}::integer then r.count + 1
						else ${rule.max}::integer + 1
					end,
					last_request = case
						when ${elapsed} or r.count < ${rule.max}::integer then ${nowMs}::bigint
						else r.last_request
					end,
					window_seconds = ${rule.window}::integer
				returning count, last_request
			`);
			if (row && row.count <= rule.max) {
				return { allowed: true, retryAfter: null };
			}
			const lastRequest = Number(row?.last_request ?? nowMs);
			return {
				allowed: false,
				retryAfter: Math.max(1, Math.ceil((lastRequest + windowMs - nowMs) / 1000)),
			};
		},
	};
}
