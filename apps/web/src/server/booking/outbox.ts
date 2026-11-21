import { outbox } from "@apercura/db/schema";
import type { Executor } from "~/server/db-executor";

/** Templates of patient emails (always minimal: no specialty, no reason). */
export type PatientEmailKind =
	| "booking_code"
	| "booking_confirmed"
	| "booking_pending"
	| "booking_accepted"
	| "booking_declined"
	| "request_expired"
	| "booking_cancelled_by_patient"
	| "booking_cancelled_by_practice"
	| "booking_rescheduled"
	| "reminder"
	/** First email to an address typed by the practice: neutral, with a confirmation link. */
	| "practice_entry";

/** Templates of practice notifications (never the patient's name). */
export type PracticeEmailKind =
	| "practice_new"
	| "practice_request"
	| "practice_cancelled"
	| "practice_rescheduled";

export type OutboxKind = PatientEmailKind | PracticeEmailKind;

export interface OutboxEntry {
	organizationId: string;
	kind: OutboxKind;
	appointmentId: string;
	/** Revision the email describes; the email is skipped once the appointment moved on. */
	revision: number | null;
	/** Statuses the appointment must still have when the email is sent. */
	expectedStatuses: readonly string[];
	otpChallengeId?: string;
	/** Overrides the default dedupe key `{kind}:{appointmentId}:{revision}`. */
	dedupeKey?: string;
}

export function recipientOf(kind: OutboxKind): "patient" | "practice" {
	return kind.startsWith("practice_") && kind !== "practice_entry" ? "practice" : "patient";
}

/**
 * Enqueues emails in the caller's transaction. A dedupe key already present is a no-op, so
 * retrying a write (or a job) never sends an email twice. Returns the ids actually inserted.
 */
export async function enqueueOutbox(db: Executor, entries: readonly OutboxEntry[]) {
	if (entries.length === 0) {
		return [];
	}
	const rows = await db
		.insert(outbox)
		.values(
			entries.map((entry) => ({
				organizationId: entry.organizationId,
				kind: entry.kind,
				recipient: recipientOf(entry.kind),
				appointmentId: entry.appointmentId,
				otpChallengeId: entry.otpChallengeId ?? null,
				appointmentRevision: entry.revision,
				expectedStatuses: [...entry.expectedStatuses],
				dedupeKey: entry.dedupeKey ?? `${entry.kind}:${entry.appointmentId}:${entry.revision ?? 0}`,
			})),
		)
		.onConflictDoNothing({ target: outbox.dedupeKey })
		.returning({ id: outbox.id });
	return rows.map((row) => row.id);
}
