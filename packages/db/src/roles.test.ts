import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import {
	alterRoleLogin,
	quoteIdentifier,
	quoteLiteral,
	roleEnvValue,
	rolesToSet,
	syncRoleLogins,
} from "./roles";

describe("quoteLiteral", () => {
	it.each([
		["plain", "'plain'"],
		["it's", "'it''s'"],
		["back\\slash", "E'back\\\\slash'"],
		["o'k\\", "E'o''k\\\\'"],
		["'; DROP ROLE postgres; --", "'''; DROP ROLE postgres; --'"],
		["", "''"],
	])("quotes %j as quote_literal() would", (value, expected) => {
		expect(quoteLiteral(value)).toBe(expected);
	});

	it("refuses a NUL character without quoting the value", () => {
		expect(() => quoteLiteral("secret\0")).toThrow(/NUL/);
		expect(() => quoteLiteral("secret\0")).not.toThrow(/secret/);
	});
});

describe("quoteIdentifier", () => {
	it("double-quotes and doubles inner quotes", () => {
		expect(quoteIdentifier("apercura_app")).toBe('"apercura_app"');
		expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
	});
});

describe("alterRoleLogin", () => {
	it("builds a statement with a quote and a backslash in the password", () => {
		expect(alterRoleLogin("apercura_app", "a'b\\c")).toBe(
			"ALTER ROLE \"apercura_app\" WITH LOGIN PASSWORD E'a''b\\\\c'",
		);
	});
});

describe("rolesToSet", () => {
	it("keeps the roles whose variable is set and not empty", () => {
		const env = {
			APERCURA_APP_DB_PASSWORD: "app",
			APERCURA_ETL_DB_PASSWORD: "etl",
			APERCURA_READONLY_DB_PASSWORD: "",
		};
		expect(rolesToSet(env)).toEqual(["apercura_app", "apercura_etl"]);
		expect(roleEnvValue("apercura_app", env)).toBe("app");
		expect(roleEnvValue("apercura_readonly", env)).toBeUndefined();
		expect(rolesToSet({})).toEqual([]);
	});
});

/** A stand-in for postgres.js: the privilege query returns `rows`, `unsafe` records. */
function fakeSql(
	rows: { rolname: string; can_alter: boolean }[],
	unsafe: (statement: string) => Promise<unknown> = async () => [],
) {
	const statements: string[] = [];
	const queries: string[] = [];
	const sql = (first: unknown) => {
		if (Array.isArray(first) && "raw" in first) {
			queries.push(first.join("?"));
			return Promise.resolve(rows);
		}
		return first; // sql(array): the IN list
	};
	Object.assign(sql, {
		unsafe: (statement: string) => {
			statements.push(statement);
			return unsafe(statement);
		},
	});
	return { sql: sql as unknown as Sql, statements, queries };
}

const quiet = () => ({ warn: vi.fn() });

describe("syncRoleLogins", () => {
	it("does nothing, not even a query, without any password variable", async () => {
		const { sql, statements, queries } = fakeSql([]);
		expect(await syncRoleLogins(sql, { APERCURA_JOBS_DB_PASSWORD: "" }, quiet())).toEqual([]);
		expect(queries).toEqual([]);
		expect(statements).toEqual([]);
	});

	it("applies LOGIN PASSWORD to each role it may alter, never NOLOGIN", async () => {
		const { sql, statements } = fakeSql([
			{ rolname: "apercura_app", can_alter: true },
			{ rolname: "apercura_jobs", can_alter: true },
		]);
		const outcomes = await syncRoleLogins(
			sql,
			{ APERCURA_APP_DB_PASSWORD: "p'w", APERCURA_JOBS_DB_PASSWORD: "jobs" },
			quiet(),
		);
		expect(outcomes).toEqual([
			{ role: "apercura_app", status: "applied" },
			{ role: "apercura_jobs", status: "applied" },
		]);
		expect(statements).toEqual([
			"ALTER ROLE \"apercura_app\" WITH LOGIN PASSWORD 'p''w'",
			"ALTER ROLE \"apercura_jobs\" WITH LOGIN PASSWORD 'jobs'",
		]);
		expect(statements.join()).not.toMatch(/NOLOGIN/);
	});

	it("warns without failing when a role is missing or may not be altered", async () => {
		const log = quiet();
		const { sql, statements } = fakeSql([{ rolname: "apercura_etl", can_alter: false }]);
		const outcomes = await syncRoleLogins(
			sql,
			{ APERCURA_APP_DB_PASSWORD: "app-secret", APERCURA_ETL_DB_PASSWORD: "etl-secret" },
			log,
		);
		expect(outcomes).toEqual([
			{ role: "apercura_app", status: "missing" },
			{ role: "apercura_etl", status: "not-permitted" },
		]);
		expect(statements).toEqual([]);
		expect(log.warn).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/secret/);
	});

	it("treats insufficient_privilege from ALTER ROLE as a warning", async () => {
		const log = quiet();
		const { sql } = fakeSql([{ rolname: "apercura_app", can_alter: true }], async () => {
			throw Object.assign(new Error("permission denied to alter role"), { code: "42501" });
		});
		expect(await syncRoleLogins(sql, { APERCURA_APP_DB_PASSWORD: "x" }, log)).toEqual([
			{ role: "apercura_app", status: "not-permitted" },
		]);
		expect(log.warn).toHaveBeenCalledOnce();
	});

	it("fails on any other error, after trying every role, without the password", async () => {
		const { sql, statements } = fakeSql(
			[
				{ rolname: "apercura_app", can_alter: true },
				{ rolname: "apercura_etl", can_alter: true },
			],
			async (statement) => {
				if (statement.includes("apercura_app")) {
					throw Object.assign(new Error('syntax error at or near "hunter2"'), {
						code: "42601",
						query: statement,
					});
				}
				return [];
			},
		);
		const run = syncRoleLogins(
			sql,
			{ APERCURA_APP_DB_PASSWORD: "hunter2", APERCURA_ETL_DB_PASSWORD: "etl" },
			quiet(),
		);
		await expect(run).rejects.toThrow("Could not set the login of apercura_app (42601");
		await expect(run).rejects.not.toThrow(/hunter2/);
		expect(statements).toHaveLength(2);
	});
});
