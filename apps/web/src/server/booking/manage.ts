import {
	appointmentEnd,
	effectiveStatus,
	occupancy,
	PENDING_LEAD_MS,
	transition,
} from "@apercura/core/booking";
import { appointments, calendars, practitioners, sites } from "@apercura/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hashOpaqueToken, readAppointmentPatients } from "~/server/phi";
import {
	availableSlots,
	findCalendar,
	findType,
	isOnGrid,
	nearestAlternatives,
	toCoreType,
} from "./availability";
import { BOOKING_LIMITS, bookingEnabled } from "./config";
import { ensureBookingConstraints } from "./constraints";
import { BookingError, isExclusionViolation } from "./errors";
import { practitionerTransaction } from "./locks";
import { refreshNextFreeLater } from "./next-free";
import { enqueueOutbox } from "./outbox";
import { drainLater } from "./outbox-worker";
import { type BookingRuntime, limit } from "./runtime";
import {
	type AppointmentRow,
	applyTransition,
	expireStaleOverlapping,
	lifecycleEntry,
	lockAppointment,
	recordEvents,
} from "./transitions";

const DAY_MS = 86_400_000;

/*
 * The patient's manage page (`/rdv#t=…`). Every procedure takes the token in a
 * POST body: mail scanners open links on their own, so nothing a GET reaches
 * may change an appointment.
 */

async function byToken(rt: BookingRuntime, token: string): Promise<AppointmentRow> {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await limit(rt, rt.clientKey("booking-manage"), BOOKING_LIMITS.managePerIp);
	const [row] = await rt.db
		.select()
		.from(appointments)
		.where(
			and(
				eq(appointments.manageTokenHash, hashOpaqueToken(token)),
				eq(appointments.kind, "appointment"),
				isNull(appointments.purgedAt),
			),
		)
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row;
}

async function cancellationCutoff(rt: BookingRuntime, row: AppointmentRow) {
	const calendar = await findCalendar(rt.db, row.calendarId);
	return { calendar, cutoffMin: calendar.cancellationCutoffMin };
}

/** `manage.get`: what the patient sees. Reading their own name is audited like any decryption. */
export async function getManaged(rt: BookingRuntime, token: string) {
	const row = await byToken(rt, token);
	const nowMs = rt.nowMs();
	const [place] = await rt.db
		.select({
			timeZone: calendars.timeZone,
			calendarStatus: calendars.status,
			titleCode: practitioners.titleCode,
			firstName: practitioners.firstName,
			lastName: practitioners.lastName,
			slug: practitioners.slug,
			siteName: sites.name,
			addressLine: sites.addressLine,
			postcode: sites.postcode,
			communeLabel: sites.communeLabel,
		})
		.from(calendars)
		.innerJoin(practitioners, eq(practitioners.id, calendars.practitionerId))
		.innerJoin(sites, eq(sites.id, calendars.siteId))
		.where(eq(calendars.id, row.calendarId))
		.limit(1);
	const patient = (
		await readAppointmentPatients(
			rt.db,
			{
				organizationId: row.organizationId,
				actor: "patient",
				purpose: "manage",
				requestId: rt.requestId,
				ipHash: rt.ipHash,
			},
			[row.id],
			["firstName", "lastName"],
		)
	).get(row.id);
	const { cutoffMin } = await cancellationCutoff(rt, row);
	const canCancel = transition(lifecycleEntry(row), {
		type: "cancel_by_patient",
		nowMs,
		cancellationCutoffMin: cutoffMin,
	}).ok;
	return {
		appointmentId: row.id,
		status: effectiveStatus(lifecycleEntry(row), nowMs),
		startsAt: row.startsAt,
		endsAt: row.endsAt,
		timeZone: place?.timeZone ?? "Europe/Paris",
		typeName: row.typeName,
		calendarId: row.calendarId,
		typeId: row.appointmentTypeId,
		pendingUntil: row.status === "pending" ? row.expiresAt : null,
		practitioner: place
			? {
					titleCode: place.titleCode,
					firstName: place.firstName,
					lastName: place.lastName,
					slug: place.slug,
				}
			: null,
		site: place
			? {
					name: place.siteName,
					addressLine: place.addressLine,
					postcode: place.postcode,
					communeLabel: place.communeLabel,
				}
			: null,
		patient: { firstName: patient?.firstName ?? null, lastName: patient?.lastName ?? null },
		/** An address typed by the practice that the patient has not confirmed yet. */
		needsConfirmation: row.source === "practice" && row.emailVerifiedAt === null,
		canCancel,
		canReschedule: canCancel && row.appointmentTypeId !== null && place?.calendarStatus === "open",
	};
}

