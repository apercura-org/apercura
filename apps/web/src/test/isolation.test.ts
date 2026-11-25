import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isIsolated, unscopedMaintenance, views } from "./isolation";

const src = fileURLToPath(new URL("..", import.meta.url));
const integrationFiles = readdirSync(src, { recursive: true, encoding: "utf8" })
	.filter((path) => path.endsWith(".integration.test.ts"))
	.sort();

describe("integration tests on the shared database", () => {
	it("finds the integration test files", () => {
		expect(integrationFiles.length).toBeGreaterThanOrEqual(10);
	});

	it.each(integrationFiles)(
		"%s runs no global maintenance outside a database of its own",
		(path) => {
			const violations = unscopedMaintenance(readFileSync(`${src}/${path}`, "utf8")).map(
				({ line, what }) => `${path}:${line} ${what}`,
			);
			// Fix: scope the call to the file's own rows, or open `isolatedDatabase()` (test/isolated-database.ts).
			expect(violations).toEqual([]);
		},
	);
});

describe("the guard", () => {
	const isolated = `
		const isolated = isolatedDatabase("booking");
		await purge(db, now);
	`;

	it("flags the global jobs, however they are imported", () => {
		const source = `
			await purge(db, clock.now);
			await expireLapsed(db, clock.now);
			const sent = await alerts.sendAdminAlerts(db, t0, { env, send });
			await retention.purgeClosedRequests(db, now);
			expect(await minimise.refreshLandingCounts(db, [])).toBe(true);
		`;
		expect(unscopedMaintenance(source).map((violation) => violation.what)).toEqual([
			"purge()",
			"expireLapsed()",
			"sendAdminAlerts()",
			"purgeClosedRequests()",
			"refreshLandingCounts()",
		]);
	});

	it("accepts the scoped forms and flags the unscoped ones", () => {
		const scoped = `
			await refreshAllNextFree(db, clock.now, [ids.practitionerA]);
			await finalizeClosures(db, closeAt, [p.orgId]);
			await processOutbox(db, { nowMs: clock.now, ids: rows.map((row) => row.id) });
			await processOutbox(db, { nowMs, ids });
		`;
		expect(unscopedMaintenance(scoped)).toEqual([]);
		const unscoped = `
			await refreshAllNextFree(db, clock.now);
			await finalizeClosures(db, closeAt, undefined);
			await processOutbox(db, { nowMs: clock.now, batchSize: 25 });
		`;
		expect(unscopedMaintenance(unscoped).map((violation) => violation.what)).toEqual([
			"refreshAllNextFree() without its scope",
			"finalizeClosures() without its scope",
			"processOutbox() without its scope",
		]);
	});

	it("flags whole-table SQL and deletes, not scoped ones", () => {
		const source = `
			await db.delete(adminAlerts);
			await db.delete(adminAlerts).where(eq(adminAlerts.kind, "claims"));
			await sql\`TRUNCATE directory.invalidation_outbox\`;
			await sql\`DELETE FROM directory.admin_alerts\`;
			await sql\`DELETE FROM directory.suppressions WHERE national_id = \${rpps}\`;
			await tx.execute(sql\`select directory.refresh_landing_pages(null)\`);
			for (const privilege of ["INSERT", "TRUNCATE"]) {}
			await sql\`SELECT has_function_privilege('care.purge_audit_events(integer)', 'EXECUTE')\`;
			await sql\`select * from care.purge_audit_events(\${months}::integer)\`;
		`;
		expect(unscopedMaintenance(source)).toEqual([
			{ line: 2, what: "db.delete(adminAlerts) without .where()" },
			{ line: 4, what: "TRUNCATE" },
			{ line: 5, what: "DELETE without WHERE" },
			{ line: 7, what: "directory.refresh_landing_pages()" },
			{ line: 10, what: "care.purge_audit_events()" },
		]);
	});

	it("ignores comments, strings and definitions", () => {
		const source = `
			// The booking suite calls purge(db, now) in a database of its own.
			/* expireLapsed(db, now) */
			it("runs purge() and drainOutbox()", async () => {});
			const label = \`purge(\${count})\`;
			async function purge(db) {}
		`;
		expect(unscopedMaintenance(source)).toEqual([]);
	});

	it("lets a file with a database of its own run any job", () => {
		expect(isIsolated(isolated)).toBe(true);
		expect(unscopedMaintenance(isolated)).toEqual([]);
		expect(isIsolated("// isolatedDatabase() would help here\nawait purge(db, now);")).toBe(false);
	});

	it("keeps offsets and line breaks in both views", () => {
		const expression = "$" + "{purge(db)}";
		const source = `const a = "x // y";\n// purge(db)\nconst b = \`t ${expression} u\`;`;
		const { code, sql } = views(source);
		expect(code).toHaveLength(source.length);
		expect(sql).toHaveLength(source.length);
		expect(code.split("\n")).toHaveLength(3);
		expect(code).toContain(expression);
		expect(code).not.toContain("x // y");
		expect(sql).toContain("x // y");
		expect(sql).not.toContain("// purge");
	});
});
