import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end and accessibility checks.
 *
 * - `production`: the built app (`next start`). Run `bun run test:e2e` from the
 *   repository root, which builds first.
 * - `development`: `next dev`, only for the component gallery (`/_ui`), which
 *   production builds answer with 404.
 */
const PROD_PORT = 3100;
const DEV_PORT = 3101;
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
			use: { baseURL: `http://localhost:${PROD_PORT}` },
		},
		{
			name: "development",
			testMatch: /gallery\.spec\.ts/,
			use: { baseURL: `http://localhost:${DEV_PORT}` },
		},
	],
	webServer: [
		{
			command: `bun run start --port ${PROD_PORT}`,
			url: `http://localhost:${PROD_PORT}/`,
			env: { SKIP_ENV_VALIDATION: "1" },
			reuseExistingServer: !isCI,
			timeout: 60_000,
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
