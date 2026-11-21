import type { Database } from "@apercura/db";
import type { RateLimitRule } from "~/server/rate-limit";
import { BookingError } from "./errors";

/**
 * What the booking services need from the outside world. The tRPC context builds one per
 * request; tests build them by hand (fixed clock, no limits, awaited background tasks).
 */
export interface BookingRuntime {
	db: Database;
	/** Current instant in milliseconds (injected so tests can travel in time). */
	nowMs: () => number;
	/** Counts one hit against a key; false when over the limit. */
	rateLimit: (key: string, rule: RateLimitRule) => Promise<boolean>;
	/** Rate-limit key of the calling client for `scope` (keyed hash, IPv6 by /64). */
	clientKey: (scope: string) => string;
	/** Correlates audit rows with one request. */
	requestId: string;
	/** Keyed hash of the client IP, for audit rows. */
	ipHash: string | null;
	/** Runs a task after the response (Next.js `after`); errors are logged, never thrown. */
	defer: (task: () => Promise<unknown>) => void;
}

export async function limit(rt: BookingRuntime, key: string, rule: RateLimitRule) {
	if (!(await rt.rateLimit(key, rule))) {
		throw new BookingError("RATE_LIMITED");
	}
}

/** `defer` that only logs failures (shared by the HTTP context and the jobs). */
export function deferWith(schedule: (task: () => Promise<void>) => void) {
	return (task: () => Promise<unknown>) =>
		schedule(async () => {
			try {
				await task();
			} catch (error) {
				console.error("Deferred booking task failed:", error);
			}
		});
}
