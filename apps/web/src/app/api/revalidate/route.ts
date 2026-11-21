/**
 * On-demand cache revalidation, called by the open data import after it
 * commits (and later by other trusted jobs).
 *
 * POST a JSON body `{ "tags": ["practitioner:12", …] }` (at most 100 tags),
 * signed with HMAC-SHA256 over `{timestamp}.{body}` using REVALIDATE_SECRET:
 *   x-apercura-timestamp: unix seconds (rejected beyond ±5 minutes)
 *   x-apercura-signature: hex digest
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

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
	const secret = serverEnv.REVALIDATE_SECRET;
	if (!secret) {
		return Response.json({ error: "revalidation is not configured" }, { status: 503 });
	}
	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) {
		return Response.json({ error: "body too large" }, { status: 413 });
	}
	const check = verifyRevalidation({
		secret,
		body,
		signature: request.headers.get(REVALIDATE_SIGNATURE_HEADER),
		timestamp: request.headers.get(REVALIDATE_TIMESTAMP_HEADER),
	});
	if (!check.ok) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
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
