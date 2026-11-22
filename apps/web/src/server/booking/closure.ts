import { transition } from "@apercura/core/booking";
import type { Database } from "@apercura/db";
import {
	appointments,
	calendars,
	invitation,
	member,
	organizationClosures,
	practitioners,
} from "@apercura/db/schema";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { recordAudit } from "~/server/audit";
import type { Transaction } from "~/server/db-executor";
import { deleteOrganizationKeys, writeAudit } from "~/server/phi";
import { revokeOrganizationFeeds } from "./feeds";
import { practitionerLockKey } from "./locks";
import { at } from "./sql-time";
import { applyTransition, lifecycleEntry, recordEvents } from "./transitions";

/*
 * Closing a practice that holds booking data (its owner deletes their account and closes it).
 *
 * 1. At once, in the caller's transaction (`closeOrganization`): the calendars stop taking
 *    bookings and their feeds are revoked; live holds expire; every upcoming appointment and
 *    request is cancelled by the practice, its patient told by email under the rule of
 *    `agenda.cancel` (only to an address the patient proved); the team loses access (memberships
 *    and invitations deleted).
 * 2. Then (`finalizeClosures`, by `jobs:tick` and right after the account deletion): once no
 *    email of the practice is waiting in the outbox, or at the latest `CLOSURE_PURGE_DEADLINE_MS`
 *    after the closure, every booking row is deleted (appointments and their patient data,
 *    events, codes, outbox, calendars and their settings), then the practice's data keys, then
 *    the organization. The purge is written to `care.audit_events`, whose rows (like those of
 *    `platform_audit_events`) carry no foreign key and stay until their own retention.
 */

const HOUR_MS = 3_600_000;

/**
 * Booking data of a closed practice is erased at the latest this long after the closure, even
 * if a cancellation email is still being retried (the outbox gives up after about 5.5 hours).
 */
export const CLOSURE_PURGE_DEADLINE_MS = 24 * HOUR_MS;

/** Takes the advisory lock of every practitioner with a calendar in the practice, in id order. */
async function lockPractitioners(tx: Transaction, organizationId: string) {
	const rows = await tx.execute<{ practitioner_id: number }>(sql`
		select distinct practitioner_id from care.calendars
		where organization_id = ${organizationId}
		order by practitioner_id
	`);
	for (const row of rows) {
		await tx.execute(
			sql`select pg_advisory_xact_lock(${practitionerLockKey(row.practitioner_id)})`,
		);
	}
	return [...rows].map((row) => row.practitioner_id);
}

/**
 * Closes a practice in the caller's transaction (see the steps above). Idempotent. `actor` is
 * `user:<id>` of the person closing it.
 */
export async function closeOrganization(
	tx: Transaction,
	input: { organizationId: string; actor: string; nowMs: number },
) {
	const { organizationId, actor, nowMs } = input;
	const now = new Date(nowMs);
	await tx
		.insert(organizationClosures)
		.values({
			organizationId,
			requestedBy: actor,
			requestedAt: now,
			purgeBy: new Date(nowMs + CLOSURE_PURGE_DEADLINE_MS),
		})
		.onConflictDoNothing();
	await lockPractitioners(tx, organizationId);

	await tx
		.update(calendars)
		.set({ status: "paused", updatedAt: now })
		.where(and(eq(calendars.organizationId, organizationId), eq(calendars.status, "open")));
	const feeds = await revokeOrganizationFeeds(tx, organizationId);

	// A patient in the middle of booking cannot finish (an `overridden` hold is never revived).
	const holds = await tx.execute<{ id: string; revision: number }>(sql`
		update care.appointments
		set status = 'expired', expiry_reason = 'overridden', revision = revision + 1,
			updated_at = ${at(now)}
		where organization_id = ${organizationId} and status = 'held'
		returning id, revision
	`);
	await recordEvents(
		tx,
		[...holds].map((row) => ({
			appointmentId: row.id,
			organizationId,
			actor,
			event: "expire",
			fromStatus: "held",
			toStatus: "expired",
			revision: row.revision,
			data: { reason: "overridden" },
		})),
	);

	const upcoming = await tx
		.select()
		.from(appointments)
		.where(
			and(
				eq(appointments.organizationId, organizationId),
				eq(appointments.kind, "appointment"),
				inArray(appointments.status, ["pending", "confirmed"]),
				gt(appointments.startsAt, now),
			),
		)
		.for("update");
	let cancelled = 0;
	let notified = 0;
	for (const row of upcoming) {
		const event = { type: "cancel_by_practice", nowMs } as const;
		// A request past its validation deadline is not cancelled: the sweep expires it.
		if (!transition(lifecycleEntry(row), event).ok) continue;
		const notify = row.emailVerifiedAt !== null;
		await applyTransition(tx, row, event, {
			actor,
			data: { reason: "practice_closed" },
			outbox: (next) =>
				notify
					? [
							{
								organizationId,
								kind: "booking_cancelled_by_practice",
								appointmentId: row.id,
								revision: next.revision,
								expectedStatuses: ["cancelled_by_practice"],
							},
						]
					: [],
		});
		cancelled += 1;
		if (notify) notified += 1;
	}

	await tx.delete(invitation).where(eq(invitation.organizationId, organizationId));
	await tx.delete(member).where(eq(member.organizationId, organizationId));
	return { cancelled, notified, feeds };
}