/**
 * `manage.confirm`: the patient confirms an address the practice typed (the first email to it
 * was neutral). Until then, no reminder or detailed email goes to that address.
 */
export async function confirmManagedEmail(rt: BookingRuntime, token: string) {
	const row = await byToken(rt, token);
	const nowMs = rt.nowMs();
	if (row.emailVerifiedAt) {
		return { confirmed: true };
	}
	await practitionerTransaction(rt.db, row.practitionerId, async (tx) => {
		const locked = await lockAppointment(tx, row.id);
		if (locked.emailVerifiedAt) {
			return;
		}
		await tx
			.update(appointments)
			.set({ emailVerifiedAt: new Date(nowMs) })
			.where(eq(appointments.id, locked.id));
		await recordEvents(tx, [
			{
				appointmentId: locked.id,
				organizationId: locked.organizationId,
				actor: "patient",
				event: "confirm_email",
				fromStatus: locked.status,
				toStatus: locked.status,
				revision: locked.revision,
			},
		]);
	});
	return { confirmed: true };
}

/** `manage.cancel`: `pending` at any time; `confirmed` before the cutoff or within 10 minutes. */
export async function cancelManaged(rt: BookingRuntime, token: string) {
	const found = await byToken(rt, token);
	const nowMs = rt.nowMs();
	const { cutoffMin } = await cancellationCutoff(rt, found);
	const ids = await practitionerTransaction(rt.db, found.practitionerId, async (tx) => {
		const row = await lockAppointment(tx, found.id);
		const notify = row.emailVerifiedAt !== null;
		const { row: updated } = await applyTransition(
			tx,
			row,
			{ type: "cancel_by_patient", nowMs, cancellationCutoffMin: cutoffMin },
			{ actor: "patient" },
		);
		return enqueueOutbox(tx, [
			...(notify
				? [
						{
							organizationId: updated.organizationId,
							kind: "booking_cancelled_by_patient" as const,
							appointmentId: updated.id,
							revision: updated.revision,
							expectedStatuses: ["cancelled_by_patient"],
						},
					]
				: []),
			{
				organizationId: updated.organizationId,
				kind: "practice_cancelled",
				appointmentId: updated.id,
				revision: updated.revision,
				expectedStatuses: ["cancelled_by_patient"],
			},
		]);
	});
	drainLater(rt, ids);
	refreshNextFreeLater(rt, found.practitionerId);
	return { status: "cancelled_by_patient" as const };
}

/** `manage.slots`: free starts of the same type, the patient's own appointment not counted. */
export async function managedSlots(
	rt: BookingRuntime,
	input: { token: string; fromDate: string; days: number },
) {
	const row = await byToken(rt, input.token);
	if (!row.appointmentTypeId) {
		throw new BookingError("NOT_FOUND");
	}
	const calendar = await findCalendar(rt.db, row.calendarId, { openOnly: true });
	const type = await findType(rt.db, calendar.id, row.appointmentTypeId);
	const slots = await availableSlots(
		rt.db,
		calendar,
		type,
		{ fromDate: input.fromDate, days: input.days },
		rt.nowMs(),
		{ excludeAppointmentId: row.id },
	);
	return { timeZone: calendar.timeZone, slots: slots.map((ms) => new Date(ms)) };
}

export type RescheduleResult =
	| { status: "rescheduled"; startsAt: Date; revision: number }
	| { status: "slot_taken"; alternatives: Date[] };

