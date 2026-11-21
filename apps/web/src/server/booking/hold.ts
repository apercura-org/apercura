import { randomUUID } from "node:crypto";
import { appointmentEnd, createHold, occupancy } from "@apercura/core/booking";
import { appointments, otpChallenges } from "@apercura/db/schema";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import type { Transaction } from "~/server/db-executor";
import {
	ensureOrganizationKey,
	hashOpaqueToken,
	newOpaqueToken,
	newOtp,
	normalizePatientEmail,
	normalizePatientPhone,
	patientIndexes,
	sealAppointment,
	sealOtpCode,
} from "~/server/phi";
import {
	findCalendar,
	findType,
	isOnGrid,
	nearestAlternatives,
	occupiesAt,
	toCoreType,
} from "./availability";
import { BOOKING_LIMITS, bookingEnabled } from "./config";
import { ensureBookingConstraints } from "./constraints";
import { BookingError, isExclusionViolation, isUniqueViolation } from "./errors";
import { practitionerTransaction } from "./locks";
import { refreshNextFreeLater } from "./next-free";
import { enqueueOutbox } from "./outbox";
import { drainLater } from "./outbox-worker";
import { verifyProof } from "./proof";
import { type BookingRuntime, limit } from "./runtime";
import { expireStaleOverlapping, recordEvents } from "./transitions";

export interface PatientInput {
	firstName: string;
	lastName: string;
	email: string;
	phone?: string | null;
	/** Answer to "first visit with this practitioner?", when asked. */
	isNew?: boolean | null;
}

export interface HoldInput {
	calendarId: string;
	typeId: string;
	startsAt: Date;
	patient: PatientInput;
	locale: "fr" | "en";
	/** Client-chosen (UUID): a retried request returns the same hold. */
	idempotencyKey: string;
	/** Solved ALTCHA challenge (base64 JSON). */
	proof: string;
	/** Value of the browser cookie (one live hold per browser). */
	browserKey: string;
}

export type HoldResult =
	| { status: "held"; holdId: string; holdToken: string; expiresAt: Date; codeExpiresAt: Date }
	| { status: "slot_taken"; alternatives: Date[] };

interface ValidPatient {
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	isNew: boolean | null;
}

function validatePatient(patient: PatientInput, requirePhone: boolean): ValidPatient {
	const firstName = patient.firstName.trim();
	const lastName = patient.lastName.trim();
	const email = normalizePatientEmail(patient.email);
	const rawPhone = patient.phone?.trim() ? patient.phone.trim() : null;
	const phone = rawPhone ? normalizePatientPhone(rawPhone) : null;
	if (!firstName || !lastName || !email || (rawPhone && !phone) || (requirePhone && !phone)) {
		throw new BookingError("INVALID_INPUT");
	}
	return { firstName, lastName, email, phone, isNew: patient.isNew ?? null };
}

/** Creates the code challenge of a hold and enqueues its email, in the caller's transaction. */
export async function issueCode(
	tx: Transaction,
	options: { organizationId: string; appointmentId: string; emailBidx: string; nowMs: number },
) {
	const challengeId = randomUUID();
	const otp = newOtp();
	await tx.insert(otpChallenges).values({
		id: challengeId,
		organizationId: options.organizationId,
		purpose: "booking_email",
		appointmentId: options.appointmentId,
		targetBidx: options.emailBidx,
		codeHash: otp.hash,
		salt: otp.salt,
		codeEnc: await sealOtpCode(tx, options.organizationId, challengeId, otp.code),
		expiresAt: new Date(options.nowMs + BOOKING_LIMITS.codeValidityMs),
		createdAt: new Date(options.nowMs),
	});
	return enqueueOutbox(tx, [
		{
			organizationId: options.organizationId,
			kind: "booking_code",
			appointmentId: options.appointmentId,
			otpChallengeId: challengeId,
			revision: null,
			// A late code can revive an expired hold, so the email is still useful then.
			expectedStatuses: ["held", "expired"],
			dedupeKey: `booking_code:${challengeId}`,
		},
	]);
}

