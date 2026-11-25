import { defineConfig } from "vitest/config";

/** Server and database of a connection URL, to compare two of them. */
function databaseOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
	} catch {
		return null;
	}
}

// The import tests truncate and swap whole tables. `bun run test` runs them alongside the web
// integration tests, which would fail at random on the same database (issue #123).
const etl = databaseOf(process.env.ETL_TEST_DATABASE_URL);
if (etl && etl === databaseOf(process.env.DATABASE_URL_TEST)) {
	throw new Error(
		"ETL_TEST_DATABASE_URL and DATABASE_URL_TEST name the same database: give the import tests a throwaway database of their own.",
	);
}

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
		// The integration tests share one database and work on whole tables: one file at a time.
		fileParallelism: false,
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
