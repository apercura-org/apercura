/**
 * Online booking on the test server (`booking.spec.ts`, `manage.spec.ts`). Test-only keys, never
 * used anywhere else: the e2e database is synthetic and thrown away. Mail goes to SMTP_URL
 * (Mailpit), read back through MAILPIT_URL.
 */
export const E2E_BOOKING_ENV = {
	FEATURE_BOOKING: "true",
	ENCRYPTION_KEYS: "1:ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMDAwMDAwMDA=",
	ENCRYPTION_ACTIVE_KEY: "1",
	BLIND_INDEX_KEY: "ZTJlLW9ubHktYmxpbmQtaW5kZXgta2V5LTAwMDAwMDA=",
	ALTCHA_HMAC_KEY: "e2e-only-altcha-key-not-used-anywhere-else",
	REVALIDATE_SECRET: "e2e-only-revalidate-secret-not-used-elsewhere",
	MAIL_FROM: process.env.MAIL_FROM ?? "Apercura <no-reply@localhost>",
};
