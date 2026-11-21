import {
	type AppointmentStatus,
	type LifecycleEntry,
	type LifecycleEvent,
	type LifecycleState,
	transition,
} from "@apercura/core/booking";
import { appointmentEvents, appointments } from "@apercura/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Executor, Transaction } from "~/server/db-executor";
import { BookingError } from "./errors";
import { enqueueOutbox, type OutboxEntry } from "./outbox";
import { at } from "./sql-time";

export type AppointmentRow = typeof appointments.$inferSelect;

/** The lifecycle view of a stored entry (see `@apercura/core/booking`). */
export function lifecycleEntry(row: AppointmentRow): LifecycleEntry {
	return {
		status: row.status as AppointmentStatus,
		createdAtMs: row.createdAt.getTime(),
		startsAtMs: row.startsAt.getTime(),
		endsAtMs: row.endsAt.getTime(),
		expiresAtMs: row.expiresAt?.getTime() ?? null,
		bookedAtMs: row.bookedAt?.getTime() ?? null,
		expiryReason: (row.expiryReason as LifecycleEntry["expiryReason"]) ?? null,
	};
}

export interface EventInput {
	appointmentId: string;
	organizationId: string;
	actor: string;
	event: string;
	fromStatus: string | null;
	toStatus: string | null;
	revision: number;
	data?: Record<string, unknown>;
}

export async function recordEvents(db: Executor, events: readonly EventInput[]) {
	if (events.length > 0) {
		await db.insert(appointmentEvents).values(
			events.map((event) => ({
				appointmentId: event.appointmentId,
				organizationId: event.organizationId,
				actor: event.actor,
				event: event.event,
				fromStatus: event.fromStatus,
				toStatus: event.toStatus,
				revision: event.revision,
				data: event.data ?? null,
			})),
		);
	}
}

/** Locks one appointment row for the rest of the transaction. */
export async function lockAppointment(
	tx: Transaction,
	appointmentId: string,
	organizationId?: string,
): Promise<AppointmentRow> {
	const [row] = await tx
		.select()
		.from(appointments)
		.where(
			and(
				eq(appointments.id, appointmentId),
				organizationId ? eq(appointments.organizationId, organizationId) : undefined,
			),
		)
		.for("update")
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row;
}

export interface ExpiredEntry {
	id: string;
	organizationId: string;
	fromStatus: "held" | "pending";
	revision: number;
}

/**
 * Expires the lapsed holds and requests of a practitioner that overlap `[fromMs, untilMs)`, so
 * the following insert or update is checked by the overlap constraint against live entries only
 * (a constraint's WHERE clause cannot use `now()`). Writes their events and, for requests, the
 * "request expired" email, in the caller's transaction.
 */
export async function expireStaleOverlapping(
	tx: Transaction,
	options: {
		practitionerId: number;
		fromMs: number;
		untilMs: number;
		nowMs: number;
		actor: string;
		excludeId?: string;
	},
): Promise<ExpiredEntry[]> {
	const now = new Date(options.nowMs);
	const exclude = options.excludeId ? sql`and id <> ${options.excludeId}` : sql``;
	const rows = await tx.execute<{
		id: string;
		organization_id: string;
		from_status: "held" | "pending";
		revision: number;
	}>(sql`
		with stale as (
			select id, status from care.appointments
			where practitioner_id = ${options.practitionerId}
				and status in ('held', 'pending')
				and expires_at <= ${at(now)}
				and tstzrange(occupied_from, occupied_until, '[)')
					&& tstzrange(${at(options.fromMs)}, ${at(options.untilMs)}, '[)')
				${exclude}
			for update
		)
		update care.appointments a
		set status = 'expired',
			expiry_reason = case when stale.status = 'held' then 'hold_timeout' else 'validation_deadline' end,
			revision = a.revision + 1,
			updated_at = ${at(now)}
		from stale
		where a.id = stale.id
		returning a.id, a.organization_id, stale.status as from_status, a.revision
	`);
	const expired = [...rows].map((row) => ({
		id: row.id,
		organizationId: row.organization_id,
		fromStatus: row.from_status,
		revision: row.revision,
	}));
	await recordExpiries(tx, expired, options.actor);
	return expired;
}

/** Events and emails of entries that just expired on a timeout or deadline. */
export async function recordExpiries(
	tx: Executor,
	expired: readonly ExpiredEntry[],
	actor: string,
) {
	await recordEvents(
		tx,
		expired.map((entry) => ({
			appointmentId: entry.id,
			organizationId: entry.organizationId,
			actor,
			event: "expire",
			fromStatus: entry.fromStatus,
			toStatus: "expired",
			revision: entry.revision,
			data: { reason: entry.fromStatus === "held" ? "hold_timeout" : "validation_deadline" },
		})),
	);
	await enqueueOutbox(
		tx,
		expired
			.filter((entry) => entry.fromStatus === "pending")
			.map((entry) => ({
				organizationId: entry.organizationId,
				kind: "request_expired" as const,
				appointmentId: entry.id,
				revision: entry.revision,
				expectedStatuses: ["expired"],
			})),
	);
}

/**
 * Applies a lifecycle event to a locked row: the pure `transition` decides, then the new state,
 * one `appointment_events` row and the outbox rows are written in the same transaction.
 * `revision` is bumped. Throws `TRANSITION_REFUSED` (message = the core error code) when the
 * transition is not allowed.
 */
export async function applyTransition(
	tx: Transaction,
	row: AppointmentRow,
	event: LifecycleEvent,
	options: {
		actor: string;
		set?: Partial<typeof appointments.$inferInsert>;
		outbox?: (next: { revision: number; status: AppointmentStatus }) => OutboxEntry[];
		data?: Record<string, unknown>;
	},
): Promise<{ row: AppointmentRow; next: LifecycleState }> {
	const result = transition(lifecycleEntry(row), event);
	if (!result.ok) {
		throw new BookingError("TRANSITION_REFUSED", result.error.code);
	}
	const { next } = result;
	const [updated] = await tx
		.update(appointments)
		.set({
			status: next.status,
			expiresAt: next.expiresAtMs === null ? null : new Date(next.expiresAtMs),
			bookedAt: next.bookedAtMs === null ? null : new Date(next.bookedAtMs),
			expiryReason: next.expiryReason,
			revision: row.revision + 1,
			updatedAt: new Date(event.nowMs),
			...options.set,
		})
		.where(eq(appointments.id, row.id))
		.returning();
	if (!updated) {
		throw new BookingError("NOT_FOUND");
	}
	await recordEvents(tx, [
		{
			appointmentId: row.id,
			organizationId: row.organizationId,
			actor: options.actor,
			event: event.type,
			fromStatus: row.status,
			toStatus: next.status,
			revision: updated.revision,
			...(options.data ? { data: options.data } : {}),
		},
	]);
	if (options.outbox) {
		await enqueueOutbox(
			tx,
			options.outbox({ revision: updated.revision, status: next.status as AppointmentStatus }),
		);
	}
	return { row: updated, next };
}
