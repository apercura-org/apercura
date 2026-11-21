import postgres from "postgres";

/**
 * Clears the rate-limit counters, so repeated local runs within an hour do
 * not hit the sign-up, claim or public form limits (the test server sees
 * every request as the same client). Needs DATABASE_URL; without it the auth
 * flow cannot run anyway.
 */
export default async function globalSetup() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		return;
	}
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await sql`delete from directory.auth_rate_limit`;
		await sql`
			delete from directory.rate_limits
			where key like 'claim:%' or key like 'claim-link:%' or key like 'removal:%'
				or key like 'report:%' or key like 'user:%'
		`;
	} finally {
		await sql.end();
	}
}
