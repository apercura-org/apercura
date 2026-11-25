import {
	appointments,
	type appointmentTypes,
	type calendars,
	otpChallenges,
} from "@apercura/db/schema";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import {
	ensureOrganizationKey,
	hashOpaqueToken,
	manageTokenFor,
	newManageNonce,
	otpMatches,
} from "~/server/phi";
import { findCalendar, findType, nearestAlternatives } from "./availability";
import { BOOKING_LIMITS, bookingEnabled } from "./config";
import { ensureBookingConstraints } from "./constraints";
import { BookingError, isExclusionViolation } from "./errors";
import { issueCode } from "./hold";
import { practitionerTransaction } from "./locks";
import { refreshNextFreeLater } from "./next-free";
import { enqueueOutbox } from "./outbox";
import { drainLater } from "./outbox-worker";
import { type BookingRuntime, limit } from "./runtime";
import {
	type AppointmentRow,
	applyTransition,
	expireStaleOverlapping,
	lockAppointment,
} from "./transitions";
import { assertTravelFree } from "./travel";

const DAY_MS = 86_400_000;

export interface HoldRef {
	holdId: string;
	holdToken: string;
}

export type VerifyResult =
	| {
			status: "confirmed" | "pending";
			manageToken: string;
			startsAt: Date;
			/** Validation deadline of a pending request. */
			pendingUntil: Date | null;
	  }
	| { status: "invalid_code"; attemptsLeft: number }
	| { status: "slot_taken"; alternatives: Date[] };

async function findHold(rt: BookingRuntime, ref: HoldRef): Promise<AppointmentRow> {
	const [row] = await rt.db
		.select()
		.from(appointments)
		.where(
			and(
				eq(appointments.id, ref.holdId),
				eq(appointments.holdTokenHash, hashOpaqueToken(ref.holdToken)),
				eq(appointments.source, "online"),
			),
		)
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row;
}

async function liveChallenges(rt: BookingRuntime, appointmentId: string, now: Date) {
	return rt.db
		.select()
		.from(otpChallenges)
		.where(
			and(
				eq(otpChallenges.appointmentId, appointmentId),
				isNull(otpChallenges.consumedAt),
				gt(otpChallenges.expiresAt, now),
			),
		)
		.orderBy(asc(otpChallenges.createdAt));
}

/**
 * Whether an online booking must wait for the practice: manual validation, a type reserved to
 * patients already followed, or a calendar closed to new patients. "Already a patient?" cannot be
 * checked in v1, so in doubt the request goes `pending`, never to an error (no probing of who is
 * whose patient).
 */
function needsManualValidation(
	calendar: typeof calendars.$inferSelect,
	type: typeof appointmentTypes.$inferSelect | null,
	patientIsNew: boolean | null,
): boolean {
	return (
		calendar.manualValidation ||
		type?.audience === "existing" ||
		(!calendar.acceptsNewPatients && patientIsNew !== false)
	);
}

/**
 * `booking.verify`: checks the email code (5 attempts, 30-minute validity), then confirms the
 * booking or makes it a `pending` request. A code entered after the hold lapsed revives it when
 * the slot is still free; the overlap constraint re-checks that on the update.
 */
