/**
 * Health check for container orchestrators and the host's deployment check
 * (Docker HEALTHCHECK, Clever Cloud CC_HEALTH_CHECK_PATH, a reverse proxy).
 *
 * 200 `{ "status": "ok" }` when the process answers and the database runs a
 * trivial query within a few seconds, 503 `{ "status": "unavailable" }`
 * otherwise. It never says why: no error message, host or version leaves it.
 */
import { connection } from "next/server";
import { getSql } from "~/server/db";

const TIMEOUT_MS = 3000;

async function databaseReachable(): Promise<boolean> {
	if (!process.env.DATABASE_URL) return false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), TIMEOUT_MS);
	});
	const query = getSql()`SELECT 1`.then(
		() => true,
		() => false,
	);
	try {
		return await Promise.race([query, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export async function GET(): Promise<Response> {
	await connection();
	const ok = await databaseReachable();
	return Response.json(
		{ status: ok ? "ok" : "unavailable" },
		{ status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
