import type { Database } from "@apercura/db";
import { rateLimits } from "@apercura/db/schema";
import { sql } from "drizzle-orm";

export { clientRateLimitKey } from "./rate-limit-key";

/*
 * The app's one rate limiter, shared by auth (per signed-in user) and public
 * search (per client), on `directory.rate_limits`. Better Auth keeps its own
 * built-in counters in `directory.auth_rate_limit`, the storage its plugin
 * requires.
 */

export interface RateLimitRule {
	max: number;
	windowSeconds: number;
}

/**
 * Counts one hit against `key` in a fixed window and says whether it is allowed.
 * A single atomic statement, so concurrent requests cannot both pass the limit.
 */
export async function consumeRateLimit(
	db: Database,
	key: string,
	rule: RateLimitRule,
): Promise<boolean> {
	const expired = sql`${rateLimits.windowStartedAt} <= now() - make_interval(secs => ${rule.windowSeconds})`;
	const [row] = await db
		.insert(rateLimits)
		.values({ key, count: 1 })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
				windowStartedAt: sql`case when ${expired} then now() else ${rateLimits.windowStartedAt} end`,
			},
		})
		.returning({ count: rateLimits.count });
	return (row?.count ?? 0) <= rule.max;
}
