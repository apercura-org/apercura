import "server-only";
import { randomUUID } from "node:crypto";
import { isValidRpps } from "@apercura/core";
import type { Database } from "@apercura/db";
import { practitioners, removalRequests, reports, suppressions } from "@apercura/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { openText, sealText } from "../crypto/platform";

export class GdprError extends Error {
	constructor(readonly code: "NOT_FOUND" | "CLAIMED" | "NOT_PENDING") {
		super(code);
		this.name = "GdprError";
	}
}

export const REPORT_KINDS = ["wrong_info", "retired", "deceased", "impersonation"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

async function practitionerByRpps(db: Database, rpps: string) {
	if (!isValidRpps(rpps)) return null;
	const [row] = await db
		.select({
			id: practitioners.id,
			status: practitioners.status,
			claimStatus: practitioners.claimStatus,
			withheldAt: practitioners.withheldAt,
		})
		.from(practitioners)
		.where(
			and(
				eq(practitioners.country, "FR"),
				eq(practitioners.idScheme, "RPPS"),
				eq(practitioners.nationalId, rpps),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * GDPR art. 21 objection to an unclaimed page: the page is withheld at once
 * (not indexable, out of listings, searches and sitemaps, its content no
 * longer shown) and suppressed once an administrator has checked the request.
 * A claimed page can only be removed by its owner, from the practitioner space.
 * Returns the practitioner id to refresh.
 */
export async function requestRemoval(
	db: Database,
	input: { rpps: string; contact: string; message: string | null; locale: string },
) {
	const practitioner = await practitionerByRpps(db, input.rpps);
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
 * Confirms (suppression: the page answers 404 and never comes back with an
 * import) or rejects (the page is shown again) a removal request.
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
		await tx
			.update(removalRequests)
			.set({
				status: input.confirm ? "confirmed" : "rejected",
				decidedAt: new Date(),
				decidedBy: input.adminId,
				decisionReason: input.reason,
			})
			.where(eq(removalRequests.id, request.id));
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
			// Same effect as the import's applySuppressions, without waiting for it.
			await tx
				.update(practitioners)
				.set({ status: "suppressed", indexable: false, withheldAt: null })
				.where(eq(practitioners.id, practitioner.id));
			// Other pending requests on the same page are settled by this one.
			await tx
				.update(removalRequests)
				.set({ status: "confirmed", decidedAt: new Date(), decidedBy: input.adminId })
				.where(
					and(
						eq(removalRequests.practitionerId, practitioner.id),
						eq(removalRequests.status, "pending"),
					),
				);
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
		return {
			practitionerId: practitioner.id,
			contact: openText(request.contactEnc, "removal_requests", "contact_enc", request.id),
			locale: request.locale,
		};
	});
}

/**
 * The owner of a claimed page removes it (or restores it). A suppression,
 * like an objection, so the import never brings it back.
 */
export async function setOwnerRemoval(
	db: Database,
	input: { practitionerId: number; userId: string; removed: boolean },
) {
	return db.transaction(async (tx) => {
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
			await tx
				.update(practitioners)
				.set({ status: "suppressed", indexable: false })
				.where(eq(practitioners.id, practitioner.id));
		} else {
			// Only the owner's own removal can be undone here, never an objection.
			await tx.delete(suppressions).where(and(key, eq(suppressions.reason, "owner")));
			await tx.execute(sql`
				UPDATE directory.practitioners p SET status = 'active'
				WHERE p.id = ${practitioner.id} AND p.status = 'suppressed' AND NOT EXISTS (
					SELECT 1 FROM directory.suppressions s
					WHERE s.country = p.country AND s.id_scheme = p.id_scheme AND s.national_id = p.national_id
				)
			`);
		}
	});
}

// ---------------------------------------------------------------------------
// Error reports
// ---------------------------------------------------------------------------

/** Stores a "Report an error" message, encrypted. The RPPS is optional (from /donnees). */
export async function submitReport(
	db: Database,
	input: { rpps: string | null; kind: ReportKind; message: string; contact: string | null },
) {
	let practitionerId: number | null = null;
	if (input.rpps) {
		const practitioner = await practitionerByRpps(db, input.rpps);
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
