import { COMPLETION_DELAY_MS } from "@apercura/core/booking";
import { instantToLocalDate, localToInstant } from "@apercura/core/time";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { cacheTags } from "~/server/cache-tags";
import { writeAudit } from "~/server/phi";
import { purgeExpiredRateLimits } from "~/server/rate-limit";
import { sendAdminAlerts } from "../admin-alerts";
import { purgeClaimDocuments } from "../claims/service";
import { purgeAuditLogs, purgeClosedRequests, purgePageViews } from "../retention";
import { getStorage, type StorageDriver, storageConfigured } from "../storage";
import { finalizeClosures } from "./closure";
import { practitionerTransaction } from "./locks";
import { refreshNextFree } from "./next-free";
import { enqueueOutbox } from "./outbox";
import { type MailTransport, processOutbox } from "./outbox-worker";
import { sendRevalidation } from "./revalidate-remote";
import { at } from "./sql-time";
import { type ExpiredEntry, recordEvents, recordExpiries } from "./transitions";

/*
 * Scheduled work, chained by `bun run jobs:tick`. Each sub-job runs under its
 * own Postgres advisory lock, so overlapping ticks never do the same work twice.
 * Correctness never depends on these jobs: expirations are also applied on
 * write and filtered on read.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BATCH = 500;

/** Local time of the day before the appointment from which its reminder goes out. */
export const REMINDER_LOCAL_MINUTES = 9 * 60;
/** No reminder for an appointment booked less than this long before it starts. */
export const REMINDER_MIN_LEAD_MS = 12 * HOUR_MS;
/** Unverified patient details are erased after this long. */
export const UNVERIFIED_RETENTION_MS = DAY_MS;
/** Processed outbox rows are kept this long (delivery questions), then deleted. */
export const OUTBOX_RETENTION_MS = 30 * DAY_MS;

/**
 * Runs `task` while holding the session advisory lock `name` on a reserved connection; returns
 * null without running it when another process holds the lock.
 */
export async function withAdvisoryLock<T>(
	db: Database,
	name: string,
	task: () => Promise<T>,
): Promise<T | null> {
	const reserved = await db.$client.reserve();
	try {
		const [row] = await reserved<{ locked: boolean }[]>`
			select pg_try_advisory_lock(hashtextextended(${`apercura:${name}`}, 0)) as locked
		`;
		if (!row?.locked) {
			return null;
		}
		try {
			return await task();
		} finally {
			await reserved`select pg_advisory_unlock(hashtextextended(${`apercura:${name}`}, 0))`;
		}
	} finally {
		reserved.release();
	}
}

/** Holds and requests past their deadline become `expired`; old confirmed ones `completed`. */
export async function expireLapsed(db: Database, nowMs: number) {
	const now = new Date(nowMs);
	const touched = new Set<number>();
	let expiredCount = 0;
	// One practitioner at a time, under the same advisory lock as every booking write.
	const due = await db.execute<{ practitioner_id: number }>(sql`
		select distinct practitioner_id from care.appointments
		where status in ('held', 'pending') and expires_at <= ${at(now)}
	`);
	for (const { practitioner_id: practitionerId } of due) {
		expiredCount += await practitionerTransaction(db, practitionerId, async (tx) => {
			const rows = await tx.execute<{
				id: string;
				organization_id: string;
				from_status: "held" | "pending";
				revision: number;
			}>(sql`
				with lapsed as (
					select id, status from care.appointments
					where practitioner_id = ${practitionerId}
						and status in ('held', 'pending') and expires_at <= ${at(now)}
					for update
				)
				update care.appointments a
				set status = 'expired',
					expiry_reason = case when lapsed.status = 'held' then 'hold_timeout' else 'validation_deadline' end,
					revision = a.revision + 1,
					updated_at = ${at(now)}
				from lapsed
				where a.id = lapsed.id
				returning a.id, a.organization_id, lapsed.status as from_status, a.revision
			`);
			const expired: ExpiredEntry[] = [...rows].map((row) => ({
				id: row.id,
				organizationId: row.organization_id,
				fromStatus: row.from_status,
				revision: row.revision,
			}));
			await recordExpiries(tx, expired, "system:sweep");
			return expired.length;
		});
		touched.add(practitionerId);
	}

	const completed = await db.transaction(async (tx) => {
		const rows = await tx.execute<{ id: string; organization_id: string; revision: number }>(sql`
			with done as (
				select id from care.appointments
				where status = 'confirmed' and kind = 'appointment'
					and ends_at <= ${at(nowMs - COMPLETION_DELAY_MS)}
				limit ${BATCH * 4}
				for update skip locked
			)
			update care.appointments a
			set status = 'completed', revision = a.revision + 1, updated_at = ${at(now)}
			from done where a.id = done.id
			returning a.id, a.organization_id, a.revision
		`);
		await recordEvents(
			tx,
			[...rows].map((row) => ({
				appointmentId: row.id,
				organizationId: row.organization_id,
				actor: "system:sweep",
				event: "complete",
				fromStatus: "confirmed",
				toStatus: "completed",
				revision: row.revision,
			})),
		);
		return rows.length;
	});
	return { expired: expiredCount, completed, practitionerIds: [...touched] };
}

