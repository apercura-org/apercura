/**
 * Applies pending SQL migrations from `./drizzle`.
 * Uses DATABASE_URL_MIGRATE (a role allowed to run DDL) and falls back to DATABASE_URL.
 */
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL_MIGRATE or DATABASE_URL must be set");
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

try {
	await migrate(drizzle({ client }), { migrationsFolder });
	console.log("Migrations applied");
} catch (error) {
	console.error("Migration failed:", error);
	process.exitCode = 1;
} finally {
	await client.end();
}
