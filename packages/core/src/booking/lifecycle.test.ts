import { describe, expect, it } from "vitest";
import {
	type AppointmentStatus,
	createHold,
	createPracticeEntry,
	effectiveStatus,
	type LifecycleEntry,
	type LifecycleEvent,
	occupiesSlot,
	pendingDeadline,
	transition,
} from "./lifecycle";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.parse("2026-05-04T08:00:00Z");
const START = T0 + 7 * 24 * HOUR;

function entry(status: AppointmentStatus, overrides: Partial<LifecycleEntry> = {}): LifecycleEntry {
	return {
		status,
		createdAtMs: T0,
		startsAtMs: START,
		endsAtMs: START + 30 * MIN,
		expiresAtMs: status === "held" ? T0 + 15 * MIN : null,
		bookedAtMs: status === "held" ? null : T0,
		...overrides,
	};
}

const nextStatus = (e: LifecycleEntry, event: LifecycleEvent) => {
	const result = transition(e, event);
	return result.ok ? result.next.status : result.error.code;
};

describe("creation", () => {
	it("holds for 15 minutes, or confirms directly for the practice", () => {
		expect(createHold(T0)).toEqual({
			status: "held",
			expiresAtMs: T0 + 15 * MIN,
			bookedAtMs: null,
			expiryReason: null,
		});
		expect(createPracticeEntry(T0).status).toBe("confirmed");
	});
});

describe("verify", () => {
	it("confirms a hold, or makes it pending until min(createdAt + 48 h, start − 2 h)", () => {
		const confirmed = transition(entry("held"), {
			type: "verify",
			nowMs: T0 + MIN,
			manualValidation: false,
		});
		expect(confirmed).toEqual({
			ok: true,
			next: { status: "confirmed", expiresAtMs: null, bookedAtMs: T0 + MIN, expiryReason: null },
		});
		const pending = transition(entry("held"), {
			type: "verify",
			nowMs: T0 + MIN,
			manualValidation: true,
		});
		expect(pending.ok && pending.next).toMatchObject({
			status: "pending",
			expiresAtMs: T0 + 48 * HOUR,
		});
		const soon = entry("held", { startsAtMs: T0 + 10 * HOUR, endsAtMs: T0 + 11 * HOUR });
		const pendingSoon = transition(soon, {
			type: "verify",
			nowMs: T0 + MIN,
			manualValidation: true,
		});
		expect(pendingSoon.ok && pendingSoon.next.expiresAtMs).toBe(T0 + 8 * HOUR);
		expect(pendingDeadline(T0, T0 + 10 * HOUR)).toBe(T0 + 8 * HOUR);
	});

	it("revives a hold that timed out, but not one expired for another reason", () => {
		const late = { type: "verify", nowMs: T0 + 25 * MIN, manualValidation: false } as const;
		expect(nextStatus(entry("held"), late)).toBe("confirmed");
		expect(nextStatus(entry("expired", { expiryReason: "hold_timeout" }), late)).toBe("confirmed");
		expect(nextStatus(entry("expired", { expiryReason: "too_many_attempts" }), late)).toBe(
			"INVALID_TRANSITION",
		);
		expect(nextStatus(entry("expired", { expiryReason: "released" }), late)).toBe(
			"INVALID_TRANSITION",
		);
		expect(nextStatus(entry("confirmed"), late)).toBe("INVALID_TRANSITION");
	});

	it("refuses when the appointment has started or the validation window is closed", () => {
		expect(
			nextStatus(entry("held"), { type: "verify", nowMs: START, manualValidation: false }),
		).toBe("ALREADY_STARTED");
		expect(
			nextStatus(entry("held"), { type: "verify", nowMs: START - HOUR, manualValidation: true }),
		).toBe("VALIDATION_WINDOW_CLOSED");
	});
});

describe("expire", () => {
	it("expires a hold on timeout only once it lapsed", () => {
		expect(
			nextStatus(entry("held"), { type: "expire", nowMs: T0 + 14 * MIN, reason: "hold_timeout" }),
		).toBe("NOT_EXPIRED_YET");
		const result = transition(entry("held"), {
			type: "expire",
			nowMs: T0 + 15 * MIN,
			reason: "hold_timeout",
		});
		expect(result.ok && result.next).toMatchObject({
			status: "expired",
			expiryReason: "hold_timeout",
		});
	});

	it("expires a hold at any time after too many codes, a release or a staff override", () => {
		for (const reason of ["too_many_attempts", "released", "overridden"] as const) {
			expect(nextStatus(entry("held"), { type: "expire", nowMs: T0 + MIN, reason })).toBe(
				"expired",
			);
			expect(nextStatus(entry("pending"), { type: "expire", nowMs: T0 + MIN, reason })).toBe(
				"INVALID_TRANSITION",
			);
		}
	});

	it("expires a pending request at its deadline", () => {
		const pending = entry("pending", { expiresAtMs: T0 + 48 * HOUR });
		expect(
			nextStatus(pending, { type: "expire", nowMs: T0 + HOUR, reason: "validation_deadline" }),
		).toBe("NOT_EXPIRED_YET");
		expect(
			nextStatus(pending, { type: "expire", nowMs: T0 + 48 * HOUR, reason: "validation_deadline" }),
		).toBe("expired");
		expect(
			nextStatus(entry("confirmed"), {
				type: "expire",
				nowMs: START,
				reason: "validation_deadline",
			}),
		).toBe("INVALID_TRANSITION");
	});
});

