import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@apercura/db";
import { practitioners, removalRequests, reports, suppressions } from "@apercura/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { openText, sealText } from "../crypto/platform";
import { practitionerWhere } from "../practitioner-ref";
import { type Purge, purgeSuppressed } from "./minimise";

export class GdprError extends Error {
	constructor(readonly code: "NOT_FOUND" | "CLAIMED" | "NOT_PENDING") {
		super(code);
		this.name = "GdprError";
	}
}

export const REPORT_KINDS = ["wrong_info", "retired", "deceased", "impersonation"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** The practitioner a reference designates (`19999990013` in France, `w7983` in Austria). */
async function practitionerByRef(db: Database, ref: string) {
	const where = practitionerWhere(ref);
	if (!where) return null;
	const [row] = await db
		.select({
			id: practitioners.id,
			status: practitioners.status,
			claimStatus: practitioners.claimStatus,
			withheldAt: practitioners.withheldAt,
		})
		.from(practitioners)
		.where(where)
		.limit(1);
	return row ?? null;
}

/**
 * GDPR art. 21 objection to an unclaimed page: the page is withheld at once
 * (not indexable, out of listings, searches and sitemaps, its content no
 * longer shown) and suppressed once an administrator has checked the request:
 * then only the suppression stays (`purgeSuppressed`).
 * A claimed page can only be removed by its owner, from the practitioner space.
 * Returns the practitioner id to refresh.
 */
export async function requestRemoval(
	db: Database,
	input: { ref: string; contact: string; message: string | null; locale: string },
) {
	const practitioner = await practitionerByRef(db, input.ref);
	if (practitioner?.status !== "active") throw new GdprError("NOT_FOUND");
	if (practitioner.claimStatus === "claimed") throw new GdprError("CLAIMED");
	const id = randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(removalRequests).values({
			id,
			practitionerId: practitioner.id,
			contactEnc: sealText(input.contact, "removal_requests", "contact_enc", id),
			messageEnc: input.message
				? sealText(input.message, "removal_requests", "message_enc", id)
				: null,
			locale: input.locale,
		});
		await tx
			.update(practitioners)
			.set({ withheldAt: sql`coalesce(${practitioners.withheldAt}, now())`, indexable: false })
			.where(eq(practitioners.id, practitioner.id));
	});
	return { id, practitionerId: practitioner.id };
}

export async function removalQueue(db: Database) {
	return db.$client<
		{
			id: string;
			createdAt: Date;
			practitionerId: number;
			nationalId: string;
			slug: string;
			titleCode: string | null;
			firstName: string;
			lastName: string;
			claimStatus: string;
		}[]
	>`
		SELECT r.id, r.created_at AS "createdAt", p.id AS "practitionerId", p.national_id AS "nationalId",
			p.slug, p.title_code AS "titleCode", p.first_name AS "firstName", p.last_name AS "lastName",
			p.claim_status AS "claimStatus"
		FROM directory.removal_requests r
		JOIN directory.practitioners p ON p.id = r.practitioner_id
		WHERE r.status = 'pending'
		ORDER BY r.created_at
		LIMIT 200
	`;
}

/** Decrypts a removal request for an administrator, after the audit entry. */
export async function readRemovalRequest(
	db: Database,
	input: { id: string; adminId: string; headers?: Headers },
) {
	const [row] = await db.select().from(removalRequests).where(eq(removalRequests.id, input.id));
	if (!row) throw new GdprError("NOT_FOUND");
	await recordAudit(db, {
		actor: input.adminId,
		action: "removal_request.decrypt",
		subjectType: "removal_request",
		subjectId: row.id,
		headers: input.headers,
	});
	return {
		id: row.id,
		status: row.status,
		contact: openText(row.contactEnc, "removal_requests", "contact_enc", row.id),
		message: row.messageEnc
			? openText(row.messageEnc, "removal_requests", "message_enc", row.id)
			: null,
	};
}

