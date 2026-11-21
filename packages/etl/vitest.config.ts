import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
		// The integration test shares one database: run files one after another.
		fileParallelism: false,
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
