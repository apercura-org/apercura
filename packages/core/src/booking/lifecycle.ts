import { HOUR_MS, MINUTE_MS } from "../time/local";

export type AppointmentStatus =
	| "held"
	| "pending"
	| "confirmed"
	| "declined"
	| "expired"
	| "cancelled_by_patient"
	| "cancelled_by_practice"
	| "no_show"
	| "completed";

/** Statuses that occupy the slot (the only ones covered by the `EXCLUDE` constraint). */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = ["held", "pending", "confirmed"];

/** How long a patient hold lasts before the email code is entered. */
export const HOLD_DURATION_MS = 15 * MINUTE_MS;
/** Longest time a request may wait for manual validation. */
export const PENDING_MAX_MS = 48 * HOUR_MS;
/** A request must be validated at least this long before the appointment starts. */
export const PENDING_LEAD_MS = 2 * HOUR_MS;
/** A patient may cancel a confirmed appointment this long after booking, whatever the cutoff. */
export const CANCELLATION_GRACE_MS = 10 * MINUTE_MS;
/** A confirmed appointment becomes `completed` this long after it ends. */
export const COMPLETION_DELAY_MS = 24 * HOUR_MS;

/** Why an entry became `expired`. Only `hold_timeout` can be revived by a late code. */
export type ExpiryReason =
	| "hold_timeout"
	| "too_many_attempts"
	| "released"
	| "overridden"
	| "validation_deadline";

export interface LifecycleEntry {
	status: AppointmentStatus;
	createdAtMs: number;
	startsAtMs: number;
	endsAtMs: number;
	/** End of the hold (`held`) or validation deadline (`pending`); `null` otherwise. */
	expiresAtMs: number | null;
	/** When the patient completed the booking (code verified). Defaults to `createdAtMs`. */
	bookedAtMs?: number | null;
	/** Set when `status` is `expired`. */
	expiryReason?: ExpiryReason | null;
}

export type LifecycleEvent =
	/** The patient entered the right email code (`booking.verify`). */
	| { type: "verify"; nowMs: number; manualValidation: boolean }
	/** Hold timeout, too many wrong codes, patient went back, staff override, or request deadline. */
	| { type: "expire"; nowMs: number; reason: ExpiryReason }
	/** The practice accepts a pending request. */
	| { type: "confirm"; nowMs: number }
	/** The practice refuses a pending request. */
	| { type: "decline"; nowMs: number }
	/** `manage.cancel`; `cancellationCutoffMin` comes from the calendar settings. */
	| { type: "cancel_by_patient"; nowMs: number; cancellationCutoffMin: number }
	/** `agenda.cancel`. */
	| { type: "cancel_by_practice"; nowMs: number }
	/** Sweep, 24 hours after the end. */
	| { type: "complete"; nowMs: number }
	/** The practice reports that the patient did not come. */
	| { type: "mark_no_show"; nowMs: number };

export type LifecycleEventType = LifecycleEvent["type"];

export interface LifecycleState {
	status: AppointmentStatus;
	expiresAtMs: number | null;
	bookedAtMs: number | null;
	expiryReason: ExpiryReason | null;
}

export type TransitionErrorCode =
	/** No such edge from the current status. */
	| "INVALID_TRANSITION"
	/** The hold or request is past its `expiresAtMs`: it must be expired instead. */
	| "EXPIRED"
	/** A timeout or deadline expiry was requested before `expiresAtMs`. */
	| "NOT_EXPIRED_YET"
	/** The appointment has already started. */
	| "ALREADY_STARTED"
	/** No-show reported before the appointment started. */
	| "NOT_STARTED"
	/** Completion requested less than 24 hours after the end. */
	| "TOO_EARLY"
	/** The patient cancellation cutoff has passed (and the 10-minute grace period too). */
	| "CANCELLATION_CLOSED"
	/** Manual validation required, but the validation deadline has already passed. */
	| "VALIDATION_WINDOW_CLOSED";

export interface TransitionError {
	code: TransitionErrorCode;
	from: AppointmentStatus;
	event: LifecycleEventType;
}

export type TransitionResult =
	| { ok: true; next: LifecycleState }
	| { ok: false; error: TransitionError };

/** State of a new online hold (`booking.hold`). */
export function createHold(nowMs: number): LifecycleState {
	return {
		status: "held",
		expiresAtMs: nowMs + HOLD_DURATION_MS,
		bookedAtMs: null,
		expiryReason: null,
	};
}

/**
 * State of an entry created by the practice (`agenda.create`, phone booking or block): confirmed
 * directly. It ignores availability rules, never the overlap constraint.
 */
export function createPracticeEntry(nowMs: number): LifecycleState {
	return { status: "confirmed", expiresAtMs: null, bookedAtMs: nowMs, expiryReason: null };
}

/** Deadline of a request awaiting manual validation: `min(createdAt + 48 h, start − 2 h)`. */
export function pendingDeadline(createdAtMs: number, startsAtMs: number): number {
	return Math.min(createdAtMs + PENDING_MAX_MS, startsAtMs - PENDING_LEAD_MS);
}