/**
 * Confirms or rejects a removal request.
 * - Confirmed: a suppression (country, id scheme, national id, reason, who, when), then
 *   everything else about the practitioner is deleted in the same transaction, this request
 *   included (`purgeSuppressed`): the page answers 404, and the imports drop the person's lines
 *   before staging. `purge` carries the cache tags to expire (`afterPurge`).
 * - Rejected: the page is shown again; the request is kept until its retention.
 * The requester's address is decrypted first, for the decision email.
 */
export async function decideRemoval(
	db: Database,
	input: {
		id: string;
		adminId: string;
		confirm: boolean;
		reason: string | null;
		headers?: Headers;
	},
) {
	return db.transaction(async (tx) => {
		const [request] = await tx
			.select()
			.from(removalRequests)
			.where(eq(removalRequests.id, input.id))
			.for("update");
		if (!request) throw new GdprError("NOT_FOUND");
		if (request.status !== "pending") throw new GdprError("NOT_PENDING");
		const [practitioner] = await tx
			.select({
				id: practitioners.id,
				country: practitioners.country,
				idScheme: practitioners.idScheme,
				nationalId: practitioners.nationalId,
			})
			.from(practitioners)
			.where(eq(practitioners.id, request.practitionerId));
		if (!practitioner) throw new GdprError("NOT_FOUND");
		const contact = openText(request.contactEnc, "removal_requests", "contact_enc", request.id);
		await tx
			.update(removalRequests)
			.set({
				status: input.confirm ? "confirmed" : "rejected",
				decidedAt: new Date(),
				decidedBy: input.adminId,
				decisionReason: input.reason,
			})
			.where(eq(removalRequests.id, request.id));
		let purge: Purge | null = null;
		if (input.confirm) {
			await tx
				.insert(suppressions)
				.values({
					country: practitioner.country,
					idScheme: practitioner.idScheme,
					nationalId: practitioner.nationalId,
					reason: "objection",
					createdBy: input.adminId,
				})
				.onConflictDoNothing();
			// Only the suppression stays: the page, its data and every request on it (this one
			// and any other still pending) are deleted now, not at the next import.
			purge = await purgeSuppressed(tx, [practitioner.id]);
		} else {
			await tx.execute(sql`
				UPDATE directory.practitioners p SET withheld_at = NULL
				WHERE p.id = ${practitioner.id} AND NOT EXISTS (
					SELECT 1 FROM directory.removal_requests r
					WHERE r.practitioner_id = p.id AND r.status = 'pending'
				)
			`);
		}
		await recordAudit(tx, {
			actor: input.adminId,
			action: "removal_request.decide",
			subjectType: "removal_request",
			subjectId: request.id,
			headers: input.headers,
		});
		return { practitionerId: practitioner.id, contact, locale: request.locale, purge };
	});
}

/**
 * The owner of a claimed page removes it (or restores it). A suppression, like an objection,
 * and the same purge (`purgeSuppressed`): the places, qualifications, owner content and photo,
 * page, search entry and statistics are deleted at once. Only a bare row stays, for the owner's
 * space and agenda (their claim holds it), never published. Restoring deletes the suppression:
 * the next import brings the registry page back, which the owner completes again.
 * Returns the purge (cache tags to expire) on removal, null on restoring.
 */
export async function setOwnerRemoval(
	db: Database,
	input: { practitionerId: number; userId: string; removed: boolean },
) {
	return db.transaction(async (tx): Promise<Purge | null> => {
		const [practitioner] = await tx
			.select({
				id: practitioners.id,
				country: practitioners.country,
				idScheme: practitioners.idScheme,
				nationalId: practitioners.nationalId,
			})
			.from(practitioners)
			.where(eq(practitioners.id, input.practitionerId))
			.for("update");
		if (!practitioner) throw new GdprError("NOT_FOUND");
		const key = and(
			eq(suppressions.country, practitioner.country),
			eq(suppressions.idScheme, practitioner.idScheme),
			eq(suppressions.nationalId, practitioner.nationalId),
		);
		if (input.removed) {
			await tx
				.insert(suppressions)
				.values({
					country: practitioner.country,
					idScheme: practitioner.idScheme,
					nationalId: practitioner.nationalId,
					reason: "owner",
					createdBy: input.userId,
				})
				.onConflictDoNothing();
			return purgeSuppressed(tx, [practitioner.id]);
		}
		// Only the owner's own removal can be undone here, never an objection.
		await tx.delete(suppressions).where(and(key, eq(suppressions.reason, "owner")));
		await tx.execute(sql`
			UPDATE directory.practitioners p SET status = 'active'
			WHERE p.id = ${practitioner.id} AND p.status = 'suppressed' AND NOT EXISTS (
				SELECT 1 FROM directory.suppressions s
				WHERE s.country = p.country AND s.id_scheme = p.id_scheme AND s.national_id = p.national_id
			)
		`);
		return null;
	});
}

