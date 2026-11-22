import { randomUUID } from "node:crypto";
import {
	type AppointmentStatus,
	appointmentEnd,
	createPracticeEntry,
	effectiveStatus,
	occupancy,
} from "@apercura/core/booking";
import {
	appointments,
	appointmentTypes,
	availabilityRules,
	calendars,
	places,
	sites,
} from "@apercura/db/schema";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { Locale } from "~/i18n/locales";
import type { Transaction } from "~/server/db-executor";
import {
	ensureOrganizationKey,
	hashOpaqueToken,
	manageTokenFor,
	newManageNonce,
	normalizePatientEmail,
	normalizePatientPhone,
	patientIndexes,
	readAppointmentPatients,
	sealAppointment,
} from "~/server/phi";
import { siteAddressLine } from "~/server/queries/site-address";
import { findCalendar, findType, toCoreType } from "./availability";
import { BOOKING_LIMITS } from "./config";
import { ensureBookingConstraints } from "./constraints";
import { BookingError, isExclusionViolation, isUniqueViolation } from "./errors";
import { practitionerTransaction } from "./locks";
import { refreshNextFreeLater } from "./next-free";
import { enqueueOutbox, type OutboxEntry } from "./outbox";
import { drainLater } from "./outbox-worker";
import { type BookingRuntime, limit } from "./runtime";
import { at } from "./sql-time";
import {
	type AppointmentRow,
	applyTransition,
	expireStaleOverlapping,
	lifecycleEntry,
	lockAppointment,
	recordEvents,
} from "./transitions";

const DAY_MS = 86_400_000;

/** The signed-in staff member, organization read from the database by `memberProcedure`. */
export interface StaffContext {
	organizationId: string;
	userId: string;
}

const actorOf = (staff: StaffContext) => `user:${staff.userId}`;

/**
 * Staff may override a patient's temporary hold, never a `pending` or `confirmed` entry: live
 * holds overlapping the range are expired (`overridden`) before the insert, and the overlap
 * constraint still refuses anything else.
 */
async function overrideHolds(
	tx: Transaction,
	staff: StaffContext,
	practitionerId: number,
	fromMs: number,
	untilMs: number,
	nowMs: number,
) {
	await expireStaleOverlapping(tx, {
		practitionerId,
		fromMs,
		untilMs,
		nowMs,
		actor: actorOf(staff),
	});
	const rows = await tx.execute<{ id: string; organization_id: string; revision: number }>(sql`
		with victims as (
			select id from care.appointments
			where practitioner_id = ${practitionerId} and status = 'held'
				and tstzrange(occupied_from, occupied_until, '[)')
					&& tstzrange(${at(fromMs)}, ${at(untilMs)}, '[)')
			for update
		)
		update care.appointments a
		set status = 'expired', expiry_reason = 'overridden', revision = a.revision + 1,
			updated_at = ${at(nowMs)}
		from victims where a.id = victims.id
		returning a.id, a.organization_id, a.revision
	`);
	await recordEvents(
		tx,
		[...rows].map((row) => ({
			appointmentId: row.id,
			organizationId: row.organization_id,
			actor: actorOf(staff),
			event: "expire",
			fromStatus: "held",
			toStatus: "expired",
			revision: row.revision,
			data: { reason: "overridden" },
		})),
	);
}

/** `agenda.list`: entries of the organization in a range, patient data decrypted (and audited). */
export async function listAgenda(
	rt: BookingRuntime,
	staff: StaffContext,
	input: {
		calendarId?: string | undefined;
		from: Date;
		to: Date;
		/** Only entries stored with these statuses (e.g. the requests waiting for an answer). */
		statuses?: readonly AppointmentStatus[] | undefined;
	},
) {
	const span = input.to.getTime() - input.from.getTime();
	if (span <= 0 || span > BOOKING_LIMITS.agendaMaxDays * DAY_MS) {
		throw new BookingError("INVALID_INPUT");
	}
	// Per person, not per IP: a hospital ward shares one address.
	await limit(rt, `agenda-list:${staff.userId}`, BOOKING_LIMITS.agendaListsPerUser);
	if (input.calendarId) {
		await findCalendar(rt.db, input.calendarId, { organizationId: staff.organizationId });
	}
	const rows = await rt.db
		.select()
		.from(appointments)
		.where(
			and(
				eq(appointments.organizationId, staff.organizationId),
				input.calendarId ? eq(appointments.calendarId, input.calendarId) : undefined,
				gte(appointments.startsAt, input.from),
				lt(appointments.startsAt, input.to),
				ne(appointments.status, "expired"),
				input.statuses?.length ? inArray(appointments.status, [...input.statuses]) : undefined,
			),
		)
		.orderBy(asc(appointments.startsAt));
	const nowMs = rt.nowMs();
	// A live hold is someone still typing their details: nothing to read yet.
	const withPatient = rows.filter(
		(row) => row.kind === "appointment" && row.purgedAt === null && row.status !== "held",
	);
	const patients = await readAppointmentPatients(
		rt.db,
		{
			organizationId: staff.organizationId,
			actor: actorOf(staff),
			userId: staff.userId,
			purpose: "agenda_list",
			requestId: rt.requestId,
			ipHash: rt.ipHash,
		},
		withPatient.map((row) => row.id),
		["firstName", "lastName", "email", "phone"],
	);
	return rows
		.map((row) => ({ row, status: effectiveStatus(lifecycleEntry(row), nowMs) }))
		.filter(({ status }) => status !== "expired")
		.map(({ row, status }) => {
			const patient = patients.get(row.id);
			return {
				id: row.id,
				calendarId: row.calendarId,
				kind: row.kind as "appointment" | "block",
				status,
				source: row.source,
				typeName: row.typeName,
				startsAt: row.startsAt,
				endsAt: row.endsAt,
				expiresAt: row.expiresAt,
				revision: row.revision,
				patient: patient
					? {
							firstName: patient.firstName,
							lastName: patient.lastName,
							email: patient.email,
							phone: patient.phone,
							isNew: row.patientIsNew,
							emailConfirmed: row.emailVerifiedAt !== null,
						}
					: null,
				/** Emails could not be delivered: call the patient. */
				unreachable: row.patientUnreachableAt !== null,
			};
		});
}

