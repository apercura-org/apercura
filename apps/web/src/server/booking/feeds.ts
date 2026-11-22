import { calendars } from "@apercura/db/schema";
import { eq } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";

/**
 * Revokes every private calendar feed of a practice (`/api/ics/{token}`). The
 * feed URL is a bearer credential held by whoever subscribed to it: when the
 * practice changes hands (a contested claim, an owner who leaves), the
 * previous owner must stop reading the patients' names and appointments.
 * The new owner issues a new link from the booking settings.
 */
export async function revokeOrganizationFeeds(db: Executor, organizationId: string) {
	const revoked = await db
		.update(calendars)
		.set({ icsTokenHash: null, icsTokenCreatedAt: null })
		.where(eq(calendars.organizationId, organizationId))
		.returning({ id: calendars.id });
	return revoked.length;
}