// ---------------------------------------------------------------------------
// Error reports
// ---------------------------------------------------------------------------

/**
 * Stores a "Report an error" message, encrypted. The practitioner reference is optional (from
 * the data page).
 */
export async function submitReport(
	db: Database,
	input: { ref: string | null; kind: ReportKind; message: string; contact: string | null },
) {
	let practitionerId: number | null = null;
	if (input.ref) {
		const practitioner = await practitionerByRef(db, input.ref);
		if (!practitioner) throw new GdprError("NOT_FOUND");
		practitionerId = practitioner.id;
	}
	const id = randomUUID();
	await db.insert(reports).values({
		id,
		practitionerId,
		kind: input.kind,
		contentEnc: sealText(
			JSON.stringify({ message: input.message, contact: input.contact }),
			"reports",
			"content_enc",
			id,
		),
	});
	return { id };
}

export async function reportQueue(db: Database, status: "open" | "resolved" | "dismissed") {
	const client = db.$client;
	// Open reports oldest first (a queue); closed ones newest first (a log).
	const order = status === "open" ? client`ASC` : client`DESC`;
	return client<
		{
			id: string;
			kind: string;
			status: string;
			createdAt: Date;
			practitionerId: number | null;
			nationalId: string | null;
			slug: string | null;
			titleCode: string | null;
			firstName: string | null;
			lastName: string | null;
		}[]
	>`
		SELECT r.id, r.kind, r.status, r.created_at AS "createdAt", p.id AS "practitionerId",
			p.national_id AS "nationalId", p.slug, p.title_code AS "titleCode",
			p.first_name AS "firstName", p.last_name AS "lastName"
		FROM directory.reports r
		LEFT JOIN directory.practitioners p ON p.id = r.practitioner_id
		WHERE r.status = ${status}
		ORDER BY r.created_at ${order}
		LIMIT 200
	`;
}

export async function readReport(
	db: Database,
	input: { id: string; adminId: string; headers?: Headers },
) {
	const [row] = await db.select().from(reports).where(eq(reports.id, input.id));
	if (!row) throw new GdprError("NOT_FOUND");
	await recordAudit(db, {
		actor: input.adminId,
		action: "report.decrypt",
		subjectType: "report",
		subjectId: row.id,
		headers: input.headers,
	});
	const content = JSON.parse(openText(row.contentEnc, "reports", "content_enc", row.id)) as {
		message: string;
		contact: string | null;
	};
	return { id: row.id, kind: row.kind, status: row.status, ...content };
}

export async function resolveReport(
	db: Database,
	input: {
		id: string;
		adminId: string;
		status: "resolved" | "dismissed";
		note: string | null;
		headers?: Headers;
	},
) {
	const updated = await db
		.update(reports)
		.set({
			status: input.status,
			resolvedAt: new Date(),
			resolvedBy: input.adminId,
			resolutionNote: input.note,
		})
		.where(and(eq(reports.id, input.id), eq(reports.status, "open")))
		.returning({ id: reports.id });
	if (updated.length === 0) throw new GdprError("NOT_PENDING");
	await recordAudit(db, {
		actor: input.adminId,
		action: "report.resolve",
		subjectType: "report",
		subjectId: input.id,
		headers: input.headers,
	});
}
