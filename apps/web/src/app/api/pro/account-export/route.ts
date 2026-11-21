import { connection } from "next/server";
import { exportAccount } from "~/server/account/service";
import { requireMfaSession } from "~/server/auth/route-guard";
import { getDb } from "~/server/db";

/** Downloads the account's data as JSON (GDPR art. 15 and 20). Second factor required. */
export async function GET(request: Request) {
	// Per-request: never prerendered at build time.
	await connection();
	const db = getDb();
	const guard = await requireMfaSession(db, request.headers);
	if (!guard.ok) return guard.response;
	const data = await exportAccount(db, guard.value.user.id, request.headers);
	const date = new Date().toISOString().slice(0, 10);
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="apercura-account-${date}.json"`,
			"cache-control": "no-store, private",
		},
	});
}