/**
 * `booking.hold`: proof of work, limits, then one transaction that expires the lapsed entries
 * overlapping the slot, inserts the 15-minute hold with the patient's data encrypted, and
 * enqueues the code email. The overlap constraint is the only arbiter of "free": a 23P01 answers
 * `slot_taken` with the nearest alternatives. Never check-then-insert.
 */
export async function hold(rt: BookingRuntime, input: HoldInput): Promise<HoldResult> {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await ensureBookingConstraints(rt.db.$client);
	await limit(rt, rt.clientKey("booking-hold"), BOOKING_LIMITS.holdsPerIp);
	if (!(await verifyProof(rt, input.proof))) {
		throw new BookingError("PROOF_REQUIRED");
	}
	const nowMs = rt.nowMs();
	const browserKeyHash = hashOpaqueToken(`browser:${input.browserKey}`);

	const replay = await replayHold(rt, input, browserKeyHash, nowMs);
	if (replay) {
		return replay;
	}

	const calendar = await findCalendar(rt.db, input.calendarId, { openOnly: true });
	const type = await findType(rt.db, calendar.id, input.typeId);
	const patient = validatePatient(input.patient, calendar.requirePhone);
	const startMs = input.startsAt.getTime();
	if (!(await isOnGrid(rt.db, calendar, type, startMs, nowMs))) {
		throw new BookingError("INVALID_SLOT");
	}
	const { emailBidx, phoneBidx } = patientIndexes(calendar.organizationId, patient);
	if (!emailBidx) {
		throw new BookingError("INVALID_INPUT");
	}
	await limit(
		rt,
		`booking-hold-email:${calendar.organizationId}:${emailBidx}`,
		BOOKING_LIMITS.holdsPerEmail,
	);

	const occupied = occupancy(toCoreType(type), startMs);
	const endMs = appointmentEnd(toCoreType(type), startMs);
	const state = createHold(nowMs);
	const holdToken = newOpaqueToken();
	const appointmentId = randomUUID();
	const now = new Date(nowMs);

	let outboxIds: string[];
	try {
		await ensureOrganizationKey(rt.db, calendar.organizationId);
		outboxIds = await practitionerTransaction(rt.db, calendar.practitionerId, async (tx) => {
			// One live hold per browser: an earlier hold of this browser is released.
			const released = await tx
				.update(appointments)
				.set({
					status: "expired",
					expiryReason: "released",
					revision: sql`${appointments.revision} + 1`,
					updatedAt: now,
				})
				.where(
					and(eq(appointments.browserKeyHash, browserKeyHash), eq(appointments.status, "held")),
				)
				.returning({
					id: appointments.id,
					organizationId: appointments.organizationId,
					revision: appointments.revision,
				});
			await recordEvents(
				tx,
				released.map((row) => ({
					appointmentId: row.id,
					organizationId: row.organizationId,
					actor: "patient",
					event: "expire",
					fromStatus: "held",
					toStatus: "expired",
					revision: row.revision,
					data: { reason: "released", by: "new_hold" },
				})),
			);

			const [live] = await tx
				.select({ n: count() })
				.from(appointments)
				.where(
					and(
						eq(appointments.practitionerId, calendar.practitionerId),
						eq(appointments.status, "held"),
						gt(appointments.expiresAt, now),
					),
				);
			if ((live?.n ?? 0) >= BOOKING_LIMITS.liveHoldsPerPractitioner) {
				throw new BookingError("RATE_LIMITED");
			}
			const [mine] = await tx
				.select({ n: count() })
				.from(appointments)
				.where(
					and(
						eq(appointments.calendarId, calendar.id),
						eq(appointments.emailBidx, emailBidx),
						gt(appointments.startsAt, now),
						inArray(appointments.status, ["held", "pending", "confirmed"]),
						occupiesAt(now),
					),
				);
			if ((mine?.n ?? 0) >= BOOKING_LIMITS.activePerEmailPerCalendar) {
				throw new BookingError("RATE_LIMITED");
			}

			await expireStaleOverlapping(tx, {
				practitionerId: calendar.practitionerId,
				fromMs: occupied.fromMs,
				untilMs: occupied.untilMs,
				nowMs,
				actor: "patient",
			});

			const sealed = await sealAppointment(tx, calendar.organizationId, appointmentId, {
				firstName: patient.firstName,
				lastName: patient.lastName,
				email: patient.email,
				phone: patient.phone,
			});
			await tx.insert(appointments).values({
				id: appointmentId,
				organizationId: calendar.organizationId,
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
				expiresAt: new Date(state.expiresAtMs ?? nowMs),
				revision: 1,
				idempotencyKey: input.idempotencyKey,
				source: "online",
				...sealed,
				emailBidx,
				phoneBidx,
				patientLocale: input.locale,
				patientIsNew: patient.isNew,
				holdTokenHash: hashOpaqueToken(holdToken),
				browserKeyHash,
				createdAt: now,
				updatedAt: now,
			});
			await recordEvents(tx, [
				{
					appointmentId,
					organizationId: calendar.organizationId,
					actor: "patient",
					event: "hold",
					fromStatus: null,
					toStatus: "held",
					revision: 1,
				},
			]);
			return issueCode(tx, {
				organizationId: calendar.organizationId,
				appointmentId,
				emailBidx,
				nowMs,
			});
		});
	} catch (error) {
		if (isExclusionViolation(error)) {
			const alternatives = await nearestAlternatives(
				rt.db,
				calendar,
				type,
				startMs,
				nowMs,
				BOOKING_LIMITS.alternatives,
			);
			return { status: "slot_taken", alternatives: alternatives.map((ms) => new Date(ms)) };
		}
		if (isUniqueViolation(error, "appointments_one_hold_per_browser_uq")) {
			// Two holds raced from one browser: the other one won.
			throw new BookingError("RATE_LIMITED");
		}
		if (isUniqueViolation(error, "appointments_idempotency_key_uq")) {
			const again = await replayHold(rt, input, browserKeyHash, nowMs);
			if (again) {
				return again;
			}
			throw new BookingError("IDEMPOTENCY_CONFLICT");
		}
		throw error;
	}

	drainLater(rt, outboxIds);
	refreshNextFreeLater(rt, calendar.practitionerId);
	return {
		status: "held",
		holdId: appointmentId,
		holdToken,
		expiresAt: new Date(state.expiresAtMs ?? nowMs),
		codeExpiresAt: new Date(nowMs + BOOKING_LIMITS.codeValidityMs),
	};
}

