/**
 * Least privilege of the database roles (migrations 0004, 0006, 0010, 0012,
 * 0013) against a real, migrated database (DATABASE_URL_TEST). Skipped when
 * the variable is unset; CI runs it in the `migrations` job.
 *
 * - apercura_etl (the open data import) reads no patient data, no account and
 *   no claim, and cannot rewrite what practitioners own.
 * - apercura_readonly (support, audits) writes nothing and reads no secret.
 * - apercura_app cannot rewrite or erase the audit logs.
 * - apercura_jobs (audit log retention) holds no table privilege: it may only
 *   call care.purge_audit_events(), which nobody else may call.
 * - practitioner sessions keep a truncated IP, unreadable by the read-only role.
 *
 * The secret-column check is a scan, not a list: a new column whose name looks
 * like a secret fails it until a migration keeps it from the read-only role.
 */
import { createDb, type Database } from "@apercura/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateIp } from "./auth/client-ip";

const url = process.env.DATABASE_URL_TEST;

const SCHEMAS = ["directory", "care"] as const;

/** Column names that hold secrets (tokens, hashes of tokens, keys, codes, passwords). */
const SECRET_COLUMN =
	/(^|_)(token|secret|password|salt|nonce|wrapped_dek|backup_codes|code_enc|code_hash|value)($|_)|_token_hash$|_key_hash$/;

/** Names that look secret but are not. */
const NOT_SECRET = new Set([
	"directory.account.access_token_expires_at",
	"directory.account.refresh_token_expires_at",
	"care.calendars.ics_token_created_at",
	// Import metadata (key/value pairs such as the last run's date).
	"directory.meta.value",
	// Fences two workers claiming the same email; it opens nothing.
	"care.outbox.lease_token",
]);

/** Tables the import may never read. */
const ETL_FORBIDDEN = [
	'directory."user"',
	"directory.session",
	"directory.account",
	"directory.verification",
	"directory.two_factor",
	"directory.passkey",
	"directory.organization",
	"directory.member",
	"directory.invitation",
	"directory.claims",
	"directory.claim_checks",
	"directory.claim_documents",
	"directory.removal_requests",
	"directory.reports",
	"directory.practitioner_contact_requests",
	"directory.admin_alerts",
	"directory.page_view_days",
	"directory.storage_deletions",
	"directory.landing_refresh_requests",
	"directory.platform_audit_events",
	"directory.rate_limits",
	"directory.auth_rate_limit",
];

