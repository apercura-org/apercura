import "server-only";
import { member, practitioners, user } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { ORGANIZATION_ROLES } from "./auth/access";
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
	const roles = (role: string) => role.split(",").map((name) => name.trim());
	const editable = pages.filter((page) =>
		roles(page.role).some((role) => ["owner", "practitioner"].includes(role)),
	);
	// Every practice with an agenda the person may run (assistants included).
	const practices = pages
		.filter((page) => roles(page.role).some((role) => ORGANIZATION_ROLES.includes(role as never)))
		.map((page) => ({
			...page,
			isOwner: roles(page.role).includes("owner"),
		}));
	return {
		pages: editable,
		practices,
		/** The practice the agenda pages show (one per person in v1: the first one). */
		practice: practices[0] ?? null,
		isPlatformAdmin: row?.isPlatformAdmin === true,
	};
});
