import type { Database } from "@apercura/db";
import { consumeRateLimit } from "./rate-limit";

/**
 * Longer than the ±5 minute timestamp window of signed revalidation requests
 * (`@apercura/core/revalidation`), so a signature can never be accepted twice.
 */
const REPLAY_WINDOW_SECONDS = 15 * 60;

/**
 * Burns a verified revalidation signature: true the first time, false for a
 * replay of the very same request (the sender re-signs every retry with a new
 * timestamp, so a legitimate retry has a new signature).
 */
export function acceptRevalidationOnce(db: Database, signature: string): Promise<boolean> {
	return consumeRateLimit(db, `revalidate:${signature.toLowerCase().slice(0, 64)}`, {
		max: 1,
		windowSeconds: REPLAY_WINDOW_SECONDS,
	});
}
