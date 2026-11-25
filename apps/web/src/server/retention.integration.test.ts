/**
 * Retention jobs against a real, migrated database (DATABASE_URL_TEST): error reports and
 * removal requests deleted months after they were closed, and both access logs purged after a
 * year through `care.purge_audit_events()`, which only `apercura_jobs` may call (the app role
 * stays append-only). Synthetic data only; skipped when the variable is unset.
 */
import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { auditEvents, platformAuditEvents, removalRequests, reports } from "@apercura/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolatedDatabase } from "~/test/isolated-database";
import { pgErrorCode } from "./booking/errors";
import { purgeAuditLogs, purgeClosedRequests } from "./retention";

const url = process.env.DATABASE_URL_TEST;

const DAY = 86_400_000;
const MONTH = 31 * DAY;

describe.skipIf(!url)("retention (database)", () => {
	let db: Database;
	// A database of its own: the purges delete the old reports, requests and access logs of every
	// file running alongside.
	const isolated = isolatedDatabase("retention");
	const run = randomUUID().slice(0, 8);
	const id = (name: string) => `${name}-${run}`;
	let practitionerId = 0;
	const now = Date.now();
	const ago = (ms: number) => new Date(now - ms);

	beforeAll(async () => {
		db = createDb({ url: await isolated.create(), max: 2 });
		const [person] = await db.$client<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, first_name, last_name, first_name_source,
				last_name_source, profession_code, slug)
			VALUES (${id("TESTRET")}, 'Camille', 'Exemple', 'CAMILLE', 'EXEMPLE', '10', ${id("camille-exemple-ret")})
			RETURNING id
		`;
		practitionerId = person?.id ?? 0;
	});

	afterAll(async () => {
		if (!db) return isolated.drop();
		await db.delete(reports).where(eq(reports.practitionerId, practitionerId));
		await db.delete(removalRequests).where(eq(removalRequests.practitionerId, practitionerId));
		await db.execute(sql`delete from directory.practitioners where id = ${practitionerId}`);
		await db.close();
		await isolated.drop();
	});

	it("deletes reports and removal requests once their retention after closure ends", async () => {
		const report = (name: string, status: string, resolvedAt: Date | null) => ({
			id: id(name),
			practitionerId,
			kind: "wrong_info",
			contentEnc: "enc:v1:synthetic",
			status,
			resolvedAt,
		});
		await db
			.insert(reports)
			.values([
				report("report-old", "resolved", ago(7 * MONTH)),
				report("report-dismissed", "dismissed", ago(7 * MONTH)),
				report("report-recent", "resolved", ago(5 * MONTH)),
				report("report-open", "open", null),
			]);
		// An open report is kept however old it is.
		await db
			.update(reports)
			.set({ createdAt: ago(24 * MONTH) })
			.where(eq(reports.id, id("report-open")));
		const removal = (name: string, status: string, decidedAt: Date | null) => ({
			id: id(name),
			practitionerId,
			status,
			contactEnc: "enc:v1:synthetic",
			decidedAt,
		});
		await db
			.insert(removalRequests)
			.values([
				removal("removal-old", "confirmed", ago(13 * MONTH)),
				removal("removal-rejected", "rejected", ago(13 * MONTH)),
				removal("removal-recent", "confirmed", ago(11 * MONTH)),
				removal("removal-pending", "pending", null),
			]);

		const first = await purgeClosedRequests(db, now, {});
		expect(first).toEqual({ reports: 2, removalRequests: 2, contactRequests: 0 });
		const kept = async () =>
			[
				...(await db
					.select({ id: reports.id })
					.from(reports)
					.where(eq(reports.practitionerId, practitionerId))),
				...(await db
					.select({ id: removalRequests.id })
					.from(removalRequests)
					.where(eq(removalRequests.practitionerId, practitionerId))),
			]
				.map((row) => row.id)
				.sort();
		expect(await kept()).toEqual(
			[id("report-recent"), id("report-open"), id("removal-recent"), id("removal-pending")].sort(),
		);

		// Shorter periods, as configured.
		await purgeClosedRequests(db, now, {
			REPORT_RETENTION_MONTHS: "4",
			REMOVAL_REQUEST_RETENTION_MONTHS: "10",
		});
		expect(await kept()).toEqual([id("report-open"), id("removal-pending")].sort());
	});

	it("purges both access logs after a year, as apercura_jobs only", async () => {
		const organizationId = id("org-audit");
		const audit = (name: string, createdAt: Date) => ({
			organizationId,
			actor: "system:test",
			action: "decrypt",
			purpose: name,
			subjectTable: "appointments",
			subjectIds: [],
			createdAt,
		});
		await db
			.insert(auditEvents)
			.values([audit("old", ago(13 * MONTH)), audit("recent", ago(11 * MONTH))]);
		await db.insert(platformAuditEvents).values([
			{
				actor: id("admin"),
				action: "report.decrypt",
				subjectType: "report",
				subjectId: id("old"),
				createdAt: ago(13 * MONTH),
			},
			{
				actor: id("admin"),
				action: "report.decrypt",
				subjectType: "report",
				subjectId: id("recent"),
				createdAt: ago(11 * MONTH),
			},
		]);
		const left = async () => ({
			care: (
				await db
					.select({ purpose: auditEvents.purpose })
					.from(auditEvents)
					.where(eq(auditEvents.organizationId, organizationId))
			).map((row) => row.purpose),
			platform: (
				await db
					.select({ subjectId: platformAuditEvents.subjectId })
					.from(platformAuditEvents)
					.where(inArray(platformAuditEvents.subjectId, [id("old"), id("recent")]))
			).map((row) => row.subjectId),
		});

		/** Runs `query` as `role` in its own transaction: its result, or the SQLSTATE it failed with. */
		const asRole = <T>(role: string, query: (tx: Database) => Promise<T>) =>
			db
				.transaction(async (tx) => {
					await tx.execute(sql.raw(`set local role ${role}`));
					return query(tx as unknown as Database);
				})
				.catch((error: unknown) => pgErrorCode(error));

		// The app role cannot delete, nor call the function: the job reports it and moves on.
		expect(
			await asRole("apercura_app", (tx) =>
				tx.execute(sql`select * from care.purge_audit_events(12)`),
			),
		).toBe("42501");
		expect(
			await asRole("apercura_app", (tx) =>
				tx.execute(sql`delete from care.audit_events where organization_id = ${organizationId}`),
			),
		).toBe("42501");
		expect(await asRole("apercura_app", (tx) => purgeAuditLogs(tx, {}))).toEqual({
			skipped: "role may not purge the audit logs: set DATABASE_URL_JOBS",
		});
		expect(await left()).toEqual({ care: ["old", "recent"], platform: [id("old"), id("recent")] });

		// Never fewer than 6 months, whoever calls.
		expect(
			await asRole("apercura_jobs", (tx) =>
				tx.execute(sql`select * from care.purge_audit_events(5)`),
			),
		).toBe("22023");

		// The jobs role reads no table itself, and purges through the function.
		expect(
			await asRole("apercura_jobs", (tx) =>
				tx.execute(sql`select count(*) from care.audit_events`),
			),
		).toBe("42501");
		const purged = (await asRole("apercura_jobs", (tx) => purgeAuditLogs(tx, {}))) as {
			months: number;
			auditEvents: number;
			platformAuditEvents: number;
		};
		expect(purged).toEqual({ months: 12, auditEvents: 1, platformAuditEvents: 1 });
		expect(await left()).toEqual({ care: ["recent"], platform: [id("recent")] });

		await db.delete(auditEvents).where(eq(auditEvents.organizationId, organizationId));
	});
});
