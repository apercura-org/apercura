import "server-only";

import { createSql, type Sql } from "@apercura/db";

/**
 * The app's database pool. Public pages read it only through the cached
 * functions in `server/queries`, so a page view that hits the cache never
 * touches the database.
 */
let pool: Sql | undefined;

export function getSql(): Sql {
	pool ??= createSql({
		max: Number(process.env.DATABASE_POOL_MAX ?? 5),
		idleTimeout: 30,
		connectTimeout: 10,
	});
	return pool;
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
