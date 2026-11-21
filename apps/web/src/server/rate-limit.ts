import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getSql } from "./db";
import { clientIp, windowStart } from "./rate-limit-core";

export { clientIp, windowStart } from "./rate-limit-core";

/** Random key for this process when RATE_LIMIT_KEY is not configured. */
let processKey: Buffer | undefined;

function hmacKey(): string | Buffer {
	const configured = process.env.RATE_LIMIT_KEY;
	if (configured) return configured;
	processKey ??= randomBytes(32);
	return processKey;
}

/** Rate-limit key of a client: never the raw IP, a keyed hash of it. */
export function clientKey(scope: string, headers: Headers): string {
	const ip = clientIp(headers, Number(process.env.TRUSTED_PROXY_COUNT ?? 0));
	const digest = createHmac("sha256", hmacKey()).update(ip).digest("base64url");
	return `${scope}:${digest}`;
}

export type RateLimit = { scope: string; limit: number; windowSeconds: number };

/**
 * Counts one request in the current fixed window and throws
 * `TOO_MANY_REQUESTS` above the limit. The increment is a single atomic
 * upsert, so concurrent requests can never both slip under the limit.
 */
export async function enforceRateLimit(headers: Headers, rule: RateLimit): Promise<void> {
	const sql = getSql();
	const key = clientKey(rule.scope, headers);
	const start = windowStart(Date.now(), rule.windowSeconds);
	const [row] = await sql<{ hits: number }[]>`
		INSERT INTO directory.rate_limits AS r (key, window_start, hits)
		VALUES (${key}, ${start}, 1)
		ON CONFLICT (key, window_start) DO UPDATE SET hits = r.hits + 1
		RETURNING r.hits
	`;
	// About one request in a hundred sweeps windows older than a day.
	if (Math.random() < 0.01) {
		void sql`DELETE FROM directory.rate_limits WHERE window_start < now() - interval '1 day'`.catch(
			() => {},
		);
	}
	if ((row?.hits ?? 0) > rule.limit) {
		throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests" });
	}
}