export async function verify(
	rt: BookingRuntime,
	input: HoldRef & { code: string },
): Promise<VerifyResult> {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await ensureBookingConstraints(rt.db.$client);
	await limit(rt, rt.clientKey("booking-verify"), BOOKING_LIMITS.verifiesPerIp);
	const held = await findHold(rt, input);
	const nowMs = rt.nowMs();
	const now = new Date(nowMs);

	if ((held.status === "confirmed" || held.status === "pending") && held.manageTokenNonce) {
		// Already verified (double submit): same answer, same token.
		return {
			status: held.status,
			manageToken: manageTokenFor(held.id, held.manageTokenNonce),
			startsAt: held.startsAt,
			pendingUntil: held.status === "pending" ? held.expiresAt : null,
		};
	}

	const challenges = await liveChallenges(rt, held.id, now);
	if (challenges.length === 0) {
		throw new BookingError("CODE_EXPIRED");
	}
	const attempts = Math.max(...challenges.map((challenge) => challenge.attempts));
	if (attempts >= BOOKING_LIMITS.codeAttempts) {
		throw new BookingError("TOO_MANY_ATTEMPTS");
	}
	const code = input.code.trim();
	const match = challenges.find((challenge) =>
		otpMatches(code, challenge.salt, challenge.codeHash),
	);
	if (!match) {
		return wrongCode(rt, held, nowMs);
	}

	const calendar = await findCalendar(rt.db, held.calendarId);
	const type = held.appointmentTypeId
		? await findType(rt.db, calendar.id, held.appointmentTypeId, true).catch(() => null)
		: null;
	const manual = needsManualValidation(calendar, type, held.patientIsNew);
	const nonce = newManageNonce();
	const manageToken = manageTokenFor(held.id, nonce);

	let outcome: { row: AppointmentRow; outboxIds: string[] };
	try {
		outcome = await practitionerTransaction(rt.db, held.practitionerId, async (tx) => {
			const row = await lockAppointment(tx, held.id);
			if (row.status === "expired") {
				await expireStaleOverlapping(tx, {
					practitionerId: row.practitionerId,
					fromMs: row.occupiedFrom.getTime(),
					untilMs: row.occupiedUntil.getTime(),
					nowMs,
					actor: "patient",
					excludeId: row.id,
				});
				// A revived hold takes its slot again: the travel before a visit too.
				await assertTravelFree(tx, {
					practitionerId: row.practitionerId,
					fromMs: row.occupiedFrom.getTime(),
					untilMs: row.occupiedUntil.getTime(),
					travelMin: row.travelMin,
					nowMs,
					excludeId: row.id,
				});
			}
			const ids: string[] = [];
			const { row: updated } = await applyTransition(
				tx,
				row,
				{ type: "verify", nowMs, manualValidation: manual },
				{
					actor: "patient",
					set: {
						emailVerifiedAt: now,
						manageTokenHash: hashOpaqueToken(manageToken),
						manageTokenNonce: nonce,
						purgeAfter: new Date(row.endsAt.getTime() + calendar.retentionDays * DAY_MS),
					},
					data: row.status === "expired" ? { revived: true } : undefined,
				},
			);
			const pending = updated.status === "pending";
			ids.push(
				...(await enqueueOutbox(tx, [
					{
						organizationId: updated.organizationId,
						kind: pending ? "booking_pending" : "booking_confirmed",
						appointmentId: updated.id,
						revision: updated.revision,
						expectedStatuses: [updated.status],
					},
					{
						organizationId: updated.organizationId,
						kind: pending ? "practice_request" : "practice_new",
						appointmentId: updated.id,
						revision: updated.revision,
						expectedStatuses: [updated.status],
					},
				])),
			);
			await tx
				.update(otpChallenges)
				.set({ consumedAt: now, codeEnc: null })
				.where(and(eq(otpChallenges.appointmentId, row.id), isNull(otpChallenges.consumedAt)));
			return { row: updated, outboxIds: ids };
		});
	} catch (error) {
		if (isExclusionViolation(error) && type) {
			const alternatives = await nearestAlternatives(
				rt.db,
				calendar,
				type,
				held.startsAt.getTime(),
				nowMs,
				BOOKING_LIMITS.alternatives,
			);
			return { status: "slot_taken", alternatives: alternatives.map((ms) => new Date(ms)) };
		}
		if (isExclusionViolation(error)) {
			return { status: "slot_taken", alternatives: [] };
		}
		throw error;
	}

	drainLater(rt, outcome.outboxIds);
	refreshNextFreeLater(rt, held.practitionerId);
	return {
		status: outcome.row.status === "pending" ? "pending" : "confirmed",
		manageToken,
		startsAt: outcome.row.startsAt,
		pendingUntil: outcome.row.status === "pending" ? outcome.row.expiresAt : null,
	};
}

