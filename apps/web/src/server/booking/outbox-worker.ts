import { randomUUID } from "node:crypto";
import type { Database } from "@apercura/db";
import { appointments, otpChallenges, outbox } from "@apercura/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { composeMail, type OutboxRow, type RenderedMail } from "./mail-content";
import type { BookingRuntime } from "./runtime";
import { at } from "./sql-time";

/** Sends one rendered email. Throw {@link PermanentMailError} when retrying is pointless. */
export type MailTransport = (mail: RenderedMail) => Promise<void>;

/** The address does not exist (5xx on RCPT): no retry, the agenda says "call the patient". */
export class PermanentMailError extends Error {
	constructor(message = "Permanent delivery failure") {
		super(message);
		this.name = "PermanentMailError";
	}
}

/** Lease of a claimed row: another worker may take it over once it lapses. */
export const LEASE_MS = 2 * 60_000;
/** Delays before each retry; past the last one the row is `dead`. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];

/** Retry delay after `attempts` failed attempts, with ±10% jitter; null when out of retries. */
export function retryDelay(attempts: number, random: () => number = Math.random): number | null {
	const base = RETRY_DELAYS_MS[attempts - 1];
	if (base === undefined) {
		return null;
	}
	return Math.round(base * (0.9 + 0.2 * random()));
}

let defaultTransport: MailTransport | undefined;

/**
 * Replaces the SMTP transport for the whole process (tests and local tooling); `undefined`
 * restores SMTP.
 */
export function configureMailTransport(transport: MailTransport | undefined) {
	defaultTransport = transport;
}

/** SMTP through the shared mail module (Mailpit in development). */
async function smtpTransport(): Promise<MailTransport> {
	if (!defaultTransport) {
		const { sendRawMail } = await import("~/server/mail");
		defaultTransport = async (mail) => {
			try {
				await sendRawMail({
					to: mail.to,
					subject: mail.subject,
					html: mail.html,
					text: mail.text,
					...(mail.ics
						? {
								icalEvent: {
									method: mail.ics.method,
									filename: "rendez-vous.ics",
									content: mail.ics.content,
								},
							}
						: {}),
				});
			} catch (error) {
				const { responseCode, command } = error as { responseCode?: number; command?: string };
				if (
					typeof responseCode === "number" &&
					responseCode >= 500 &&
					/RCPT/i.test(command ?? "")
				) {
					throw new PermanentMailError(`SMTP ${responseCode} on RCPT`);
				}
				throw error;
			}
		};
	}
	return defaultTransport;
}

export interface ProcessOptions {
	nowMs: number;
	/** Only these rows (the ones a request just enqueued); otherwise every due row. */
	ids?: readonly string[];
	batchSize?: number;
	transport?: MailTransport;
	random?: () => number;
}

export interface ProcessResult {
	sent: number;
	skipped: number;
	retried: number;
	dead: number;
}

type ClaimedRow = OutboxRow & {
	appointment_id: string | null;
	appointment_revision: number | null;
	expected_statuses: string[];
	attempts: number;
	lease_token: string;
};

/**
 * Claims due rows with `FOR UPDATE SKIP LOCKED` and a 2-minute lease (one short statement, so no
 * transaction stays open while talking to SMTP), then for each row reloads the appointment and
 * skips the email when its status or revision changed. Failures are retried after 1 min, 5 min,
 * 15 min, 1 h and 4 h (with jitter), then the row is `dead` and the appointment flagged.
 */
export async function processOutbox(db: Database, options: ProcessOptions): Promise<ProcessResult> {
	const result: ProcessResult = { sent: 0, skipped: 0, retried: 0, dead: 0 };
	const now = new Date(options.nowMs);
	const leaseToken = randomUUID();
	const onlyIds =
		options.ids && options.ids.length > 0
			? sql`and id in (${sql.join(
					options.ids.map((id) => sql`${id}::uuid`),
					sql`, `,
				)})`
			: sql``;
	const claimed = [
		...(await db.execute<ClaimedRow>(sql`
		with due as (
			select id from care.outbox
			where ((status = 'pending' and next_attempt_at <= ${at(now)})
				or (status = 'sending' and lease_until < ${at(now)}))
				${onlyIds}
			order by next_attempt_at
			limit ${options.batchSize ?? 25}
			for update skip locked
		)
		update care.outbox o
		set status = 'sending', lease_token = ${leaseToken}, lease_until = ${at(options.nowMs + LEASE_MS)},
			attempts = o.attempts + 1
		from due
		where o.id = due.id
		returning o.id, o.organization_id as "organizationId", o.kind, o.recipient,
			o.otp_challenge_id as "otpChallengeId", o.appointment_id, o.appointment_revision,
			o.expected_statuses, o.attempts, o.lease_token
	`)),
	];
	if (claimed.length === 0) {
		return result;
	}
	const transport = options.transport ?? (await smtpTransport());

	for (const row of claimed) {
		const finish = (set: Partial<typeof outbox.$inferInsert>) =>
			db
				.update(outbox)
				.set({ leaseToken: null, leaseUntil: null, ...set })
				.where(and(eq(outbox.id, row.id), eq(outbox.leaseToken, row.lease_token)));

		const [appointment] = row.appointment_id
			? await db.select().from(appointments).where(eq(appointments.id, row.appointment_id)).limit(1)
			: [];
		const stale =
			!appointment ||
			appointment.purgedAt !== null ||
			(row.appointment_revision !== null && appointment.revision !== row.appointment_revision) ||
			(row.expected_statuses.length > 0 && !row.expected_statuses.includes(appointment.status));
		if (stale || !appointment) {
			await finish({ status: "skipped" });
			result.skipped += 1;
			continue;
		}

		try {
			const mails = await composeMail(db, row, appointment, options.nowMs);
			for (const mail of mails) {
				await transport(mail);
			}
			await finish({
				status: mails.length > 0 ? "sent" : "skipped",
				sentAt: new Date(),
				lastError: null,
			});
			if (mails.length > 0) {
				result.sent += 1;
			} else {
				result.skipped += 1;
			}
			if (row.kind === "booking_code" && row.otpChallengeId) {
				// The code is only kept encrypted until its email is out.
				await db
					.update(otpChallenges)
					.set({ codeEnc: null })
					.where(eq(otpChallenges.id, row.otpChallengeId));
			}
		} catch (error) {
			const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
			const delay =
				error instanceof PermanentMailError ? null : retryDelay(row.attempts, options.random);
			if (delay === null) {
				await finish({ status: "dead", lastError: message.slice(0, 500) });
				if (row.recipient === "patient") {
					await db
						.update(appointments)
						.set({ patientUnreachableAt: now })
						.where(eq(appointments.id, appointment.id));
				}
				result.dead += 1;
			} else {
				await finish({
					status: "pending",
					lastError: message.slice(0, 500),
					nextAttemptAt: new Date(options.nowMs + delay),
				});
				result.retried += 1;
			}
		}
	}
	return result;
}

/** Sends the rows a request just enqueued, after the response (the sweep catches up otherwise). */
export function drainLater(rt: BookingRuntime, ids: readonly string[]) {
	if (ids.length > 0) {
		rt.defer(() => processOutbox(rt.db, { nowMs: rt.nowMs(), ids }));
	}
}
