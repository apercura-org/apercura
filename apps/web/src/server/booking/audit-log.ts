import type { Database } from "@apercura/db";
import { auditEvents, user } from "@apercura/db/schema";
import { and, desc, eq, gte, lt } from "drizzle-orm";

const DAY_MS = 86_400_000;

/**
 * `audit.list`: who read or changed the practice's patient data, newest first (owners only).
 * The log is append-only; this reads it page by page with a keyset cursor (the row id).
 * It names people and purposes, never patients: rows carry appointment ids only.
 */
export async function listAuditEvents(
	db: Database,
	organizationId: string,
	input: { cursor?: number | null | undefined; limit: number; nowMs: number },
) {
	const rows = await db
		.select({
			id: auditEvents.id,
			createdAt: auditEvents.createdAt,
			actor: auditEvents.actor,
			userId: auditEvents.userId,
			userName: user.name,
			userEmail: user.email,
			action: auditEvents.action,
			purpose: auditEvents.purpose,
			subjectTable: auditEvents.subjectTable,
			subjectIds: auditEvents.subjectIds,
			fields: auditEvents.fields,
		})
		.from(auditEvents)
		.leftJoin(user, eq(user.id, auditEvents.userId))
		.where(
			and(
				eq(auditEvents.organizationId, organizationId),
				input.cursor ? lt(auditEvents.id, input.cursor) : undefined,
			),
		)
		.orderBy(desc(auditEvents.id))
		.limit(input.limit + 1);
	const page = rows.slice(0, input.limit);
	const [alert] = await db
		.select({ id: auditEvents.id, createdAt: auditEvents.createdAt, userName: user.name })
		.from(auditEvents)
		.leftJoin(user, eq(user.id, auditEvents.userId))
		.where(
			and(
				eq(auditEvents.organizationId, organizationId),
				eq(auditEvents.action, "alert"),
				gte(auditEvents.createdAt, new Date(input.nowMs - 30 * DAY_MS)),
			),
		)
		.orderBy(desc(auditEvents.id))
		.limit(1);
	return {
		events: page.map(({ subjectIds, ...row }) => ({ ...row, records: subjectIds.length })),
		nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
		/** The latest volume alert of the last 30 days, shown above the log. */
		latestAlert: alert ?? null,
	};
}
