import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { at } from "./booking/sql-time";
import {
	AUDIT_LOG_RETENTION,
	REMOVAL_REQUEST_RETENTION,
	REPORT_RETENTION,
	retentionMonths,
} from "./retention-config";

/*
 * Retention of what the platform keeps about requests and accesses, run by `jobs:tick` (like the
 * claim-document purge, 30 days after a decision, in ./claims/service.ts). Periods in
 * ./retention-config.ts; the privacy policy states the defaults.
 */

const BATCH = 500;

/**
 * Deletes error reports `REPORT_RETENTION_MONTHS` after they were resolved or dismissed, and
 * removal requests `REMOVAL_REQUEST_RETENTION_MONTHS` after their decision, 500 of each at a
 * time. Requests still waiting are kept. A confirmed objection keeps its effect: the
 * suppression (the RPPS only) stays as long as the directory is published.
 */
export async function purgeClosedRequests(
	db: Database,
	nowMs: number,
	env: Record<string, string | undefined> = process.env,
) {
	const reportMonths = retentionMonths(REPORT_RETENTION, env);
	const removalMonths = retentionMonths(REMOVAL_REQUEST_RETENTION, env);
	const reports = await db.execute(sql`
		delete from directory.reports where id in (
			select id from directory.reports
			where status in ('resolved', 'dismissed') and resolved_at is not null
				and resolved_at <= ${at(nowMs)} - make_interval(months => ${reportMonths}::integer)
			order by resolved_at
			limit ${BATCH}
		)
	`);
	const removals = await db.execute(sql`
		delete from directory.removal_requests where id in (
			select id from directory.removal_requests
			where status in ('confirmed', 'rejected') and decided_at is not null
				and decided_at <= ${at(nowMs)} - make_interval(months => ${removalMonths}::integer)
			order by decided_at
			limit ${BATCH}
		)
	`);
	return { reports: reports.count ?? 0, removalRequests: removals.count ?? 0 };
}

/**
 * Deletes the rows of both access logs (`care.audit_events`, `directory.platform_audit_events`)
 * older than `AUDIT_LOG_RETENTION_MONTHS`, through `care.purge_audit_events()` (migration 0016):
 * the app role is append-only on them and may not call it. Only `apercura_jobs`
 * (DATABASE_URL_JOBS) or the tables' owner may; any other role gets `skipped` instead of an
 * error, so the rest of the tick runs.
 */
export async function purgeAuditLogs(
	db: Pick<Database, "execute">,
	env: Record<string, string | undefined> = process.env,
) {
	const months = retentionMonths(AUDIT_LOG_RETENTION, env);
	const [allowed] = await db.execute<{ ok: boolean }>(sql`
		select has_function_privilege('care.purge_audit_events(integer)', 'EXECUTE') as ok
	`);
	if (!allowed?.ok) {
		return { skipped: "role may not purge the audit logs: set DATABASE_URL_JOBS" as const };
	}
	const [row] = await db.execute<{ care_rows: string | number; platform_rows: string | number }>(
		sql`select care_rows, platform_rows from care.purge_audit_events(${months}::integer)`,
	);
	return {
		months,
		auditEvents: Number(row?.care_rows ?? 0),
		platformAuditEvents: Number(row?.platform_rows ?? 0),
	};
}
