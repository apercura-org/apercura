/**
 * Runs once when the server process starts. `next.config.ts` loads the root
 * `.env`, but only into the process that evaluates the config; Next.js does not
 * load it again for the server that renders pages and answers API routes
 * (DATABASE_URL, the auth secret, SMTP). Read it here for that process.
 *
 * In production it refuses to start with an SMTP_URL that does not require TLS
 * or a server that cannot do STARTTLS (unless SMTP_ALLOW_INSECURE=true).
 *
 * With online booking enabled, the server then refuses to start unless the
 * overlap constraint of `care.appointments` exists (a schema created with
 * `drizzle-kit push` lacks it, and two patients could book one slot).
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { loadRootEnv } = await import("./server/load-root-env");
		await loadRootEnv();
		// Production sends mail over TLS only (see server/mail/smtp-options.ts), even when the
		// environment validation is skipped.
		const { assertSmtpTls } = await import("./server/mail/smtp-check");
		await assertSmtpTls(process.env);
		const { bookingEnabled } = await import("./server/booking/config");
		if (bookingEnabled() && process.env.DATABASE_URL) {
			const { createSql } = await import("@apercura/db");
			const { assertBookingConstraints } = await import("./server/booking/constraints");
			const sql = createSql({ max: 1, connectTimeout: 10 });
			try {
				await assertBookingConstraints(sql);
			} finally {
				await sql.end();
			}
		}
	}
}
