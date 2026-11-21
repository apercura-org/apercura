/**
 * Scheduled booking jobs, run by the host's scheduler (same image as the app):
 *
 *   bun run jobs:tick            expirations, reminders, outbox, next free slots, purge
 *   bun run jobs:tick outbox     one sub-job only (expire | reminders | outbox | next-free | purge)
 *
 * Every sub-job takes its own Postgres advisory lock, so overlapping runs are harmless. Refuses
 * to run when the overlap constraint is missing (a schema created by `drizzle-kit push`).
 */
import { loadRootEnv } from "../server/load-root-env";

const SUB_JOBS = ["tick", "expire", "reminders", "outbox", "next-free", "purge"] as const;
type SubJob = (typeof SUB_JOBS)[number];

async function main() {
	await loadRootEnv();
	const command = (process.argv[2] ?? "tick") as SubJob;
	if (!SUB_JOBS.includes(command)) {
		console.error(`Unknown job "${command}". Use one of: ${SUB_JOBS.join(", ")}`);
		process.exitCode = 2;
		return;
	}
	const { createDb } = await import("@apercura/db");
	const { assertBookingConstraints } = await import("../server/booking/constraints");
	const jobs = await import("../server/booking/jobs");
	const db = createDb({ max: 3, connectTimeout: 10 });
	try {
		await assertBookingConstraints(db.$client);
		const now = Date.now;
		const run: Record<SubJob, () => Promise<unknown>> = {
			tick: () => jobs.runTick(db, { nowMs: now }),
			expire: () => jobs.withAdvisoryLock(db, "jobs:expire", () => jobs.expireLapsed(db, now())),
			reminders: () =>
				jobs.withAdvisoryLock(db, "jobs:reminders", () => jobs.enqueueReminders(db, now())),
			outbox: () => jobs.withAdvisoryLock(db, "jobs:outbox", () => jobs.drainOutbox(db, now())),
			"next-free": () =>
				jobs.withAdvisoryLock(db, "jobs:next-free", () => jobs.refreshAllNextFree(db, now())),
			purge: () => jobs.withAdvisoryLock(db, "jobs:purge", () => jobs.purge(db, now())),
		};
		const result = await run[command]();
		console.log(JSON.stringify({ job: command, result: result ?? "locked" }));
	} finally {
		await db.close();
	}
}

main().catch((error) => {
	console.error("Job failed:", error);
	process.exitCode = 1;
});
