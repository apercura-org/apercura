import "server-only";
import { createDb, type Database, type Sql } from "@apercura/db";

const globalForDb = globalThis as typeof globalThis & { apercuraDb?: Database };

/**
 * The app's connection pool, created on first use (so builds and pages that
 * never query do not need DATABASE_URL) and kept across hot reloads. Auth and
 * the account tables go through Drizzle; the directory's set-based queries use
 * the same pool through `getSql()`. Public pages read it only through the
 * cached functions in `server/queries`, so a cached page view never touches it.
 */
export function getDb(): Database {
	globalForDb.apercuraDb ??= createDb({
		max: Number(process.env.DATABASE_POOL_MAX ?? 10),
		idleTimeout: 30,
		connectTimeout: 10,
	});
	return globalForDb.apercuraDb;
}

/** The same pool as a postgres.js tagged template, for SQL written by hand. */
export function getSql(): Sql {
	return getDb().$client;
}

/**
 * True when the database can be reached. Used by `generateStaticParams`: a
 * build without a database (CI lint job, Docker image build) prerenders
 * nothing from data and every page is generated on its first request.
 */
export async function databaseAvailable(): Promise<boolean> {
	if (!process.env.DATABASE_URL) return false;
	try {
		await getSql()`SELECT 1`;
		return true;
	} catch {
		return false;
	}
}

/**
 * True when a database is configured. Cached queries of pages without URL
 * params (hubs, `/donnees`) check it first: a build without a database then
 * prerenders an honest empty state with a short cache life (`minutes`), which
 * the first requests after deployment replace with real data.
 */
export function hasDatabaseUrl(): boolean {
	return Boolean(process.env.DATABASE_URL);
}
