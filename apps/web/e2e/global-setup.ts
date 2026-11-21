import postgres from "postgres";

/**
 * Clears Better Auth's rate-limit counters, so repeated local runs within an
 * hour do not hit the sign-up limit (the test server sees every request as the
 * same client). Needs DATABASE_URL; without it the auth flow cannot run anyway.
 */
export default async function globalSetup() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		return;
	}
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await sql`delete from directory.auth_rate_limit`;
	} finally {
		await sql.end();
	}
}
