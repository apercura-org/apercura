import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// Markdown files (the guides) are imported as their text, as Turbopack does in the app.
	plugins: [
		{
			name: "markdown-as-text",
			transform(code, id) {
				return id.endsWith(".md")
					? { code: `export default ${JSON.stringify(code)};`, map: null }
					: null;
			},
		},
	],
	resolve: {
		alias: {
			"~": fileURLToPath(new URL("./src", import.meta.url)),
			"server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
		},
	},
	test: {
		// Playwright specs live in e2e/ and run with `test:e2e`.
		include: ["src/**/*.test.ts"],
		env: { SKIP_ENV_VALIDATION: "1" },
		// next-intl imports `next/navigation` without an extension: let Vite resolve it.
		server: { deps: { inline: ["next-intl"] } },
	},
});
