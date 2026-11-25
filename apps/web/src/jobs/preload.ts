/**
 * Preloaded by `bun run jobs:tick`. The jobs import the same server modules as the app, which
 * carry the `server-only` marker; that package throws outside React Server Components, so the
 * CLI (a server process by definition) maps it to an empty module. Markdown files (the guides,
 * listed by the cache warm-up) are imported as their text, as in the app.
 */
import { plugin } from "bun";

plugin({
	name: "server-only",
	setup(build) {
		build.module("server-only", () => ({ exports: {}, loader: "object" }));
	},
});

plugin({
	name: "markdown-as-text",
	setup(build) {
		build.onLoad({ filter: /\.md$/ }, async ({ path }) => ({
			exports: { default: await Bun.file(path).text() },
			loader: "object",
		}));
	},
});
