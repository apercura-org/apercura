import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { localePath } from "~/i18n/paths";
import { siteOrigin } from "~/lib/site-url";
import { at } from "./booking/sql-time";
import { mailErrorSummary } from "./mail/error-summary";
import { ADMIN_ALERT_INTERVAL, retentionMonths } from "./retention-config";

/*
 * Alerts to the administrators when a queue gets new work: a claim sent for review, an "I am
 * this practitioner" contact request. Batched so they can never flood a mailbox: at most one
 * email per queue every ADMIN_ALERT_INTERVAL_MINUTES, counting what arrived since the previous
 * alert. The submission tries at once (the first one of a quiet period is alerted within
 * seconds); `jobs:tick admin-alerts` sends what arrived during the interval once it has passed.
 *
 * The email names no one: a count and a link to the queue, which sits behind the administrator's
 * second factor. Nothing is sent when no address is configured.
 */

export const ADMIN_ALERT_KINDS = ["claims", "contact_requests"] as const;
export type AdminAlertKind = (typeof ADMIN_ALERT_KINDS)[number];

type Env = Record<string, string | undefined>;

/** ADMIN_NOTIFY_EMAIL, else LEGAL_CONTACT_EMAIL, else nobody. */
export function adminAlertRecipient(env: Env = process.env): string | null {
	return env.ADMIN_NOTIFY_EMAIL?.trim() || env.LEGAL_CONTACT_EMAIL?.trim() || null;
}

export interface AdminAlertMessage {
	to: string;
	kind: AdminAlertKind;
	count: number;
	queueUrl: string;
}

export type AdminAlertOutcome =
	| { status: "sent"; count: number }
	| { status: "nothing" | "waiting" | "no_recipient" | "failed" };

/**
 * Queue of each kind: what counts as new work and where the administrators handle it. Instants
 * travel as PostgreSQL text (`timestamptz::text`), never as JS dates: those keep milliseconds
 * only, and the latest item would count again in the next alert.
 */
const QUEUES = {
	claims: {
		pending: (since: string | null) => sql`
			SELECT count(*)::integer AS count, max(submitted_at)::text AS latest
			FROM directory.claims
			WHERE status = 'in_review' AND submitted_at IS NOT NULL
				AND (${since}::timestamptz IS NULL OR submitted_at > ${since}::timestamptz)
		`,
		path: "/pro/admin/revendications",
	},
	contact_requests: {
		pending: (since: string | null) => sql`
			SELECT count(*)::integer AS count, max(created_at)::text AS latest
			FROM directory.practitioner_contact_requests
			WHERE status = 'new'
				AND (${since}::timestamptz IS NULL OR created_at > ${since}::timestamptz)
		`,
		path: "/pro/admin/contacts",
	},
} as const satisfies Record<AdminAlertKind, unknown>;

async function defaultSend(message: AdminAlertMessage) {
	const { sendNotice } = await import("./mail/notices");
	await sendNotice({
		to: message.to,
		// The publisher's own mailbox: the default (French) interface.
		locale: "fr",
		kind: message.kind === "claims" ? "adminClaims" : "adminContactRequests",
		values: { count: message.count },
		actionUrl: message.queueUrl,
	});
}

/**
 * Sends the alert of one queue when it has new work and the interval since the last alert has
 * passed. The slot is taken in a transaction (row lock on `directory.admin_alerts`), so two
 * submissions at the same moment send one email; when sending fails, the slot is given back so
 * the next tick tries again.
 */
export async function sendAdminAlert(
	db: Database,
	kind: AdminAlertKind,
	options: {
		nowMs?: number;
		env?: Env;
		send?: (message: AdminAlertMessage) => Promise<void>;
	} = {},
): Promise<AdminAlertOutcome> {
	const env = options.env ?? process.env;
	const to = adminAlertRecipient(env);
	if (!to) return { status: "no_recipient" };
	const nowMs = options.nowMs ?? Date.now();
	const intervalMinutes = retentionMonths(ADMIN_ALERT_INTERVAL, env);
	const queue = QUEUES[kind];

	const taken = await db.transaction(async (tx) => {
		await tx.execute(sql`
			INSERT INTO directory.admin_alerts (kind, last_sent_at, last_item_at)
			VALUES (${kind}, 'epoch'::timestamptz, NULL)
			ON CONFLICT (kind) DO NOTHING
		`);
		const [state] = await tx.execute<{
			last_sent_at: string;
			last_item_at: string | null;
			waiting: boolean;
		}>(sql`
			SELECT last_sent_at::text AS last_sent_at, last_item_at::text AS last_item_at,
				last_sent_at > ${at(nowMs)} - make_interval(mins => ${intervalMinutes}::integer) AS waiting
			FROM directory.admin_alerts WHERE kind = ${kind} FOR UPDATE
		`);
		if (!state) return null;
		if (state.waiting) return "waiting" as const;
		const [pending] = await tx.execute<{ count: number; latest: string | null }>(
			queue.pending(state.last_item_at),
		);
		const count = Number(pending?.count ?? 0);
		if (count === 0 || !pending?.latest) return "nothing" as const;
		await tx.execute(sql`
			UPDATE directory.admin_alerts
			SET last_sent_at = ${at(nowMs)}, last_item_at = ${pending.latest}::timestamptz
			WHERE kind = ${kind}
		`);
		return {
			count,
			previous: { lastSentAt: state.last_sent_at, lastItemAt: state.last_item_at },
		};
	});
	if (taken === null) return { status: "nothing" };
	if (taken === "waiting" || taken === "nothing") return { status: taken };

	try {
		await (options.send ?? defaultSend)({
			to,
			kind,
			count: taken.count,
			queueUrl: `${siteOrigin()}${localePath("fr", queue.path)}`,
		});
		return { status: "sent", count: taken.count };
	} catch (error) {
		console.error(`Admin alert (${kind}) failed: ${mailErrorSummary(error)}`);
		await db.execute(sql`
			UPDATE directory.admin_alerts
			SET last_sent_at = ${taken.previous.lastSentAt}::timestamptz,
				last_item_at = ${taken.previous.lastItemAt}::timestamptz
			WHERE kind = ${kind} AND last_sent_at = ${at(nowMs)}
		`);
		return { status: "failed" };
	}
}

/** Every queue's alert (`jobs:tick admin-alerts`). */
export async function sendAdminAlerts(
	db: Database,
	nowMs: number,
	options: { env?: Env; send?: (message: AdminAlertMessage) => Promise<void> } = {},
) {
	const outcomes = {} as Record<AdminAlertKind, AdminAlertOutcome>;
	for (const kind of ADMIN_ALERT_KINDS) {
		outcomes[kind] = await sendAdminAlert(db, kind, { ...options, nowMs });
	}
	return outcomes;
}

/** After a submission: tries the alert without ever failing the request. */
export async function alertAdminsQuietly(db: Database, kind: AdminAlertKind) {
	try {
		await sendAdminAlert(db, kind);
	} catch (error) {
		console.error(`Admin alert (${kind}) failed: ${mailErrorSummary(error)}`);
	}
}
