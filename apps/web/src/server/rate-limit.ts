import type { Database } from "@apercura/db";
import { rateLimits } from "@apercura/db/schema";
import { sql } from "drizzle-orm";
import { at } from "./booking/sql-time";

export { authRateLimitKey, clientRateLimitKey, emailRateLimitKey } from "./rate-limit-key";

/*
 * The app's one rate limiter, shared by auth (per signed-in user) and public
 * search (per client), on `directory.rate_limits`. Better Auth's built-in
 * counters live in `directory.auth_rate_limit`, written by our own storage
 * (./auth/rate-limit-storage.ts). `jobs:tick rate-limits` purges both.
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
		.values({ key, count: 1, windowSeconds: rule.windowSeconds })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
				windowStartedAt: sql`case when ${expired} then now() else ${rateLimits.windowStartedAt} end`,
				windowSeconds: rule.windowSeconds,
			},
		})
		.returning({ count: rateLimits.count });
	return (row?.count ?? 0) <= rule.max;
}

const PURGE_BATCH = 5_000;
/** Bounds one run; the next tick goes on where this one stopped. */
const PURGE_MAX_BATCHES = 20;

/**
 * Deletes the counters whose window has elapsed at `nowMs`, in both rate-limit tables: a
 * counter past its window counts as zero for the limiter anyway (it restarts at 1), so the
 * limits are unchanged. A row still inside its window is never touched; one written by a
 * concurrent request after the cutoff is re-checked by PostgreSQL and kept.
 */
export async function purgeExpiredRateLimits(db: Pick<Database, "execute">, nowMs: number) {
	const drain = async (statement: () => ReturnType<Database["execute"]>) => {
		let total = 0;
		for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
			const deleted = (await statement()).count ?? 0;
			total += deleted;
			if (deleted < PURGE_BATCH) break;
		}
		return total;
	};
	const rateLimitRows = await drain(() =>
		db.execute(sql`
			delete from directory.rate_limits where key in (
				select key from directory.rate_limits
				where window_started_at <= ${at(nowMs)} - make_interval(secs => window_seconds)
				limit ${PURGE_BATCH}
			)
			and window_started_at <= ${at(nowMs)} - make_interval(secs => window_seconds)
		`),
	);
	const authRows = await drain(() =>
		db.execute(sql`
			delete from directory.auth_rate_limit where id in (
				select id from directory.auth_rate_limit
				where last_request <= ${nowMs}::bigint - window_seconds::bigint * 1000
				limit ${PURGE_BATCH}
			)
			and last_request <= ${nowMs}::bigint - window_seconds::bigint * 1000
		`),
	);
	return { rateLimits: rateLimitRows, authRateLimits: authRows };
}
