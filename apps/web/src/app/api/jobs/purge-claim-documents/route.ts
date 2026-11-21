import { safeEqual } from "@apercura/core/crypto";
import { serverEnv } from "~/env";
import { purgeClaimDocuments } from "~/server/claims/service";
import { getDb } from "~/server/db";
import { getStorage, storageConfigured } from "~/server/storage";

/**
 * Deletes claim documents 30 days after the decision. Called by the scheduler
 * with `Authorization: Bearer $JOBS_SECRET`; answers 503 without the secret.
 */
export async function POST(request: Request) {
	const secret = serverEnv.JOBS_SECRET;
	if (!secret || !storageConfigured())
		return Response.json({ error: "not configured" }, { status: 503 });
	const header = request.headers.get("authorization") ?? "";
	if (!safeEqual(header, `Bearer ${secret}`))
		return Response.json({ error: "unauthorized" }, { status: 401 });
	const purged = await purgeClaimDocuments(getDb(), getStorage());
	return Response.json({ purged });
}