/**
 * Reminders the day before, computed in each site's time zone: from 09:00 local time on the day
 * before the appointment. Skipped for appointments booked less than 12 hours before they start
 * and for addresses typed by the practice that were never confirmed. Dedupe key
 * `reminder:{id}:{revision}`: a moved appointment gets its own reminder.
 */
export async function enqueueReminders(db: Database, nowMs: number) {
	const now = new Date(nowMs);
	return db.transaction(async (tx) => {
		const rows = await tx.execute<{
			id: string;
			organization_id: string;
			revision: number;
			starts_at: Date;
			time_zone: string;
		}>(sql`
			select a.id, a.organization_id, a.revision, a.starts_at, c.time_zone
			from care.appointments a
			join care.calendars c on c.id = a.calendar_id
			where a.status = 'confirmed' and a.kind = 'appointment'
				and a.reminder_sent_at is null and a.purged_at is null
				and a.email_verified_at is not null and a.patient_email_enc is not null
				and a.starts_at > ${at(now)} and a.starts_at <= ${at(nowMs + 2 * DAY_MS)}
				and a.booked_at <= a.starts_at - interval '12 hours'
			for update of a skip locked
		`);
		const due = [...rows].filter((row) => {
			const startMs = new Date(row.starts_at).getTime();
			const dayBefore = instantToLocalDate(startMs, row.time_zone).subtract({ days: 1 });
			return nowMs >= localToInstant(dayBefore, REMINDER_LOCAL_MINUTES, row.time_zone);
		});
		if (due.length === 0) {
			return 0;
		}
		await enqueueOutbox(
			tx,
			due.map((row) => ({
				organizationId: row.organization_id,
				kind: "reminder" as const,
				appointmentId: row.id,
				revision: row.revision,
				expectedStatuses: ["confirmed"],
				dedupeKey: `reminder:${row.id}:${row.revision}`,
			})),
		);
		await tx.execute(sql`
			update care.appointments set reminder_sent_at = ${at(now)}
			where id in (${sql.join(
				due.map((row) => sql`${row.id}::uuid`),
				sql`, `,
			)})
		`);
		return due.length;
	});
}

const PATIENT_FIELDS_NULL = sql`
	patient_first_name_enc = null, patient_last_name_enc = null, patient_email_enc = null,
	patient_phone_enc = null, practice_message_enc = null, patient_address_enc = null,
	patient_commune_enc = null, email_bidx = null, phone_bidx = null,
	manage_token_hash = null, manage_token_nonce = null, hold_token_hash = null,
	browser_key_hash = null`;

/**
 * Erases patient data: details never verified after 24 hours, everything at `purge_after`
 * (end of the appointment + the calendar's retention). The rows stay, without identity, for the
 * agenda's history. Expired codes and old outbox rows are deleted. Backups keep data until
 * their own expiry (see docs).
 */
