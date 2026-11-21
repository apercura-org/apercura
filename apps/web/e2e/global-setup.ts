import postgres from "postgres";
import { E2E_BOOKING_ENV } from "./booking-env";
import { refreshNextFree, seedBookingAgendas } from "./booking-seed";

/**
 * Clears Better Auth's rate-limit counters, so repeated local runs within an
 * hour do not hit the sign-up limit (the test server sees every request as the
 * same client), and opens the agendas the booking tests use (synthetic
 * practitioners only). Needs DATABASE_URL; without it these flows cannot run anyway.
 */
export default async function globalSetup() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		return;
	}
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await sql`delete from directory.auth_rate_limit`;
		await seedBookingAgendas(sql);
	} finally {
		await sql.end();
	}
	refreshNextFree({
		DATABASE_URL: url,
		APP_URL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
		...E2E_BOOKING_ENV,
	});
}
