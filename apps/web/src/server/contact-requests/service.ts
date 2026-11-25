import "server-only";
import { randomUUID } from "node:crypto";
import { isValidRpps } from "@apercura/core";
import type { Database } from "@apercura/db";
import { practitionerContactRequests, practitioners } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "../audit";
import { openText, sealText } from "../crypto/platform";

/*
 * "I am this practitioner, contact me": the path for practitioners who cannot claim their page
 * with Pro Santé Connect, the registry email or a document. The request is stored encrypted for
 * the administrators' queue; an administrator writes back by email and moves it from `new` to
 * `contacted`, then `closed`. Nothing here creates an account or grants any access to a page:
 * a claim is still needed.
 */

export const CONTACT_REQUEST_STATUSES = ["new", "contacted", "closed"] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

export class ContactRequestError extends Error {
	constructor(readonly code: "NOT_FOUND" | "CLAIMED") {
		super(code);
		this.name = "ContactRequestError";
	}
}

export interface ContactRequestContent {
	name: string;
	email: string;
	phone: string | null;
	message: string;
}

const TABLE = "practitioner_contact_requests";
const COLUMN = "content_enc";

/**
 * Stores a request about the active page of `rpps`, encrypted. An unknown, inactive or withheld
 * page answers `NOT_FOUND`; a claimed page already has a verified owner: it answers `CLAIMED`, and
 * the form says to use the claim's contest instead.
 */
export async function submitContactRequest(
	db: Database,
	input: ContactRequestContent & { rpps: string; locale: string },
) {
	if (!isValidRpps(input.rpps)) throw new ContactRequestError("NOT_FOUND");
	const [practitioner] = await db
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
				eq(practitioners.nationalId, input.rpps),
			),
		)
		.limit(1);
	// A page withheld by an objection (GDPR art. 21) answers as if it did not exist: the
	// objection is not disclosed, and nothing new is collected about the page meanwhile.
	if (practitioner?.status !== "active" || practitioner.withheldAt !== null) {
		throw new ContactRequestError("NOT_FOUND");
	}
	if (practitioner.claimStatus === "claimed") throw new ContactRequestError("CLAIMED");
	const id = randomUUID();
	const content: ContactRequestContent = {
		name: input.name,
		email: input.email,
		phone: input.phone,
		message: input.message,
	};
	await db.insert(practitionerContactRequests).values({
		id,
		practitionerId: practitioner.id,
		contentEnc: sealText(JSON.stringify(content), TABLE, COLUMN, id),
		locale: input.locale,
	});
	return { id, practitionerId: practitioner.id };
}

/** The queue of one status: new requests oldest first (a queue), the others newest first. */
export async function contactRequestQueue(db: Database, status: ContactRequestStatus) {
	const client = db.$client;
	const order = status === "new" ? client`ASC` : client`DESC`;
	return client<
		{
			id: string;
			status: ContactRequestStatus;
			createdAt: Date;
			updatedAt: Date;
			practitionerId: number;
			nationalId: string;
			slug: string;
			titleCode: string | null;
			firstName: string;
			lastName: string;
			claimStatus: string;
		}[]
	>`
		SELECT r.id, r.status, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
			p.id AS "practitionerId", p.national_id AS "nationalId", p.slug,
			p.title_code AS "titleCode", p.first_name AS "firstName", p.last_name AS "lastName",
			p.claim_status AS "claimStatus"
		FROM directory.practitioner_contact_requests r
		JOIN directory.practitioners p ON p.id = r.practitioner_id
		WHERE r.status = ${status}
		ORDER BY r.created_at ${order}
		LIMIT 200
	`;
}

/** How many requests wait in each status (the tabs of the admin page). */
export async function contactRequestCounts(db: Database) {
	const rows = await db.$client<{ status: ContactRequestStatus; count: number }[]>`
		SELECT status, count(*)::integer AS count
		FROM directory.practitioner_contact_requests
		GROUP BY status
	`;
	const counts: Record<ContactRequestStatus, number> = { new: 0, contacted: 0, closed: 0 };
	for (const row of rows) counts[row.status] = row.count;
	return counts;
}

/** Decrypts one request for an administrator, after the audit entry. */
export async function readContactRequest(
	db: Database,
	input: { id: string; adminId: string; headers?: Headers },
) {
	const [row] = await db
		.select()
		.from(practitionerContactRequests)
		.where(eq(practitionerContactRequests.id, input.id));
	if (!row) throw new ContactRequestError("NOT_FOUND");
	await recordAudit(db, {
		actor: input.adminId,
		action: "contact_request.decrypt",
		subjectType: "contact_request",
		subjectId: row.id,
		headers: input.headers,
	});
	const content = JSON.parse(
		openText(row.contentEnc, TABLE, COLUMN, row.id),
	) as ContactRequestContent;
	return { id: row.id, status: row.status as ContactRequestStatus, ...content };
}

/** Moves a request to another status (audited). */
export async function setContactRequestStatus(
	db: Database,
	input: { id: string; adminId: string; status: ContactRequestStatus; headers?: Headers },
) {
	const updated = await db
		.update(practitionerContactRequests)
		.set({ status: input.status, handledBy: input.adminId, updatedAt: new Date() })
		.where(eq(practitionerContactRequests.id, input.id))
		.returning({ id: practitionerContactRequests.id });
	if (updated.length === 0) throw new ContactRequestError("NOT_FOUND");
	await recordAudit(db, {
		actor: input.adminId,
		action: "contact_request.status",
		subjectType: "contact_request",
		subjectId: input.id,
		headers: input.headers,
	});
}
