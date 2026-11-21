import "server-only";
import { createDb, type Database } from "@apercura/db";

const globalForDb = globalThis as typeof globalThis & { apercuraDb?: Database };

/**
 * The app's connection pool, created on first use (so builds and pages that
 * never query do not need DATABASE_URL) and kept across hot reloads.
 */
export function getDb(): Database {
	globalForDb.apercuraDb ??= createDb();
	return globalForDb.apercuraDb;
}