function isLapsed(entry: LifecycleEntry, nowMs: number): boolean {
	return (
		(entry.status === "held" || entry.status === "pending") &&
		entry.expiresAtMs !== null &&
		nowMs >= entry.expiresAtMs
	);
}

/**
 * Status as seen at `nowMs`: a hold or request past its `expiresAtMs` reads as `expired` even
 * before a write or the sweep records it.
 */
export function effectiveStatus(entry: LifecycleEntry, nowMs: number): AppointmentStatus {
	return isLapsed(entry, nowMs) ? "expired" : entry.status;
}

/** Whether the entry still occupies its slot at `nowMs`. */
export function occupiesSlot(entry: LifecycleEntry, nowMs: number): boolean {
	return ACTIVE_STATUSES.includes(effectiveStatus(entry, nowMs));
}

/**
 * Applies `event` to `entry`. Pure: returns the next state, or a typed error when the transition
 * is not allowed. The caller persists the state, an `appointment_events` row and its outbox rows
 * in one transaction.
 */
export function transition(entry: LifecycleEntry, event: LifecycleEvent): TransitionResult {
	const fail = (code: TransitionErrorCode): TransitionResult => ({
		ok: false,
		error: { code, from: entry.status, event: event.type },
	});
	const succeed = (next: Partial<LifecycleState> & { status: AppointmentStatus }) => ({
		ok: true as const,
		next: {
			expiresAtMs: null,
			bookedAtMs: entry.bookedAtMs ?? null,
			expiryReason: null,
			...next,
		},
	});
	const { nowMs } = event;
	const lapsed = isLapsed(entry, nowMs);

	switch (event.type) {
		case "verify": {
			// A code entered after the hold lapsed revives the booking; the overlap constraint
			// re-checks that the slot is still free when the row is written.
			const revivable =
				entry.status === "held" ||
				(entry.status === "expired" && entry.expiryReason === "hold_timeout");
			if (!revivable) {
				return fail("INVALID_TRANSITION");
			}
			if (nowMs >= entry.startsAtMs) {
				return fail("ALREADY_STARTED");
			}
			if (!event.manualValidation) {
				return succeed({ status: "confirmed", bookedAtMs: nowMs });
			}
			const deadline = pendingDeadline(entry.createdAtMs, entry.startsAtMs);
			if (deadline <= nowMs) {
				return fail("VALIDATION_WINDOW_CLOSED");
			}
			return succeed({ status: "pending", expiresAtMs: deadline, bookedAtMs: nowMs });
		}

		case "expire": {
			const timed = event.reason === "hold_timeout" || event.reason === "validation_deadline";
			const from = event.reason === "validation_deadline" ? "pending" : "held";
			if (entry.status !== from) {
				return fail("INVALID_TRANSITION");
			}
			if (timed && !lapsed) {
				return fail("NOT_EXPIRED_YET");
			}
			return succeed({ status: "expired", expiryReason: event.reason });
		}

		case "confirm":
		case "decline": {
			if (entry.status !== "pending") {
				return fail("INVALID_TRANSITION");
			}
			if (lapsed) {
				return fail("EXPIRED");
			}
			return succeed({ status: event.type === "confirm" ? "confirmed" : "declined" });
		}

		case "cancel_by_patient": {
			if (!Number.isInteger(event.cancellationCutoffMin) || event.cancellationCutoffMin < 0) {
				throw new RangeError("cancellationCutoffMin must be a non-negative integer");
			}
			if (entry.status === "pending") {
				return lapsed ? fail("EXPIRED") : succeed({ status: "cancelled_by_patient" });
			}
			if (entry.status !== "confirmed") {
				return fail("INVALID_TRANSITION");
			}
			if (nowMs >= entry.startsAtMs) {
				return fail("ALREADY_STARTED");
			}
			const beforeCutoff = nowMs <= entry.startsAtMs - event.cancellationCutoffMin * MINUTE_MS;
			const bookedAtMs = entry.bookedAtMs ?? entry.createdAtMs;
			const inGrace = nowMs - bookedAtMs <= CANCELLATION_GRACE_MS;
			return beforeCutoff || inGrace
				? succeed({ status: "cancelled_by_patient" })
				: fail("CANCELLATION_CLOSED");
		}

		case "cancel_by_practice": {
			if (entry.status === "pending") {
				return lapsed ? fail("EXPIRED") : succeed({ status: "cancelled_by_practice" });
			}
			return entry.status === "confirmed"
				? succeed({ status: "cancelled_by_practice" })
				: fail("INVALID_TRANSITION");
		}

		case "complete": {
			if (entry.status !== "confirmed") {
				return fail("INVALID_TRANSITION");
			}
			return nowMs >= entry.endsAtMs + COMPLETION_DELAY_MS
				? succeed({ status: "completed" })
				: fail("TOO_EARLY");
		}

		case "mark_no_show": {
			if (entry.status !== "confirmed") {
				return fail("INVALID_TRANSITION");
			}
			return nowMs >= entry.startsAtMs ? succeed({ status: "no_show" }) : fail("NOT_STARTED");
		}
	}
}
