/**
 * Waits until the database accepts connections (DATABASE_WAIT_SECONDS, see ./wait.ts), applies
 * pending SQL migrations from `./drizzle`, then the role passwords of the environment when any
 * is set (self-hosting; see ./roles.ts). On a new database the migrations create the roles
 * without login (0004, 0016) and the passwords step gives them their login.
 * Uses DATABASE_URL_MIGRATE (a role allowed to run DDL) and falls back to DATABASE_URL.
 */
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { syncRoleLogins } from "./roles";
import { describeTarget, waitForDatabase, waitSeconds } from "./wait";

const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL_MIGRATE or DATABASE_URL must be set");
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

try {
	await waitForDatabase(() => client`SELECT 1`, {
		target: describeTarget(url),
		timeoutSeconds: waitSeconds(process.env.DATABASE_WAIT_SECONDS),
	});
} catch (error) {
	console.error("Cannot connect to the database:", error instanceof Error ? error.message : error);
	await client.end();
	process.exit(1);
}

try {
	await migrate(drizzle({ client }), { migrationsFolder });
	console.log("Migrations applied");
	try {
		const outcomes = await syncRoleLogins(client, process.env);
		const applied = outcomes.filter(({ status }) => status === "applied").map(({ role }) => role);
		if (applied.length > 0) console.log(`Role passwords applied: ${applied.join(", ")}`);
	} catch (error) {
		// Only the message: it names the roles and the database error, never a password.
		console.error("Role passwords failed:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
} catch (error) {
	console.error("Migration failed:", error);
	process.exitCode = 1;
} finally {
	await client.end();
}
