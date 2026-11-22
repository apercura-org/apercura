/**
 * The server Lighthouse CI measures (`startServerCommand` in lighthouserc.cjs):
 * `next start` on the given port, warmed up before the first run. A cold
 * server loads its route modules and renders each page for the first time
 * while the browser runs on the same CPU, which made the first run of the
 * first page several times slower than the next ones (Total Blocking Time
 * of 1174 and 1524 ms on CI, against about 300 for the other runs). Every
 * audited page and the scripts it loads are fetched a few times first, then
 * READY is printed for Lighthouse CI to start.
 *
 * Usage: bun scripts/lhci-server.ts <port> <url>...
 */
import { spawn } from "node:child_process";

/** Matched by `startServerReadyPattern` in lighthouserc.cjs. */
const READY = "Lighthouse CI server warmed up";

const [port, ...urls] = process.argv.slice(2);
if (!port || urls.length === 0) {
	console.error("Usage: bun scripts/lhci-server.ts <port> <url>...");
	process.exit(2);
}

/** Its own process group, so stopping this script stops `next start` and its workers too. */
const server = spawn("bun", ["run", "start", "--port", port], {
	stdio: ["ignore", "inherit", "inherit"],
	detached: true,
});
const stop = () => {
	if (server.pid !== undefined && server.exitCode === null) {
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {
			// Already gone.
		}
	}
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	process.on(signal, () => {
		stop();
		process.exit(0);
	});
}
process.on("exit", stop);
server.on("exit", (code) => process.exit(code ?? 1));

// Lighthouse browses as a French visitor (see lighthouserc.cjs): warm the same pages.
const headers = { "Accept-Language": "fr-FR,fr;q=0.9" };

async function waitForServer(url: string, timeoutMs: number) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url, { headers })).ok) return;
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`${url} did not answer within ${timeoutMs / 1000} s`);
}

async function warm(url: string) {
	const html = await (await fetch(url, { headers })).text();
	const scripts = new Set(
		[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1] ?? ""),
	);
	await Promise.all(
		[...scripts].filter(Boolean).map(async (src) => {
			await (await fetch(new URL(src, url))).arrayBuffer();
		}),
	);
}

await waitForServer(urls[0] as string, 60_000);
for (let round = 0; round < 3; round++) {
	for (const url of urls) await warm(url);
}
console.log(READY);
