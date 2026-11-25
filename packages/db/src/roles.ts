/**
 * Brings the login and password of Apercura's database roles in line with the environment,
 * right after the migrations. docker/compose.selfhost.yml passes the APERCURA_*_DB_PASSWORD
 * variables to its `migrate` service, which connects as the PostgreSQL superuser on every
 * deploy: rotating a password is changing the variable and redeploying, whatever the
 * orchestrator (Coolify, for one, does not mount docker/postgres/10-apercura-roles.sh, so that
 * first-start script cannot be relied on).
 *
 * Opt-in: with none of these variables set (Clever Cloud, Scalingo, any managed database where
 * the roles are created by hand), nothing runs. Behaviour per role, when its variable is:
 *
 * - empty or unset: the role is left as is. It is never switched to NOLOGIN, so a role enabled
 *   by hand (`ALTER ROLE … LOGIN PASSWORD`) keeps working when the variable is missing;
 * - set, the role exists and the migration user may alter it: `ALTER ROLE … WITH LOGIN
 *   PASSWORD …`, on every run (idempotent);
 * - set, but the role does not exist or the migration user may not alter it (no superuser, no
 *   CREATEROLE with ADMIN OPTION on it): a warning, and the migration still succeeds. The
 *   passwords are then managed outside Apercura, as on a managed database;
 * - set, allowed, and ALTER ROLE fails anyway: an error, and the migration fails. The app would
 *   otherwise start with a password the database does not know; failing here stops the deploy
 *   with a clear message instead of a crash loop on "password authentication failed".
 *
 * Passwords are never logged. They reach the server in the ALTER ROLE statement, as with psql,
 * and are hashed there (password_encryption, SCRAM by default): keep `log_statement` below
 * `ddl`. The privilege check above also keeps failing statements, which PostgreSQL logs in
 * full, out of the server log in the expected cases.
 */
import type { Sql } from "postgres";

export const ROLE_PASSWORD_VARIABLES = [
	{ role: "apercura_app", variable: "APERCURA_APP_DB_PASSWORD" },
	{ role: "apercura_etl", variable: "APERCURA_ETL_DB_PASSWORD" },
	{ role: "apercura_readonly", variable: "APERCURA_READONLY_DB_PASSWORD" },
	{ role: "apercura_jobs", variable: "APERCURA_JOBS_DB_PASSWORD" },
] as const;

export type RolePassword = { role: string; variable: string; password: string };

export type RolePasswordOutcome = {
	role: string;
	status: "applied" | "missing" | "not-permitted";
};

type Logger = Pick<Console, "warn">;

/** A double-quoted SQL identifier, as PostgreSQL's quote_ident() or format('%I'). */
export function quoteIdentifier(name: string): string {
	if (name.includes("\0")) throw new Error("An SQL identifier cannot contain a NUL character");
	return `"${name.replaceAll('"', '""')}"`;
}

/**
 * An SQL string literal, as PostgreSQL's quote_literal() or format('%L'): quotes doubled, and
 * with a backslash, the E'' form with backslashes doubled, so the result means the same
 * whatever standard_conforming_strings. The error never quotes the value.
 */
export function quoteLiteral(value: string): string {
	if (value.includes("\0")) throw new Error("An SQL string cannot contain a NUL character");
	const body = value.replaceAll("'", "''").replaceAll("\\", "\\\\");
	return value.includes("\\") ? `E'${body}'` : `'${body}'`;
}

export function alterRoleLoginPassword(role: string, password: string): string {
	return `ALTER ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`;
}

/** The roles whose password variable is set and not empty, in a fixed order. */
export function rolePasswordsFromEnv(env: Record<string, string | undefined>): RolePassword[] {
	return ROLE_PASSWORD_VARIABLES.flatMap(({ role, variable }) => {
		const password = env[variable];
		return password ? [{ role, variable, password }] : [];
	});
}

/** PostgreSQL's insufficient_privilege. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** syntax_error: its message may quote part of the statement, so it is never shown. */
const SYNTAX_ERROR = "42601";

function errorCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		return typeof error.code === "string" ? error.code : undefined;
	}
	return undefined;
}

/** The error's code and message, never the statement (postgres.js keeps it on the error). */
function describe(error: unknown): string {
	const code = errorCode(error);
	if (code === SYNTAX_ERROR) return `${code} syntax error`;
	const message = error instanceof Error ? error.message : "unknown error";
	return code ? `${code} ${message}` : message;
}

/**
 * Applies the passwords of the environment (see the module comment). Returns one outcome per
 * role whose variable is set; throws when an allowed ALTER ROLE fails.
 */
export async function applyRolePasswords(
	sql: Sql,
	env: Record<string, string | undefined>,
	log: Logger = console,
): Promise<RolePasswordOutcome[]> {
	const planned = rolePasswordsFromEnv(env);
	if (planned.length === 0) return [];

	// Superuser, or (PostgreSQL 16+) CREATEROLE with ADMIN OPTION on a non-superuser role.
	const rows = await sql<{ rolname: string; can_alter: boolean }[]>`
		SELECT r.rolname,
			me.rolsuper OR (
				me.rolcreaterole
				AND NOT r.rolsuper
				AND pg_has_role(me.oid, r.oid, 'MEMBER WITH ADMIN OPTION')
			) AS can_alter
		FROM pg_roles r
		CROSS JOIN pg_roles me
		WHERE me.rolname = current_user
			AND r.rolname IN ${sql(planned.map(({ role }) => role))}
	`;
	const canAlter = new Map(rows.map((row) => [row.rolname, row.can_alter]));

	const outcomes: RolePasswordOutcome[] = [];
	const failures: string[] = [];
	for (const { role, variable, password } of planned) {
		const allowed = canAlter.get(role);
		if (allowed === undefined) {
			log.warn(`Role ${role} does not exist: ${variable} is ignored`);
			outcomes.push({ role, status: "missing" });
			continue;
		}
		if (!allowed) {
			log.warn(`The migration user may not alter role ${role}: ${variable} is ignored`);
			outcomes.push({ role, status: "not-permitted" });
			continue;
		}
		try {
			await sql.unsafe(alterRoleLoginPassword(role, password), [], { prepare: false });
			outcomes.push({ role, status: "applied" });
		} catch (error) {
			if (errorCode(error) === INSUFFICIENT_PRIVILEGE) {
				log.warn(`The migration user may not alter role ${role}: ${variable} is ignored`);
				outcomes.push({ role, status: "not-permitted" });
			} else {
				failures.push(`${role} (${describe(error)})`);
			}
		}
	}
	if (failures.length > 0) {
		throw new Error(`Could not set the password of ${failures.join(", ")}`);
	}
	return outcomes;
}
