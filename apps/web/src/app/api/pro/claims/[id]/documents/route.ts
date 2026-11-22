import { z } from "zod";
import { readForm, requireMfaSession } from "~/server/auth/route-guard";
import { addClaimDocument, ClaimError, MAX_DOCUMENT_BYTES } from "~/server/claims/service";
import { getDb } from "~/server/db";
import { claimDocumentsEnabled } from "~/server/features";
import { refuseCrossSite } from "~/server/http/same-origin";
import { getStorage } from "~/server/storage";

const kind = z.enum(["cps_card", "ordre_attestation"]);

/**
 * Uploads a claim proof (CPS card or Ordre attestation: PDF, JPEG, PNG or
 * WebP, 10 MB at most). The bytes are encrypted with the platform key before
 * they reach object storage; the response never echoes them.
 */
export async function POST(
	request: Request,
	context: RouteContext<"/api/pro/claims/[id]/documents">,
) {
	const crossSite = refuseCrossSite(request);
	if (crossSite) return crossSite;
	if (!claimDocumentsEnabled()) return Response.json({ error: "DISABLED" }, { status: 404 });
	const db = getDb();
	const guard = await requireMfaSession(db, request.headers);
	if (!guard.ok) return guard.response;
	const { id } = await context.params;
	if (!z.uuid().safeParse(id).success)
		return Response.json({ error: "NOT_FOUND" }, { status: 404 });
	const form = await readForm(request, MAX_DOCUMENT_BYTES);
	const file = form?.get("file");
	const parsedKind = kind.safeParse(form?.get("kind"));
	if (!(file instanceof File) || !parsedKind.success) {
		return Response.json({ error: "BAD_DOCUMENT" }, { status: 400 });
	}
	if (file.size > MAX_DOCUMENT_BYTES)
		return Response.json({ error: "BAD_DOCUMENT" }, { status: 413 });
	try {
		const document = await addClaimDocument(db, getStorage(), {
			claimId: id,
			userId: guard.value.user.id,
			kind: parsedKind.data,
			bytes: new Uint8Array(await file.arrayBuffer()),
		});
		return Response.json({ id: document.id }, { status: 201 });
	} catch (error) {
		if (error instanceof ClaimError) {
			const status = error.code === "NOT_FOUND" ? 404 : error.code === "NOT_OPEN" ? 409 : 400;
			return Response.json({ error: error.code }, { status });
		}
		throw error;
	}
}