export async function purge(db: Database, nowMs: number) {
	const now = new Date(nowMs);
	const purged = await db.transaction(async (tx) => {
		const rows = await tx.execute<{ id: string; organization_id: string; reason: string }>(sql`
			with targets as (
				select id,
					case when purge_after is not null and purge_after <= ${at(now)} then 'retention' else 'unverified' end as reason
				from care.appointments
				where purged_at is null and kind = 'appointment'
					and (
						(purge_after is not null and purge_after <= ${at(now)})
						or (source = 'online' and email_verified_at is null
							and created_at <= ${at(nowMs - UNVERIFIED_RETENTION_MS)}
							and status not in ('held', 'pending', 'confirmed'))
					)
				limit ${BATCH * 4}
				for update skip locked
			)
			update care.appointments a
			set ${PATIENT_FIELDS_NULL}, purged_at = ${at(now)}, updated_at = ${at(now)}
			from targets where a.id = targets.id
			returning a.id, a.organization_id, targets.reason
		`);
		const byOrganization = new Map<string, string[]>();
		for (const row of rows) {
			byOrganization.set(row.organization_id, [
				...(byOrganization.get(row.organization_id) ?? []),
				row.id,
			]);
		}
		for (const [organizationId, ids] of byOrganization) {
			await writeAudit(
				tx,
				{ organizationId, actor: "system:purge", purpose: "retention" },
				{ action: "purge", subjectTable: "appointments", subjectIds: ids },
			);
		}
		return rows.length;
	});
	const codes = await db.execute(sql`
		delete from care.otp_challenges
		where expires_at <= ${at(nowMs - UNVERIFIED_RETENTION_MS)}
	`);
	const mails = await db.execute(sql`
		delete from care.outbox
		where status in ('sent', 'skipped', 'dead') and created_at <= ${at(nowMs - OUTBOX_RETENTION_MS)}
	`);
	return { appointments: purged, codes: codes.count ?? 0, outbox: mails.count ?? 0 };
}

/**
 * Recomputes `next_free_at` of every practitioner with an open calendar (or the given ones), then
 * asks the web app to refresh the pages whose next free slot changed (see `sendRevalidation`).
 */
export async function refreshAllNextFree(db: Database, nowMs: number, ids?: readonly number[]) {
	const rows = ids
		? ids.map((id) => ({ practitioner_id: id }))
		: [
				...(await db.execute<{ practitioner_id: number }>(sql`
					select distinct practitioner_id from care.calendars where status = 'open'
					union
					select id from directory.practitioners
					where next_free_at is not null
						and id not in (select practitioner_id from care.calendars where status = 'open')
				`)),
			];
	const changed: number[] = [];
	for (const row of rows) {
		if (await refreshNextFree(db, row.practitioner_id, nowMs)) {
			changed.push(row.practitioner_id);
		}
	}
	const revalidated = await sendRevalidation(changed.map((id) => cacheTags.practitioner(id)));
	return { practitioners: rows.length, changed: changed.length, revalidated };
}

/** Sends every due outbox row, batch after batch. */
export async function drainOutbox(db: Database, nowMs: number, transport?: MailTransport) {
	const total = { sent: 0, skipped: 0, retried: 0, dead: 0 };
	for (let round = 0; round < 40; round += 1) {
		const result = await processOutbox(db, {
			nowMs,
			batchSize: 25,
			...(transport ? { transport } : {}),
		});
		total.sent += result.sent;
		total.skipped += result.skipped;
		total.retried += result.retried;
		total.dead += result.dead;
		if (result.sent + result.skipped + result.retried + result.dead < 25) {
			break;
		}
	}
	return total;
}

export interface TickOptions {
	nowMs?: () => number;
	transport?: MailTransport;
	/** Object storage for the claim-document purge; defaults to S3 when configured, else skipped. */
	storage?: StorageDriver | null;
	/**
	 * Connection of the audit log retention (`apercura_jobs`, DATABASE_URL_JOBS); defaults to
	 * `db`, which may only run it when its role is allowed to (a superuser in development).
	 */
	auditDb?: Database;
}

