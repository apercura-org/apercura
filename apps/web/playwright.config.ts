import { defineConfig, devices } from "@playwright/test";
import { E2E_BOOKING_ENV } from "./e2e/booking-env";

/**
 * End-to-end and accessibility checks.
 *
 * - `production`: the built app (`next start`). Run `bun run test:e2e` from the
 *   repository root, which builds first.
 * - `development`: `next dev`, only for the component gallery (`/_ui`), which
 *   production builds answer with 404.
 *
 * The auth flow (`auth.spec.ts`) needs PostgreSQL with migrations applied
 * (DATABASE_URL) and Mailpit (SMTP_URL, MAILPIT_URL for its API), e.g.
 * `docker compose -f docker/compose.yml up -d && bun run db:migrate`.
 * The claim and page specs also need the synthetic fixtures imported, MinIO
 * (S3_*), the encryption keys (ENCRYPTION_KEYS, ENCRYPTION_ACTIVE_KEY) and,
 * in the test process, DATABASE_URL to prepare their practitioners. Pro Santé
 * Connect is the local mock started below.
 * Booking (`booking.spec.ts`, `manage.spec.ts`) needs the synthetic fixtures too
 * (`bun run etl:fr --source-dir packages/etl/fixtures/fr --offline`): the global
 * setup opens agendas for four fictitious practitioners (`e2e/booking-seed.ts`).
 * E2E_PORT moves both servers (production on it, development on the next one).
 */
const PROD_PORT = Number(process.env.E2E_PORT ?? 3100);
const DEV_PORT = PROD_PORT + 1;
/** The mock Pro Santé Connect provider (e2e/mock-psc.ts), never the real one. */
const PSC_PORT = PROD_PORT + 90;
const PSC = {
	PSC_ISSUER: `http://localhost:${PSC_PORT}`,
	PSC_CLIENT_ID: "apercura-e2e",
	PSC_CLIENT_SECRET: "e2e-only-secret-not-used-anywhere-else",
};
const PROD_URL = `http://localhost:${PROD_PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 1 : 0,
	reporter: isCI ? [["github"], ["list"]] : "list",
	timeout: 60_000,
	use: {
		...devices["Desktop Chrome"],
		// French is the default locale; without this the locale detection would redirect to /en.
		locale: "fr-FR",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "production",
			testIgnore: /gallery\.spec\.ts/,
			use: { baseURL: PROD_URL },
		},
		{
			name: "development",
			testMatch: /gallery\.spec\.ts/,
			use: { baseURL: `http://localhost:${DEV_PORT}` },
		},
	],
	globalSetup: "./e2e/global-setup.ts",
	webServer: [
		{
			command: `bun run start --port ${PROD_PORT}`,
			url: `${PROD_URL}/`,
			env: {
				SKIP_ENV_VALIDATION: "1",
				// Auth checks the request origin against these.
				APP_URL: PROD_URL,
				BETTER_AUTH_URL: PROD_URL,
				// Booking tests send X-Forwarded-For so each one has its own rate-limit bucket;
				// requests without it share one bucket, as with no proxy.
				TRUSTED_PROXY_COUNT: "1",
				...PSC,
				...E2E_BOOKING_ENV,
			},
			reuseExistingServer: !isCI,
			timeout: 60_000,
		},
		{
			command: "bun e2e/mock-psc.ts",
			url: `${PSC.PSC_ISSUER}/.well-known/openid-configuration`,
			env: { PSC_MOCK_PORT: String(PSC_PORT), ...PSC },
			reuseExistingServer: !isCI,
			timeout: 30_000,
		},
		{
			command: `bun run dev --port ${DEV_PORT}`,
			url: `http://localhost:${DEV_PORT}/_ui`,
			env: { SKIP_ENV_VALIDATION: "1" },
			reuseExistingServer: !isCI,
			timeout: 180_000,
		},
	],
});
