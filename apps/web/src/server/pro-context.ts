import "server-only";
import { member, practitioners, user } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "./db";

/**
 * What the signed-in person can reach in the practitioner space: the pages
 * their practices own (with their role) and whether they administer the
 * platform. Navigation only; every procedure checks again.
 */
export const getProContext = cache(async (userId: string) => {
	const db = getDb();
	const pages = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
			practitionerId: practitioners.id,
			slug: practitioners.slug,
			firstName: practitioners.firstName,
			lastName: practitioners.lastName,
			titleCode: practitioners.titleCode,
		})
		.from(member)
		.innerJoin(
			practitioners,
			and(
				eq(practitioners.ownerOrgId, member.organizationId),
				eq(practitioners.claimStatus, "claimed"),
			),
		)
		.where(eq(member.userId, userId));
	const [row] = await db
		.select({ isPlatformAdmin: user.isPlatformAdmin })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const editable = pages.filter((page) =>
		page.role.split(",").some((role) => ["owner", "practitioner"].includes(role.trim())),
	);
	return { pages: editable, isPlatformAdmin: row?.isPlatformAdmin === true };
});