export interface CreateEntryInput {
	calendarId: string;
	typeId: string;
	startsAt: Date;
	patient: { firstName: string; lastName: string; email?: string | null; phone?: string | null };
	locale: Locale;
	idempotencyKey?: string | null;
}

export type StaffWriteResult =
	| { status: "created"; appointmentId: string }
	| { status: "slot_taken" };

/**
 * `agenda.create`: an appointment taken by phone, confirmed at once. It ignores availability
 * rules, never the overlap constraint. An email address typed by the practice first gets a
 * neutral message with a confirmation link (a typo would otherwise send health data to a
 * stranger).
 */
export async function createEntry(
	rt: BookingRuntime,
	staff: StaffContext,
	input: CreateEntryInput,
): Promise<StaffWriteResult> {
	await ensureBookingConstraints(rt.db.$client);
	const calendar = await findCalendar(rt.db, input.calendarId, {
		organizationId: staff.organizationId,
	});
	const type = await findType(rt.db, calendar.id, input.typeId, true);
	const firstName = input.patient.firstName.trim();
	const lastName = input.patient.lastName.trim();
	const email = input.patient.email?.trim() ? normalizePatientEmail(input.patient.email) : null;
	const phone = input.patient.phone?.trim() ? normalizePatientPhone(input.patient.phone) : null;
	if (
		!firstName ||
		!lastName ||
		(input.patient.email?.trim() && !email) ||
		(input.patient.phone?.trim() && !phone)
	) {
		throw new BookingError("INVALID_INPUT");
	}
	const nowMs = rt.nowMs();
	const startMs = input.startsAt.getTime();
	const occupied = occupancy(toCoreType(type), startMs);
	const endMs = appointmentEnd(toCoreType(type), startMs);
	const state = createPracticeEntry(nowMs);
	const id = randomUUID();
	const nonce = newManageNonce();
	const { emailBidx, phoneBidx } = patientIndexes(staff.organizationId, { email, phone });

	try {
		await ensureOrganizationKey(rt.db, staff.organizationId);
		const ids = await practitionerTransaction(rt.db, calendar.practitionerId, async (tx) => {
			await overrideHolds(
				tx,
				staff,
				calendar.practitionerId,
				occupied.fromMs,
				occupied.untilMs,
				nowMs,
			);
			const sealed = await sealAppointment(tx, staff.organizationId, id, {
				firstName,
				lastName,
				email,
				phone,
			});
			await tx.insert(appointments).values({
				id,
				organizationId: staff.organizationId,
				calendarId: calendar.id,
				practitionerId: calendar.practitionerId,
				appointmentTypeId: type.id,
				kind: "appointment",
				typeName: type.name,
				startsAt: new Date(startMs),
				endsAt: new Date(endMs),
				occupiedFrom: new Date(occupied.fromMs),
				occupiedUntil: new Date(occupied.untilMs),
				status: state.status,
				bookedAt: new Date(nowMs),
				revision: 1,
				idempotencyKey: input.idempotencyKey ?? null,
				source: "practice",
				createdByUserId: staff.userId,
				...sealed,
				emailBidx,
				phoneBidx,
				patientLocale: input.locale,
				manageTokenHash: hashOpaqueToken(manageTokenFor(id, nonce)),
				manageTokenNonce: nonce,
				purgeAfter: new Date(endMs + calendar.retentionDays * DAY_MS),
				createdAt: new Date(nowMs),
				updatedAt: new Date(nowMs),
			});
			await recordEvents(tx, [
				{
					appointmentId: id,
					organizationId: staff.organizationId,
					actor: actorOf(staff),
					event: "create",
					fromStatus: null,
					toStatus: state.status,
					revision: 1,
				},
			]);
			return email
				? enqueueOutbox(tx, [
						{
							organizationId: staff.organizationId,
							kind: "practice_entry",
							appointmentId: id,
							revision: null,
							expectedStatuses: ["confirmed"],
							dedupeKey: `practice_entry:${id}`,
						},
					])
				: [];
		});
		drainLater(rt, ids);
		refreshNextFreeLater(rt, calendar.practitionerId);
		return { status: "created", appointmentId: id };
	} catch (error) {
		if (isExclusionViolation(error)) {
			return { status: "slot_taken" };
		}
		if (isUniqueViolation(error, "appointments_idempotency_key_uq")) {
			throw new BookingError("IDEMPOTENCY_CONFLICT");
		}
		throw error;
	}
}

