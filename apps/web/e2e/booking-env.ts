/**
 * Online booking on the test server (`booking.spec.ts`, `manage.spec.ts`). Keys already in the
 * environment win (CI draws ENCRYPTION_KEYS per run, and the claim specs encrypt with them in the
 * test process); otherwise test-only constants, never used anywhere else, are set for both the
 * server and the test process. The e2e database is synthetic and thrown away. Mail goes to
 * SMTP_URL (Mailpit), read back through MAILPIT_URL.
 */
process.env.ENCRYPTION_KEYS ??= "1:ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMDAwMDAwMDA=";
process.env.ENCRYPTION_ACTIVE_KEY ??= "1";
process.env.BLIND_INDEX_KEY ??= "ZTJlLW9ubHktYmxpbmQtaW5kZXgta2V5LTAwMDAwMDA=";

export const E2E_BOOKING_ENV = {
	FEATURE_BOOKING: "true",
	ENCRYPTION_KEYS: process.env.ENCRYPTION_KEYS,
	ENCRYPTION_ACTIVE_KEY: process.env.ENCRYPTION_ACTIVE_KEY,
	BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY,
	ALTCHA_HMAC_KEY: "e2e-only-altcha-key-not-used-anywhere-else",
	REVALIDATE_SECRET: "e2e-only-revalidate-secret-not-used-elsewhere",
	MAIL_FROM: process.env.MAIL_FROM ?? "Apercura <no-reply@localhost>",
};