describe.skipIf(!url)("database roles (database)", () => {
	let db: Database;
	let columns: { schema: string; table: string; column: string }[];
	let tables: { schema: string; table: string }[];

	beforeAll(async () => {
		db = createDb({ url: url as string, max: 2 });
		const sql = db.$client;
		columns = await sql<{ schema: string; table: string; column: string }[]>`
			SELECT c.table_schema AS schema, c.table_name AS table, c.column_name AS column
			FROM information_schema.columns c
			JOIN information_schema.tables t
				ON t.table_schema = c.table_schema AND t.table_name = c.table_name
			WHERE c.table_schema = ANY (${[...SCHEMAS]}::text[]) AND t.table_type = 'BASE TABLE'
		`;
		tables = [...new Map(columns.map((c) => [`${c.schema}.${c.table}`, c])).values()].map(
			({ schema, table }) => ({ schema, table }),
		);
	});

	afterAll(async () => {
		await db?.close();
	});

	const qualified = (schema: string, table: string) =>
		`${schema}.${table === "user" ? '"user"' : table}`;

	async function can(role: string, target: string, privilege: string) {
		const [row] = await db.$client<{ ok: boolean }[]>`
			SELECT has_table_privilege(${role}, ${target}, ${privilege}) AS ok
		`;
		return row?.ok === true;
	}

	async function canColumn(role: string, target: string, column: string, privilege: string) {
		const [row] = await db.$client<{ ok: boolean }[]>`
			SELECT has_column_privilege(${role}, ${target}, ${column}, ${privilege}) AS ok
		`;
		return row?.ok === true;
	}

	it("keeps the import out of patient data, accounts and claims", async () => {
		const [schema] = await db.$client<{ ok: boolean }[]>`
			SELECT has_schema_privilege('apercura_etl', 'care', 'USAGE') AS ok
		`;
		expect(schema?.ok).toBe(false);
		const readable: string[] = [];
		for (const { schema: name, table } of tables.filter((t) => t.schema === "care")) {
			if (await can("apercura_etl", qualified(name, table), "SELECT")) readable.push(table);
		}
		for (const target of ETL_FORBIDDEN) {
			for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
				if (await can("apercura_etl", target, privilege)) readable.push(`${target} ${privilege}`);
			}
		}
		expect(readable).toEqual([]);
	});

	it("never lets the import rewrite what practitioners own", async () => {
		for (const column of ["slug", "claim_status", "owner_org_id", "next_free_at"]) {
			expect(
				await canColumn("apercura_etl", "directory.practitioners", column, "UPDATE"),
				column,
			).toBe(false);
		}
		expect(await canColumn("apercura_etl", "directory.activities", "hidden", "UPDATE")).toBe(false);
		for (const table of ["practitioner_profiles", "practitioner_slug_aliases", "suppressions"]) {
			expect(await can("apercura_etl", `directory.${table}`, "UPDATE"), table).toBe(false);
		}
		// The warm-up's cursor: the import may only ask for a new walk.
		const warmup = "directory.cache_warmup";
		expect(await canColumn("apercura_etl", warmup, "restart_requested_at", "UPDATE")).toBe(true);
		for (const column of ["generation", "unit", "position", "completed_at"]) {
			expect(await canColumn("apercura_etl", warmup, column, "UPDATE"), column).toBe(false);
		}
		expect(await can("apercura_app", warmup, "UPDATE")).toBe(true);
	});

	it("lets the import and the app purge suppressed practitioners, never the read-only role", async () => {
		// A SECURITY DEFINER function (migration 0023): the import deletes through it what it may
		// not delete itself, only for national ids of directory.suppressions, which it may not write.
		const fn = "directory.purge_suppressed_practitioners(integer[])";
		const rows = await db.$client<{ role: string; ok: boolean }[]>`
			SELECT role, has_function_privilege(role, ${fn}, 'EXECUTE') AS ok
			FROM unnest(ARRAY['apercura_etl', 'apercura_app', 'apercura_readonly', 'apercura_jobs']) AS role
		`;
		expect(Object.fromEntries(rows.map((row) => [row.role, row.ok]))).toEqual({
			apercura_etl: true,
			apercura_app: true,
			apercura_readonly: false,
			apercura_jobs: false,
		});
		const [definer] = await db.$client<{ definer: boolean; config: string[] | null }[]>`
			SELECT prosecdef AS definer, proconfig AS config FROM pg_proc
			WHERE oid = ${fn}::regprocedure
		`;
		expect(definer?.definer).toBe(true);
		// A fixed search path: a caller's objects can never stand in for the directory's.
		expect(definer?.config).toContain("search_path=pg_catalog, pg_temp");
		expect(await can("apercura_etl", "directory.suppressions", "INSERT")).toBe(false);
	});

	it("gives the read-only role no write access at all", async () => {
		const writable: string[] = [];
		for (const { schema, table } of tables) {
			for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
				if (await can("apercura_readonly", qualified(schema, table), privilege)) {
					writable.push(`${schema}.${table} ${privilege}`);
				}
			}
		}
		expect(writable).toEqual([]);
	});

	it("keeps every secret column from the read-only role", async () => {
		const secrets = columns.filter(
			(c) => SECRET_COLUMN.test(c.column) && !NOT_SECRET.has(`${c.schema}.${c.table}.${c.column}`),
		);
		// The scan must see the known secrets, or it proves nothing.
		const names = secrets.map((c) => `${c.schema}.${c.table}.${c.column}`);
		expect(names).toEqual(
			expect.arrayContaining([
				"directory.session.token",
				"directory.account.password",
				"directory.two_factor.secret",
				"directory.verification.value",
				"directory.claim_checks.secret_hash",
				"care.organization_keys.wrapped_dek",
				"care.otp_challenges.code_enc",
				"care.appointments.manage_token_hash",
				"care.calendars.ics_token_hash",
			]),
		);
		const readable: string[] = [];
		for (const c of secrets) {
			if (await canColumn("apercura_readonly", qualified(c.schema, c.table), c.column, "SELECT")) {
				readable.push(`${c.schema}.${c.table}.${c.column}`);
			}
		}
		expect(readable).toEqual([]);
	});

	it("keeps both audit logs append-only for the app", async () => {
		for (const target of ["care.audit_events", "directory.platform_audit_events"]) {
			expect(await can("apercura_app", target, "INSERT"), target).toBe(true);
			for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
				expect(await can("apercura_app", target, `${privilege}`), `${target} ${privilege}`).toBe(
					false,
				);
			}
		}
	});

	it("hides the session's address and browser from the read-only role", async () => {
		for (const column of ["ip_address", "user_agent"]) {
			expect(
				await canColumn("apercura_readonly", "directory.session", column, "SELECT"),
				column,
			).toBe(false);
		}
		expect(await canColumn("apercura_readonly", "directory.session", "expires_at", "SELECT")).toBe(
			true,
		);
	});

	it("truncates IPs in SQL (migration 0016) exactly as the app does", async () => {
		const samples = [
			"203.0.113.77",
			"::ffff:198.51.100.9",
			"2001:db8:1:2::5",
			"2001:0DB8:0001:0002:0003:0004:0005:0006",
			"2001:db8::1",
			"2001:0:0:1::1",
			"0:db8:1::",
			"::1",
			"::ffff:c633:6409",
			"2001:db8:1::203.0.113.7",
			"fe80::1%eth0",
			"300.1.1.1",
			"junk",
		];
		const rows = await db.$client<{ ip: string; truncated: string | null }[]>`
			SELECT ip, directory.truncate_ip(ip) AS truncated FROM unnest(${samples}::text[]) AS ip
		`;
		expect(rows.map((row) => [row.ip, row.truncated])).toEqual(
			samples.map((ip) => [ip, truncateIp(ip)]),
		);
	});

	it("lets only apercura_jobs purge the audit logs, and nothing else", async () => {
		const callers = await db.$client<{ role: string; ok: boolean }[]>`
			SELECT r AS role, has_function_privilege(r, 'care.purge_audit_events(integer)', 'EXECUTE') AS ok
			FROM unnest(ARRAY['apercura_jobs', 'apercura_app', 'apercura_readonly', 'apercura_etl', 'public']) AS r
		`;
		expect(Object.fromEntries(callers.map((row) => [row.role, row.ok]))).toEqual({
			apercura_jobs: true,
			apercura_app: false,
			apercura_readonly: false,
			apercura_etl: false,
			public: false,
		});
		const granted: string[] = [];
		for (const { schema, table } of tables) {
			for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
				if (await can("apercura_jobs", qualified(schema, table), privilege)) {
					granted.push(`${schema}.${table} ${privilege}`);
				}
			}
		}
		expect(granted).toEqual([]);
		const [definer] = await db.$client<{ secdef: boolean; config: string[] | null }[]>`
			SELECT prosecdef AS secdef, proconfig AS config FROM pg_proc
			WHERE oid = 'care.purge_audit_events(integer)'::regprocedure
		`;
		expect(definer?.secdef).toBe(true);
		expect(definer?.config).toEqual(["search_path=pg_catalog, pg_temp"]);
	});

	it("leaves nothing to PUBLIC on the application schemas", async () => {
		const open = await db.$client<{ schema: string }[]>`
			SELECT nspname AS schema FROM pg_namespace
			WHERE nspname = ANY (${[...SCHEMAS]}::text[])
				AND (has_schema_privilege('public', oid, 'USAGE') OR has_schema_privilege('public', oid, 'CREATE'))
		`;
		expect(open).toEqual([]);
	});
});