async function wrongCode(
	rt: BookingRuntime,
	held: AppointmentRow,
	nowMs: number,
): Promise<VerifyResult> {
	const now = new Date(nowMs);
	const rows = await rt.db
		.update(otpChallenges)
		.set({ attempts: sql`${otpChallenges.attempts} + 1` })
		.where(
			and(
				eq(otpChallenges.appointmentId, held.id),
				isNull(otpChallenges.consumedAt),
				gt(otpChallenges.expiresAt, now),
			),
		)
		.returning({ attempts: otpChallenges.attempts });
	const attempts = Math.max(0, ...rows.map((row) => row.attempts));
	const attemptsLeft = Math.max(0, BOOKING_LIMITS.codeAttempts - attempts);
	if (attemptsLeft === 0) {
		await practitionerTransaction(rt.db, held.practitionerId, async (tx) => {
			const row = await lockAppointment(tx, held.id);
			await tx
				.update(otpChallenges)
				.set({ consumedAt: now, codeEnc: null })
				.where(and(eq(otpChallenges.appointmentId, row.id), isNull(otpChallenges.consumedAt)));
			if (row.status === "held") {
				await applyTransition(
					tx,
					row,
					{ type: "expire", nowMs, reason: "too_many_attempts" },
					{ actor: "patient" },
				);
			}
		});
		refreshNextFreeLater(rt, held.practitionerId);
	}
	return { status: "invalid_code", attemptsLeft };
}

/** `booking.resendCode`: a new code (3 emails per hold, at least 60 s apart). */
export async function resendCode(
	rt: BookingRuntime,
	ref: HoldRef,
): Promise<{ codeExpiresAt: Date; sendsLeft: number }> {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await limit(rt, rt.clientKey("booking-verify"), BOOKING_LIMITS.verifiesPerIp);
	const held = await findHold(rt, ref);
	const nowMs = rt.nowMs();
	const revivable = held.status === "expired" && held.expiryReason === "hold_timeout";
	if ((held.status !== "held" && !revivable) || !held.emailBidx) {
		throw new BookingError("TRANSITION_REFUSED", "INVALID_TRANSITION");
	}
	await ensureOrganizationKey(rt.db, held.organizationId);
	const ids = await practitionerTransaction(rt.db, held.practitionerId, async (tx) => {
		await lockAppointment(tx, held.id);
		const sent = await tx
			.select({ createdAt: otpChallenges.createdAt, consumedAt: otpChallenges.consumedAt })
			.from(otpChallenges)
			.where(eq(otpChallenges.appointmentId, held.id))
			.orderBy(asc(otpChallenges.createdAt));
		if (sent.some((challenge) => challenge.consumedAt !== null)) {
			throw new BookingError("TOO_MANY_ATTEMPTS");
		}
		if (sent.length >= BOOKING_LIMITS.codeSends) {
			throw new BookingError("RESEND_LIMIT");
		}
		const last = sent.at(-1);
		if (last && nowMs - last.createdAt.getTime() < BOOKING_LIMITS.resendIntervalMs) {
			throw new BookingError("RESEND_TOO_SOON");
		}
		return {
			outbox: await issueCode(tx, {
				organizationId: held.organizationId,
				appointmentId: held.id,
				emailBidx: held.emailBidx ?? "",
				nowMs,
			}),
			sendsLeft: BOOKING_LIMITS.codeSends - sent.length - 1,
		};
	});
	drainLater(rt, ids.outbox);
	return {
		codeExpiresAt: new Date(nowMs + BOOKING_LIMITS.codeValidityMs),
		sendsLeft: ids.sendsLeft,
	};
}

/** `booking.release`: the patient goes back; the hold frees its slot at once. */
export async function release(rt: BookingRuntime, ref: HoldRef): Promise<{ released: boolean }> {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await limit(rt, rt.clientKey("booking-verify"), BOOKING_LIMITS.verifiesPerIp);
	const held = await findHold(rt, ref);
	const nowMs = rt.nowMs();
	const released = await practitionerTransaction(rt.db, held.practitionerId, async (tx) => {
		const row = await lockAppointment(tx, held.id);
		if (row.status !== "held") {
			return false;
		}
		await applyTransition(
			tx,
			row,
			{ type: "expire", nowMs, reason: "released" },
			{ actor: "patient" },
		);
		return true;
	});
	if (released) {
		refreshNextFreeLater(rt, held.practitionerId);
	}
	return { released };
}