/**
 * `manage.reschedule`: moves the appointment in place (`revision + 1`), allowed while the patient
 * could still cancel. The overlap constraint checks the new range against everyone else.
 */
export async function rescheduleManaged(
	rt: BookingRuntime,
	input: { token: string; startsAt: Date },
): Promise<RescheduleResult> {
	await ensureBookingConstraints(rt.db.$client);
	const found = await byToken(rt, input.token);
	const nowMs = rt.nowMs();
	if (!found.appointmentTypeId) {
		throw new BookingError("NOT_FOUND");
	}
	const calendar = await findCalendar(rt.db, found.calendarId, { openOnly: true });
	const type = await findType(rt.db, calendar.id, found.appointmentTypeId);
	const startMs = input.startsAt.getTime();
	if (!(await isOnGrid(rt.db, calendar, type, startMs, nowMs))) {
		throw new BookingError("INVALID_SLOT");
	}
	const occupied = occupancy(toCoreType(type), startMs);
	const endMs = appointmentEnd(toCoreType(type), startMs);
	try {
		const result = await practitionerTransaction(rt.db, found.practitionerId, async (tx) => {
			const row = await lockAppointment(tx, found.id);
			const allowed = transition(lifecycleEntry(row), {
				type: "cancel_by_patient",
				nowMs,
				cancellationCutoffMin: calendar.cancellationCutoffMin,
			});
			if (!allowed.ok) {
				throw new BookingError("TRANSITION_REFUSED", allowed.error.code);
			}
			let expiresAt = row.expiresAt;
			if (row.status === "pending") {
				const latest = startMs - PENDING_LEAD_MS;
				expiresAt = new Date(Math.min(row.expiresAt?.getTime() ?? latest, latest));
				if (expiresAt.getTime() <= nowMs) {
					throw new BookingError("TRANSITION_REFUSED", "VALIDATION_WINDOW_CLOSED");
				}
			}
			await expireStaleOverlapping(tx, {
				practitionerId: row.practitionerId,
				fromMs: occupied.fromMs,
				untilMs: occupied.untilMs,
				nowMs,
				actor: "patient",
				excludeId: row.id,
			});
			const [updated] = await tx
				.update(appointments)
				.set({
					startsAt: new Date(startMs),
					endsAt: new Date(endMs),
					occupiedFrom: new Date(occupied.fromMs),
					occupiedUntil: new Date(occupied.untilMs),
					typeName: type.name,
					expiresAt,
					revision: row.revision + 1,
					reminderSentAt: null,
					purgeAfter: new Date(endMs + calendar.retentionDays * DAY_MS),
					updatedAt: new Date(nowMs),
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
					actor: "patient",
					event: "reschedule",
					fromStatus: row.status,
					toStatus: updated.status,
					revision: updated.revision,
					data: { from: row.startsAt.toISOString(), to: updated.startsAt.toISOString() },
				},
			]);
			const ids = await enqueueOutbox(tx, [
				{
					organizationId: updated.organizationId,
					kind: "booking_rescheduled",
					appointmentId: updated.id,
					revision: updated.revision,
					expectedStatuses: [updated.status],
				},
				{
					organizationId: updated.organizationId,
					kind: "practice_rescheduled",
					appointmentId: updated.id,
					revision: updated.revision,
					expectedStatuses: [updated.status],
				},
			]);
			return { updated, ids };
		});
		drainLater(rt, result.ids);
		refreshNextFreeLater(rt, found.practitionerId);
		return {
			status: "rescheduled",
			startsAt: result.updated.startsAt,
			revision: result.updated.revision,
		};
	} catch (error) {
		if (isExclusionViolation(error)) {
			const alternatives = await nearestAlternatives(
				rt.db,
				calendar,
				type,
				startMs,
				nowMs,
				BOOKING_LIMITS.alternatives,
				found.id,
			);
			return { status: "slot_taken", alternatives: alternatives.map((ms) => new Date(ms)) };
		}
		throw error;
	}
}
