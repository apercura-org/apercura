/**
 * Scheduled jobs, run by the host's scheduler (same image as the app):
 *
 *   bun run jobs:tick            expirations, reminders, outbox, closed practices, next free
 *                                slots, purges, queued listing counts, retention, admin alerts
 *                                and expired rate-limit counters
 *   bun run jobs:tick outbox     one sub-job only (expire | reminders | outbox | closures |
 *                                next-free | purge | claim-documents | landing-counts |
 *                                requests | page-views | admin-alerts | rate-limits | audit-log)
 *   bun run jobs:tick rotate-keys after a master key rotation, never scheduled: moves every
 *                                key and platform ciphertext to ENCRYPTION_ACTIVE_KEY
 *   bun run jobs:tick warm       the next slice of the cache warm-up (its own schedule; see
 *                                src/server/warm/run.ts); `warm --restart` starts it over
 *
 * Every sub-job takes its own Postgres advisory lock, so overlapping runs are harmless. Refuses
 * to run when the overlap constraint is missing (a schema created by `drizzle-kit push`), and in
 * production with an SMTP_URL that does not require TLS. The audit log retention connects with
 * DATABASE_URL_JOBS (role `apercura_jobs`), the rest with DATABASE_URL.
 */
import { loadRootEnv } from "../server/load-root-env";

const SUB_JOBS = [
	"tick",
	"expire",
	"reminders",
	"outbox",
	"next-free",
	"purge",
	"claim-documents",
	"landing-counts",
	"closures",
	"requests",
	"page-views",
	"admin-alerts",
	"rate-limits",
	"audit-log",
	"rotate-keys",
	"warm",
] as const;
type SubJob = (typeof SUB_JOBS)[number];

async function main() {
	await loadRootEnv();
	const command = (process.argv[2] ?? "tick") as SubJob;
	if (!SUB_JOBS.includes(command)) {
		console.error(`Unknown job "${command}". Use one of: ${SUB_JOBS.join(", ")}`);
		process.exitCode = 2;
		return;
	}
	const { smtpTransportOptions } = await import("../server/mail/smtp-options");
	// Same rule as the app's start: no patient email over an unencrypted connection.
	if (process.env.NODE_ENV === "production" && process.env.SMTP_URL) {
		smtpTransportOptions(process.env);
	}
	const { createDb } = await import("@apercura/db");
	const { assertBookingConstraints } = await import("../server/booking/constraints");
	const jobs = await import("../server/booking/jobs");
	const db = createDb({ max: 3, connectTimeout: 10 });
	const jobsUrl = process.env.DATABASE_URL_JOBS;
	// Two connections: the advisory lock holds one while the purge runs on the other.
	const auditDb = jobsUrl ? createDb({ url: jobsUrl, max: 2, connectTimeout: 10 }) : db;
	try {
		await assertBookingConstraints(db.$client);
		const now = Date.now;
		const run: Record<SubJob, () => Promise<unknown>> = {
			tick: () => jobs.runTick(db, { nowMs: now, auditDb }),
			expire: () => jobs.withAdvisoryLock(db, "jobs:expire", () => jobs.expireLapsed(db, now())),
			reminders: () =>
				jobs.withAdvisoryLock(db, "jobs:reminders", () => jobs.enqueueReminders(db, now())),
			outbox: () => jobs.withAdvisoryLock(db, "jobs:outbox", () => jobs.drainOutbox(db, now())),
			"next-free": () =>
				jobs.withAdvisoryLock(db, "jobs:next-free", () => jobs.refreshAllNextFree(db, now())),
			purge: () => jobs.withAdvisoryLock(db, "jobs:purge", () => jobs.purge(db, now())),
			"claim-documents": () => jobs.purgeClaimDocumentsJob(db, now()),
			"landing-counts": () => jobs.landingCountsJob(db),
			closures: () => jobs.closuresJob(db, now()),
			requests: () => jobs.requestsJob(db, now()),
			"page-views": () => jobs.pageViewsJob(db, now()),
			"admin-alerts": () => jobs.adminAlertsJob(db, now()),
			"rate-limits": () => jobs.rateLimitsJob(db, now()),
			"audit-log": () => jobs.auditLogJob(auditDb),
			warm: async () => {
				const { runWarm } = await import("../server/warm/run");
				const { readBuildId, sqlWarmStore } = await import("../server/warm/store");
				const buildId = await readBuildId();
				return jobs.withAdvisoryLock(db, "jobs:warm", () =>
					runWarm({
						store: sqlWarmStore(db.$client),
						fetch: (input, init) => fetch(input, init),
						env: process.env,
						buildId,
						restart: process.argv.slice(3).includes("--restart"),
					}),
				);
			},
			"rotate-keys": async () => {
				const { rotateKeys } = await import("../server/keys/rotation");
				const { getStorage, storageConfigured } = await import("../server/storage");
				return jobs.withAdvisoryLock(db, "jobs:rotate-keys", () =>
					rotateKeys(db, storageConfigured() ? getStorage() : null),
				);
			},
		};
		const result = await run[command]();
		const skipped = (result as { auditLog?: { skipped?: string } } | null)?.auditLog?.skipped;
		if (skipped || (result as { skipped?: string } | null)?.skipped) {
			console.warn(
				"Audit log retention skipped: set DATABASE_URL_JOBS to the apercura_jobs role (docs/configuration.md).",
			);
		}
		console.log(JSON.stringify({ job: command, result: result ?? "locked" }));
	} finally {
		if (auditDb !== db) await auditDb.close();
		await db.close();
	}
}

main().catch((error) => {
	console.error("Job failed:", error);
	process.exitCode = 1;
});
