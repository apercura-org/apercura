import type { Database } from "@apercura/db";
import { member, passkey, user } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";

/** The caller's membership in one organization, read from the database (never from the session). */
export async function findMembership(db: Database, userId: string, organizationId: string) {
	const [row] = await db
		.select({ id: member.id, organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
		.limit(1);
	return row ?? null;
}

/** Platform administrator flag, read from the database on every call. */
export async function isPlatformAdmin(db: Database, userId: string) {
	const [row] = await db
		.select({ isPlatformAdmin: user.isPlatformAdmin })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row?.isPlatformAdmin === true;
}

/** Second factors the user has enrolled. */
export async function secondFactors(db: Database, userId: string) {
	const [row] = await db
		.select({ totp: user.twoFactorEnabled })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	const passkeys = await db
		.select({ id: passkey.id })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return { totp: row?.totp === true, passkeys: passkeys.length };
}

export function hasSecondFactor(factors: { totp: boolean; passkeys: number }) {
	return factors.totp || factors.passkeys > 0;
}
