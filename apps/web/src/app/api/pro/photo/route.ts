import { z } from "zod";
import { readForm, requireMember, requireMfaSession } from "~/server/auth/route-guard";
import { getDb } from "~/server/db";
import { MAX_PHOTO_BYTES, PhotoError } from "~/server/profile/photo";
import { ProfileError, practitionerOfOrganization, setPhoto } from "~/server/profile/service";
import { refreshPractitioners } from "~/server/refresh";
import { getStorage } from "~/server/storage";

/**
 * Replaces the page photo: JPEG, PNG or WebP of 5 MB at most, re-encoded by
 * sharp without metadata and stored under a random key. Same checks as the
 * editor's procedures: second factor, then membership with `page:update`.
 */
export async function POST(request: Request) {
	const db = getDb();
	const guard = await requireMfaSession(db, request.headers);
	if (!guard.ok) return guard.response;
	const form = await readForm(request, MAX_PHOTO_BYTES);
	const organizationId = z.string().min(1).max(64).safeParse(form?.get("organizationId"));
	const file = form?.get("file");
	if (!organizationId.success || !(file instanceof File)) {
		return Response.json({ error: "UNSUPPORTED" }, { status: 400 });
	}
	const member = await requireMember(db, guard.value.user.id, organizationId.data, {
		page: ["update"],
	});
	if (!member.ok) return member.response;
	if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: "TOO_LARGE" }, { status: 413 });
	try {
		const practitioner = await practitionerOfOrganization(db, member.value.organizationId);
		const photo = await setPhoto(
			db,
			getStorage(),
			practitioner.id,
			new Uint8Array(await file.arrayBuffer()),
		);
		await refreshPractitioners(db.$client, [practitioner.id]);
		return Response.json({ url: photo.url }, { status: 201 });
	} catch (error) {
		if (error instanceof PhotoError) {
			return Response.json(
				{ error: error.code },
				{ status: error.code === "TOO_LARGE" ? 413 : 415 },
			);
		}
		if (error instanceof ProfileError) return Response.json({ error: error.code }, { status: 404 });
		throw error;
	}
}