/**
 * Deletes claim documents 30 days after their decision (plan §11), under its
 * own advisory lock. Skipped (null) when no object storage is configured.
 */
export async function purgeClaimDocumentsJob(
	db: Database,
	nowMs: number,
	storage: StorageDriver | null = storageConfigured() ? getStorage() : null,
) {
	if (!storage) return null;
	return withAdvisoryLock(db, "jobs:claim-documents", () =>
		purgeClaimDocuments(db, storage, new Date(nowMs)),
	);
}

/** Practices being closed whose emails are out (or past their deadline) lose their booking data. */
export function closuresJob(db: Database, nowMs: number) {
	return withAdvisoryLock(db, "jobs:closures", () => finalizeClosures(db, nowMs));
}

/** Error reports, removal and contact requests past their retention are deleted. */
export function requestsJob(db: Database, nowMs: number) {
	return withAdvisoryLock(db, "jobs:requests", () => purgeClosedRequests(db, nowMs));
}

/** Daily page-view counters older than their retention (13 months) are deleted. */
export function pageViewsJob(db: Database, nowMs: number) {
	return withAdvisoryLock(db, "jobs:page-views", () => purgePageViews(db, nowMs));
}

/**
 * The administrators' alerts of new claims and contact requests, batched (one email per queue
 * and ADMIN_ALERT_INTERVAL_MINUTES at most): sends what arrived during the last interval.
 */
export function adminAlertsJob(db: Database, nowMs: number) {
	return withAdvisoryLock(db, "jobs:admin-alerts", () => sendAdminAlerts(db, nowMs));
}

/**
 * Rate-limit counters (`directory.rate_limits`, `directory.auth_rate_limit`) whose window has
 * elapsed are deleted. Runs with the app role (DATABASE_URL), the narrowest role with DELETE on
 * them (`apercura_jobs` holds no table privilege).
 */
export function rateLimitsJob(db: Database, nowMs: number) {
	return withAdvisoryLock(db, "jobs:rate-limits", () => purgeExpiredRateLimits(db, nowMs));
}

/** Both access logs lose their rows past the retention, through `care.purge_audit_events()`. */
export function auditLogJob(db: Database) {
	return withAdvisoryLock(db, "jobs:audit-log", () => purgeAuditLogs(db));
}

/**
 * One `jobs:tick`: expirations, reminders, outbox, closed practices, next free slots, purges,
 * retention and expired rate-limit counters.
 */
export async function runTick(db: Database, options: TickOptions = {}) {
	const now = options.nowMs ?? Date.now;
	const expirations = await withAdvisoryLock(db, "jobs:expire", () => expireLapsed(db, now()));
	const reminders = await withAdvisoryLock(db, "jobs:reminders", () => enqueueReminders(db, now()));
	const outbox = await withAdvisoryLock(db, "jobs:outbox", () =>
		drainOutbox(db, now(), options.transport),
	);
	// After the outbox, so a closed practice's cancellation emails usually leave first.
	const closures = await closuresJob(db, now());
	const nextFree = await withAdvisoryLock(db, "jobs:next-free", () =>
		refreshAllNextFree(db, now()),
	);
	const purged = await withAdvisoryLock(db, "jobs:purge", () => purge(db, now()));
	const claimDocuments = await purgeClaimDocumentsJob(db, now(), options.storage);
	const requests = await requestsJob(db, now());
	const pageViews = await pageViewsJob(db, now());
	const adminAlerts = await adminAlertsJob(db, now());
	const rateLimits = await rateLimitsJob(db, now());
	const auditLog = await auditLogJob(options.auditDb ?? db);
	return {
		expirations: expirations && {
			expired: expirations.expired,
			completed: expirations.completed,
		},
		reminders,
		outbox,
		closures: closures && {
			organizations: closures.organizations,
			appointments: closures.appointments,
		},
		nextFree,
		purged,
		claimDocuments,
		requests,
		pageViews,
		adminAlerts,
		rateLimits,
		auditLog,
	};
}
