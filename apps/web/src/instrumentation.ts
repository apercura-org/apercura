/**
 * Runs once when the server process starts. `next.config.ts` loads the root
 * `.env`, but only into the process that evaluates the config; Next.js does not
 * load it again for the server that renders pages and answers API routes
 * (DATABASE_URL, the auth secret, SMTP). Read it here for that process.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { loadRootEnv } = await import("./server/load-root-env");
		await loadRootEnv();
	}
}