describe("practice decisions", () => {
	const pending = entry("pending", { expiresAtMs: T0 + 48 * HOUR });

	it("confirms or declines a pending request before its deadline", () => {
		expect(nextStatus(pending, { type: "confirm", nowMs: T0 + HOUR })).toBe("confirmed");
		expect(nextStatus(pending, { type: "decline", nowMs: T0 + HOUR })).toBe("declined");
		expect(nextStatus(pending, { type: "confirm", nowMs: T0 + 48 * HOUR })).toBe("EXPIRED");
		expect(nextStatus(entry("held"), { type: "confirm", nowMs: T0 })).toBe("INVALID_TRANSITION");
	});

	it("cancels pending and confirmed entries, never terminal ones", () => {
		expect(nextStatus(pending, { type: "cancel_by_practice", nowMs: T0 })).toBe(
			"cancelled_by_practice",
		);
		expect(
			nextStatus(entry("confirmed"), { type: "cancel_by_practice", nowMs: START + HOUR }),
		).toBe("cancelled_by_practice");
		for (const status of ["held", "declined", "expired", "completed", "no_show"] as const) {
			expect(nextStatus(entry(status), { type: "cancel_by_practice", nowMs: T0 })).toBe(
				"INVALID_TRANSITION",
			);
		}
	});

	it("completes 24 hours after the end, and records a no-show once started", () => {
		const confirmed = entry("confirmed");
		expect(nextStatus(confirmed, { type: "complete", nowMs: START + 30 * MIN + 23 * HOUR })).toBe(
			"TOO_EARLY",
		);
		expect(nextStatus(confirmed, { type: "complete", nowMs: START + 30 * MIN + 24 * HOUR })).toBe(
			"completed",
		);
		expect(nextStatus(confirmed, { type: "mark_no_show", nowMs: START - MIN })).toBe("NOT_STARTED");
		expect(nextStatus(confirmed, { type: "mark_no_show", nowMs: START + 5 * MIN })).toBe("no_show");
		expect(nextStatus(entry("pending"), { type: "mark_no_show", nowMs: START })).toBe(
			"INVALID_TRANSITION",
		);
	});
});

describe("patient cancellation", () => {
	const cancel = (nowMs: number, cancellationCutoffMin = 24 * 60) =>
		({ type: "cancel_by_patient", nowMs, cancellationCutoffMin }) as const;

	it("cancels a pending request at any time before it lapses", () => {
		const pending = entry("pending", { expiresAtMs: START - 2 * HOUR });
		expect(nextStatus(pending, cancel(START - 3 * HOUR))).toBe("cancelled_by_patient");
		expect(nextStatus(pending, cancel(START - 2 * HOUR))).toBe("EXPIRED");
	});

	it("cancels a confirmed appointment before the cutoff", () => {
		const confirmed = entry("confirmed");
		expect(nextStatus(confirmed, cancel(START - 24 * HOUR))).toBe("cancelled_by_patient");
		expect(nextStatus(confirmed, cancel(START - 24 * HOUR + MIN))).toBe("CANCELLATION_CLOSED");
		expect(nextStatus(confirmed, cancel(START))).toBe("ALREADY_STARTED");
	});

	it("allows a change of mind within 10 minutes of booking, even past the cutoff", () => {
		const bookedAtMs = START - 3 * HOUR;
		const confirmed = entry("confirmed", { createdAtMs: bookedAtMs - 5 * MIN, bookedAtMs });
		expect(nextStatus(confirmed, cancel(bookedAtMs + 10 * MIN))).toBe("cancelled_by_patient");
		expect(nextStatus(confirmed, cancel(bookedAtMs + 11 * MIN))).toBe("CANCELLATION_CLOSED");
	});

	it("refuses other statuses and invalid cutoffs", () => {
		expect(nextStatus(entry("held"), cancel(T0))).toBe("INVALID_TRANSITION");
		expect(nextStatus(entry("completed"), cancel(T0))).toBe("INVALID_TRANSITION");
		expect(() => transition(entry("confirmed"), cancel(T0, -1))).toThrow(RangeError);
	});
});

describe("effective status", () => {
	it("reads lapsed holds and requests as expired", () => {
		expect(effectiveStatus(entry("held"), T0 + 14 * MIN)).toBe("held");
		expect(effectiveStatus(entry("held"), T0 + 15 * MIN)).toBe("expired");
		expect(occupiesSlot(entry("held"), T0 + 15 * MIN)).toBe(false);
		expect(occupiesSlot(entry("confirmed"), START + 10 * 24 * HOUR)).toBe(true);
		expect(occupiesSlot(entry("cancelled_by_patient"), T0)).toBe(false);
	});
});