/**
 * Deletes the booking data, the data keys and the organization of one closed practice, in one
 * transaction under the practitioners' locks. Returns null when it is no longer closing.
 */
async function finalizeClosure(db: Database, organizationId: string) {
	return db.transaction(async (tx) => {
		const practitionerIds = await lockPractitioners(tx, organizationId);
		const [closure] = await tx.execute<{ organization_id: string }>(sql`
			select organization_id from care.organization_closures
			where organization_id = ${organizationId}
			for update
		`);
		if (!closure) return null;

		const rows = await tx.execute<{ id: string }>(sql`
			select id from care.appointments
			where organization_id = ${organizationId} and kind = 'appointment' and purged_at is null
			order by id
		`);
		if (rows.length > 0) {
			await writeAudit(
				tx,
				{ organizationId, actor: "system:closure", purpose: "closure" },
				{
					action: "purge",
					subjectTable: "appointments",
					subjectIds: [...rows].map((row) => row.id),
				},
			);
		}
		const scoped = (table: string) =>
			tx.execute(
				sql`delete from ${sql.raw(`care.${table}`)} where organization_id = ${organizationId}`,
			);
		// Children first: no foreign key is left pointing at what is deleted next.
		await scoped("outbox");
		await scoped("otp_challenges");
		await scoped("appointment_events");
		const deleted = await scoped("appointments");
		await scoped("availability_exceptions");
		await scoped("availability_rules");
		await scoped("appointment_types");
		await scoped("calendars");
		// Only once nothing encrypted with them is left.
		await deleteOrganizationKeys(tx, organizationId);
		await tx
			.update(practitioners)
			.set({ ownerOrgId: null, claimStatus: "unclaimed" })
			.where(eq(practitioners.ownerOrgId, organizationId));
		await recordAudit(tx, {
			actor: "system:closure",
			action: "organization.purge",
			subjectType: "organization",
			subjectId: organizationId,
		});
		// Memberships, invitations and the closure row cascade.
		await tx.execute(sql`delete from directory.organization where id = ${organizationId}`);
		return { appointments: deleted.count ?? 0, practitionerIds };
	});
}

/**
 * Finalizes the closed practices whose cancellation emails are out (no `pending` or `sending`
 * outbox row) or whose deadline passed; only the given ones when `organizationIds` is set.
 */
export async function finalizeClosures(
	db: Database,
	nowMs: number,
	organizationIds?: readonly string[],
) {
	if (organizationIds && organizationIds.length === 0) {
		return { organizations: 0, appointments: 0, practitionerIds: [] as number[] };
	}
	const only = organizationIds
		? sql`and c.organization_id in (${sql.join(
				organizationIds.map((id) => sql`${id}`),
				sql`, `,
			)})`
		: sql``;
	const due = await db.execute<{ organization_id: string }>(sql`
		select c.organization_id from care.organization_closures c
		where (c.purge_by <= ${at(nowMs)} or not exists (
			select 1 from care.outbox o
			where o.organization_id = c.organization_id and o.status in ('pending', 'sending')
		)) ${only}
		order by c.requested_at
		limit 50
	`);
	let organizations = 0;
	let purged = 0;
	const touched = new Set<number>();
	for (const row of due) {
		const result = await finalizeClosure(db, row.organization_id);
		if (!result) continue;
		organizations += 1;
		purged += result.appointments;
		for (const id of result.practitionerIds) touched.add(id);
	}
	return { organizations, appointments: purged, practitionerIds: [...touched] };
}