/**
 * A retried `hold` (same idempotency key): the same browser asking for the same slot gets its
 * hold back with a fresh hold token (only its hash is stored); anything else is a conflict.
 */
async function replayHold(
	rt: BookingRuntime,
	input: HoldInput,
	browserKeyHash: string,
	nowMs: number,
): Promise<HoldResult | null> {
	const [existing] = await rt.db
		.select()
		.from(appointments)
		.where(eq(appointments.idempotencyKey, input.idempotencyKey))
		.limit(1);
	if (!existing) {
		return null;
	}
	const same =
		existing.browserKeyHash === browserKeyHash &&
		existing.calendarId === input.calendarId &&
		existing.appointmentTypeId === input.typeId &&
		existing.startsAt.getTime() === input.startsAt.getTime() &&
		existing.status === "held" &&
		(existing.expiresAt?.getTime() ?? 0) > nowMs;
	if (!same) {
		throw new BookingError("IDEMPOTENCY_CONFLICT");
	}
	const holdToken = newOpaqueToken();
	await rt.db
		.update(appointments)
		.set({ holdTokenHash: hashOpaqueToken(holdToken) })
		.where(eq(appointments.id, existing.id));
	return {
		status: "held",
		holdId: existing.id,
		holdToken,
		expiresAt: existing.expiresAt ?? new Date(nowMs),
		codeExpiresAt: new Date(existing.createdAt.getTime() + BOOKING_LIMITS.codeValidityMs),
	};
}
