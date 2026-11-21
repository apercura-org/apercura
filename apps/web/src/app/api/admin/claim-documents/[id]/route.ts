import { connection } from "next/server";
import { z } from "zod";
import { requireMfaSession, requirePlatformAdmin } from "~/server/auth/route-guard";
import { ClaimError, readClaimDocument } from "~/server/claims/service";
import { getDb } from "~/server/db";
import { getStorage } from "~/server/storage";

/**
 * Decrypts one claim document for a platform administrator, on demand. The
 * audit entry is written before any byte is returned; nothing is cached.
 */
export async function GET(
	request: Request,
	context: RouteContext<"/api/admin/claim-documents/[id]">,
) {
	// Per-request: never prerendered at build time.
	await connection();
	const db = getDb();
	const guard = await requireMfaSession(db, request.headers);
	if (!guard.ok) return guard.response;
	const admin = await requirePlatformAdmin(db, guard.value.user.id);
	if (!admin.ok) return admin.response;
	const { id } = await context.params;
	if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
	try {
		const document = await readClaimDocument(db, getStorage(), {
			documentId: id,
			adminId: guard.value.user.id,
			headers: request.headers,
		});
		return new Response(new Uint8Array(document.body), {
			headers: {
				"content-type": document.contentType,
				"content-disposition": "inline",
				"cache-control": "no-store, private",
				"x-content-type-options": "nosniff",
				// A PDF or image only: no script, no frame, no form, no outgoing request.
				"content-security-policy":
					"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
			},
		});
	} catch (error) {
		if (error instanceof ClaimError) return new Response(null, { status: 404 });
		throw error;
	}
}