/** `agenda.block`: a one-off block (meeting, absence), protected by the same constraint. */
export async function blockTime(
	rt: BookingRuntime,
	staff: StaffContext,
	input: { calendarId: string; startsAt: Date; endsAt: Date },
): Promise<StaffWriteResult> {
	await ensureBookingConstraints(rt.db.$client);
	const calendar = await findCalendar(rt.db, input.calendarId, {
		organizationId: staff.organizationId,
	});
	const fromMs = input.startsAt.getTime();
	const untilMs = input.endsAt.getTime();
	if (!(untilMs > fromMs) || untilMs - fromMs > 31 * DAY_MS) {
		throw new BookingError("INVALID_INPUT");
	}
	const nowMs = rt.nowMs();
	const id = randomUUID();
	try {
		await practitionerTransaction(rt.db, calendar.practitionerId, async (tx) => {
			await overrideHolds(tx, staff, calendar.practitionerId, fromMs, untilMs, nowMs);
			await tx.insert(appointments).values({
				id,
				organizationId: staff.organizationId,
				calendarId: calendar.id,
				practitionerId: calendar.practitionerId,
				kind: "block",
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				occupiedFrom: input.startsAt,
				occupiedUntil: input.endsAt,
				status: "confirmed",
				bookedAt: new Date(nowMs),
				source: "practice",
				createdByUserId: staff.userId,
				createdAt: new Date(nowMs),
				updatedAt: new Date(nowMs),
			});
			await recordEvents(tx, [
				{
					appointmentId: id,
					organizationId: staff.organizationId,
					actor: actorOf(staff),
					event: "block",
					fromStatus: null,
					toStatus: "confirmed",
					revision: 1,
				},
			]);
		});
	} catch (error) {
		if (isExclusionViolation(error)) {
			return { status: "slot_taken" };
		}
		throw error;
	}
	refreshNextFreeLater(rt, calendar.practitionerId);
	return { status: "created", appointmentId: id };
}

/** Whether detailed emails may go to the patient's address (proved, or typed by the patient). */
const mayEmailPatient = (row: AppointmentRow) => row.emailVerifiedAt !== null;

/** `agenda.cancel`: cancels an appointment or a block, optionally with a message to the patient. */
export async function cancelEntry(
	rt: BookingRuntime,
	staff: StaffContext,
	input: { appointmentId: string; message?: string | null },
) {
	const nowMs = rt.nowMs();
	if (input.message?.trim()) {
		await ensureOrganizationKey(rt.db, staff.organizationId);
	}
	const practitionerId = await practitionerOf(rt, input.appointmentId, staff.organizationId);
	const result = await practitionerTransaction(rt.db, practitionerId, async (tx) => {
		const row = await lockAppointment(tx, input.appointmentId, staff.organizationId);
		const message = input.message?.trim() ? input.message.trim() : null;
		const sealed =
			message && row.kind === "appointment"
				? await sealAppointment(tx, staff.organizationId, row.id, { practiceMessage: message })
				: {};
		const outbox = (next: { revision: number }): OutboxEntry[] =>
			row.kind === "appointment" && mayEmailPatient(row)
				? [
						{
							organizationId: row.organizationId,
							kind: "booking_cancelled_by_practice",
							appointmentId: row.id,
							revision: next.revision,
							expectedStatuses: ["cancelled_by_practice"],
						},
					]
				: [];
		await applyTransition(
			tx,
			row,
			{ type: "cancel_by_practice", nowMs },
			{ actor: actorOf(staff), set: sealed, outbox: (next) => outbox(next) },
		);
		return row;
	});
	drainLater(rt, await pendingOutboxOf(rt, result.id));
	refreshNextFreeLater(rt, result.practitionerId);
	return { status: "cancelled_by_practice" as const };
}

