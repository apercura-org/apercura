import "server-only";
import type { Database } from "@apercura/db";
import { platformAuditEvents } from "@apercura/db/schema";
import { clientRateLimitKey } from "./rate-limit-key";

export type AuditAction =
	| "claim_document.decrypt"
	| "claim.approve"
	| "claim.reject"
	| "claim.phone_callback"
	| "report.decrypt"
	| "report.resolve"
	| "removal_request.decrypt"
	| "removal_request.decide"
	| "contact_request.decrypt"
	| "contact_request.status"
	| "account.export"
	| "account.delete"
	| "organization.close"
	| "organization.purge";

/**
 * Appends to the platform audit log (append-only for the app role). The IP is
 * stored as the same keyed hash the rate limits use, never in clear.
 */
export async function recordAudit(
	db: Pick<Database, "insert">,
	entry: {
		actor: string;
		action: AuditAction;
		subjectType: string;
		subjectId: string;
		headers?: Headers;
	},
) {
	await db.insert(platformAuditEvents).values({
		actor: entry.actor,
		action: entry.action,
		subjectType: entry.subjectType,
		subjectId: entry.subjectId,
		ipHash: entry.headers
			? clientRateLimitKey("audit", entry.headers).slice("audit:".length)
			: null,
	});
}
