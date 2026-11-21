import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import type { Transaction } from "~/server/db-executor";
import { pgErrorCode } from "./errors";

/** SQLSTATEs worth retrying the whole transaction for: deadlock, serialization failure. */
const RETRYABLE = new Set(["40P01", "40001"]);

export const PRACTITIONER_TX_ATTEMPTS = 3;

/** Advisory lock key of a practitioner's agenda: a stable 64-bit hash, shared by every process. */
export function practitionerLockKey(practitionerId: number) {
	return sql`hashtextextended(${`apercura:practitioner:${practitionerId}`}, 0)`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `run` in a transaction whose FIRST statement takes the practitioner's transaction-level
 * advisory lock, so every write touching one person's occupancy (hold, verify or revival,
 * reschedule, staff entries and blocks, transitions, sweeps) runs one at a time.
 *
 * Two concurrent inserts checking the same exclusion constraint can otherwise wait on each other
 * ("waits for ShareLock on transaction … while checking exclusion constraint") and deadlock. The
 * lock only removes that contention: the EXCLUDE constraint stays the guarantee that two active
 * entries never overlap. Deadlocks and serialization failures (from anything outside this
 * discipline) are retried up to 3 times with a jittered backoff.
 */
export async function practitionerTransaction<T>(
	db: Database,
	practitionerId: number,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await db.transaction(async (tx) => {
				await tx.execute(sql`select pg_advisory_xact_lock(${practitionerLockKey(practitionerId)})`);
				return run(tx);
			});
		} catch (error) {
			const code = pgErrorCode(error);
			if (attempt >= PRACTITIONER_TX_ATTEMPTS || code === undefined || !RETRYABLE.has(code)) {
				throw error;
			}
			await sleep(20 * attempt + Math.floor(Math.random() * 30 * attempt));
		}
	}
}