/** `agenda.decide`: accepts or declines a pending request. */
export async function decideRequest(
	rt: BookingRuntime,
	staff: StaffContext,
	input: { appointmentId: string; decision: "approve" | "decline" },
) {
	const nowMs = rt.nowMs();
	const practitionerId = await practitionerOf(rt, input.appointmentId, staff.organizationId);
	const row = await practitionerTransaction(rt.db, practitionerId, async (tx) => {
		const locked = await lockAppointment(tx, input.appointmentId, staff.organizationId);
		const approve = input.decision === "approve";
		const { row: updated } = await applyTransition(
			tx,
			locked,
			{ type: approve ? "confirm" : "decline", nowMs },
			{
				actor: actorOf(staff),
				outbox: (next) => [
					{
						organizationId: locked.organizationId,
						kind: approve ? "booking_accepted" : "booking_declined",
						appointmentId: locked.id,
						revision: next.revision,
						expectedStatuses: [next.status],
					},
				],
			},
		);
		return updated;
	});
	drainLater(rt, await pendingOutboxOf(rt, row.id));
	refreshNextFreeLater(rt, row.practitionerId);
	return { status: row.status };
}

/** `agenda.noShow`: the patient did not come (after the start only). */
export async function markNoShow(
	rt: BookingRuntime,
	staff: StaffContext,
	input: { appointmentId: string },
) {
	const nowMs = rt.nowMs();
	const practitionerId = await practitionerOf(rt, input.appointmentId, staff.organizationId);
	await practitionerTransaction(rt.db, practitionerId, async (tx) => {
		const row = await lockAppointment(tx, input.appointmentId, staff.organizationId);
		await applyTransition(tx, row, { type: "mark_no_show", nowMs }, { actor: actorOf(staff) });
	});
	return { status: "no_show" as const };
}

/** The practitioner of an organization's entry (it never changes), to lock their agenda. */
async function practitionerOf(
	rt: BookingRuntime,
	appointmentId: string,
	organizationId: string,
): Promise<number> {
	const [row] = await rt.db
		.select({ practitionerId: appointments.practitionerId })
		.from(appointments)
		.where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)))
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row.practitionerId;
}

async function pendingOutboxOf(rt: BookingRuntime, appointmentId: string): Promise<string[]> {
	const rows = await rt.db.execute<{ id: string }>(
		sql`select id from care.outbox where appointment_id = ${appointmentId} and status = 'pending'`,
	);
	return [...rows].map((row) => row.id);
}

/**
 * `agenda.calendars`: what every member with agenda access needs to draw the agenda (assistants
 * included): calendars with their site, time zone, appointment types and weekly opening windows.
 * No patient data.
 */
export async function listAgendaCalendars(rt: BookingRuntime, staff: StaffContext) {
	const rows = await rt.db
		.select({
			id: calendars.id,
			practitionerId: calendars.practitionerId,
			siteId: calendars.siteId,
			timeZone: calendars.timeZone,
			status: calendars.status,
			stepMin: calendars.stepMin,
			manualValidation: calendars.manualValidation,
			siteName: sql<string | null>`coalesce(${sites.name}, ${sites.finessName})`,
			addressLine: siteAddressLine,
			postcode: sites.postcode,
			placeName: places.name,
		})
		.from(calendars)
		.innerJoin(sites, eq(sites.id, calendars.siteId))
		.leftJoin(places, eq(places.id, sites.placeId))
		.where(eq(calendars.organizationId, staff.organizationId))
		.orderBy(asc(calendars.createdAt));
	if (rows.length === 0) {
		return [];
	}
	const ids = rows.map((row) => row.id);
	const [types, rules] = await Promise.all([
		rt.db
			.select({
				id: appointmentTypes.id,
				calendarId: appointmentTypes.calendarId,
				name: appointmentTypes.name,
				durationMin: appointmentTypes.durationMin,
				active: appointmentTypes.active,
			})
			.from(appointmentTypes)
			.where(inArray(appointmentTypes.calendarId, ids))
			.orderBy(asc(appointmentTypes.position), asc(appointmentTypes.createdAt)),
		rt.db
			.select({
				calendarId: availabilityRules.calendarId,
				weekday: availabilityRules.weekday,
				startTime: availabilityRules.startTime,
				endTime: availabilityRules.endTime,
				validFrom: availabilityRules.validFrom,
				validUntil: availabilityRules.validUntil,
			})
			.from(availabilityRules)
			.where(inArray(availabilityRules.calendarId, ids)),
	]);
	return rows.map((row) => ({
		...row,
		types: types.filter((type) => type.calendarId === row.id),
		rules: rules.filter((rule) => rule.calendarId === row.id),
	}));
}
