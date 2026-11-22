/**
 * On-demand cache revalidation, called by the open data import after it
 * commits (and later by other trusted jobs).
 *
 * POST a JSON body `{ "tags": ["practitioner:12", …] }` (at most 100 tags),
 * signed with HMAC-SHA256 over `{timestamp}.{body}` using REVALIDATE_SECRET:
 *   x-apercura-timestamp: unix seconds (rejected beyond ±5 minutes)
 *   x-apercura-signature: hex digest (applied once: a replay changes nothing)
 * Tags are revalidated with the `max` profile: stale pages keep being served
 * while they are regenerated in the background.
 */
import {
	parseRevalidationTags,
	REVALIDATE_SIGNATURE_HEADER,
	REVALIDATE_TIMESTAMP_HEADER,
	verifyRevalidation,
} from "@apercura/core/revalidation";
import { revalidateTag } from "next/cache";
import { serverEnv } from "~/env";
import { getDb } from "~/server/db";
import { readBodyCapped, tooLarge } from "~/server/http/body";
import { acceptRevalidationOnce } from "~/server/revalidation-replay";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
	const secret = serverEnv.REVALIDATE_SECRET;
	if (!secret) {
		return Response.json({ error: "revalidation is not configured" }, { status: 503 });
	}
	const bytes = await readBodyCapped(request, MAX_BODY_BYTES);
	if (!bytes) return tooLarge();
	const body = new TextDecoder().decode(bytes);
	const check = verifyRevalidation({
		secret,
		body,
		signature: request.headers.get(REVALIDATE_SIGNATURE_HEADER),
		timestamp: request.headers.get(REVALIDATE_TIMESTAMP_HEADER),
	});
	if (!check.ok) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}
	// A signed request is applied once: a replay within the timestamp window (captured, or
	// the same tags sent twice in one second) succeeds without revalidating anything again.
	const signature = request.headers.get(REVALIDATE_SIGNATURE_HEADER) ?? "";
	if (!(await acceptRevalidationOnce(getDb(), signature))) {
		return Response.json({ revalidated: 0, replayed: true });
	}
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "invalid JSON" }, { status: 400 });
	}
	const tags = parseRevalidationTags(payload);
	if (!tags) {
		return Response.json(
			{ error: "expected { tags: string[] } with 1 to 100 tags" },
			{ status: 400 },
		);
	}
	for (const tag of tags) revalidateTag(tag, "max");
	return Response.json({ revalidated: tags.length });
}
