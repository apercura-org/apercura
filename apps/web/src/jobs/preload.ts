/**
 * Preloaded by `bun run jobs:tick`. The jobs import the same server modules as the app, which
 * carry the `server-only` marker; that package throws outside React Server Components, so the
 * CLI (a server process by definition) maps it to an empty module.
 */
import { plugin } from "bun";

plugin({
	name: "server-only",
	setup(build) {
		build.module("server-only", () => ({ exports: {}, loader: "object" }));
	},
});
