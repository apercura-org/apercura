import { randomUUID } from "node:crypto";
import type { Database } from "@apercura/db";
import {
	invitation,
	member,
	organization,
	passkey,
	practitioners,
	user,
} from "@apercura/db/schema";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";

/*
 * The practice's team (plan §10): owners invite people by email for 48 hours, as
 * practitioners or assistants, change their role or remove them. Invitations live in Better
 * Auth's `invitation` table; they are created and accepted here (Better Auth's own endpoints
 * are disabled) so every change re-reads the membership and requires a second factor.
 */

export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

/** Roles an owner can give. There is one owner per practice: the verified claimant. */
export const INVITABLE_ROLES = ["practitioner", "assistant"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type TeamErrorCode =
	| "NOT_FOUND"
	| "ALREADY_MEMBER"
	| "OWNER_LOCKED"
	| "EXPIRED"
	| "NOT_PENDING"
	| "EMAIL_MISMATCH"
	| "EMAIL_NOT_VERIFIED"
	| "NO_SECOND_FACTOR";

export class TeamError extends Error {
	constructor(readonly code: TeamErrorCode) {
		super(code);
		this.name = "TeamError";
	}
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isOwner = (role: string) => role.split(",").some((name) => name.trim() === "owner");

/** Members (with whether they enrolled a second factor) and the invitations still open. */
export async function listTeam(db: Database, organizationId: string, nowMs: number) {
	const members = await db
		.select({
			id: member.id,
			userId: member.userId,
			role: member.role,
			createdAt: member.createdAt,
			name: user.name,
			email: user.email,
			totp: user.twoFactorEnabled,
			passkeys: sql<number>`(select count(*)::int from ${passkey} where ${passkey.userId} = ${user.id})`,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, organizationId))
		.orderBy(asc(member.createdAt));
	const invitations = await db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
			inviterName: user.name,
		})
		.from(invitation)
		.innerJoin(user, eq(user.id, invitation.inviterId))
		.where(
			and(
				eq(invitation.organizationId, organizationId),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date(nowMs - 7 * 24 * 60 * 60 * 1000)),
			),
		)
		.orderBy(asc(invitation.createdAt));
	return {
		members: members.map(({ totp, passkeys, ...row }) => ({
			...row,
			owner: isOwner(row.role),
			secondFactor: totp === true || passkeys > 0,
		})),
		invitations: invitations.map((row) => ({
			...row,
			expired: row.expiresAt.getTime() <= nowMs,
		})),
	};
}

/**
 * Invites an address for 48 hours. An earlier open invitation of the same address is replaced
 * (its link stops working). Someone already in the team cannot be invited again.
 */
export async function inviteMember(
	db: Database,
	input: {
		organizationId: string;
		inviterId: string;
		email: string;
		role: InvitableRole;
		nowMs: number;
	},
) {
	const email = normalizeEmail(input.email);
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: member.id })
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(
				and(eq(member.organizationId, input.organizationId), eq(sql`lower(${user.email})`, email)),
			)
			.limit(1);
		if (existing) {
			throw new TeamError("ALREADY_MEMBER");
		}
		await tx
			.update(invitation)
			.set({ status: "canceled" })
			.where(
				and(
					eq(invitation.organizationId, input.organizationId),
					eq(invitation.email, email),
					eq(invitation.status, "pending"),
				),
			);
		const [row] = await tx
			.insert(invitation)
			.values({
				id: randomUUID(),
				organizationId: input.organizationId,
				email,
				role: input.role,
				status: "pending",
				expiresAt: new Date(input.nowMs + INVITATION_TTL_MS),
				inviterId: input.inviterId,
			})
			.returning();
		if (!row) {
			throw new TeamError("NOT_FOUND");
		}
		const [practice] = await tx
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, input.organizationId))
			.limit(1);
		const [inviter] = await tx
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, input.inviterId))
			.limit(1);
		return {
			invitation: row,
			practiceName: practice?.name ?? "",
			inviterName: inviter?.name ?? "",
		};
	});
}

export async function cancelInvitation(db: Database, organizationId: string, invitationId: string) {
	const rows = await db
		.update(invitation)
		.set({ status: "canceled" })
		.where(
			and(
				eq(invitation.id, invitationId),
				eq(invitation.organizationId, organizationId),
				eq(invitation.status, "pending"),
			),
		)
		.returning({ id: invitation.id });
	if (rows.length === 0) {
		throw new TeamError("NOT_FOUND");
	}
	return { canceled: true as const };
}

/** The owner's own membership and the owner role cannot be changed or removed here. */
async function changeableMember(
	db: Database,
	organizationId: string,
	actorUserId: string,
	memberId: string,
) {
	const [row] = await db
		.select({ id: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
		.limit(1);
	if (!row) {
		throw new TeamError("NOT_FOUND");
	}
	if (row.userId === actorUserId || isOwner(row.role)) {
		throw new TeamError("OWNER_LOCKED");
	}
	return row;
}

export async function updateMemberRole(
	db: Database,
	input: { organizationId: string; actorUserId: string; memberId: string; role: InvitableRole },
) {
	const row = await changeableMember(db, input.organizationId, input.actorUserId, input.memberId);
	await db.update(member).set({ role: input.role }).where(eq(member.id, row.id));
	return { role: input.role };
}

/** Removes a member: their next call is refused (memberships are re-read on every call). */
export async function removeMember(
	db: Database,
	input: { organizationId: string; actorUserId: string; memberId: string },
) {
	const row = await changeableMember(db, input.organizationId, input.actorUserId, input.memberId);
	await db.delete(member).where(eq(member.id, row.id));
	return { removed: true as const };
}

export interface Invitee {
	id: string;
	email: string;
	emailVerified: boolean;
}

/**
 * What the invitation page shows to the signed-in person. An invitation sent to another
 * address reveals nothing about the practice.
 */
export async function invitationFor(
	db: Database,
	invitationId: string,
	invitee: Invitee,
	nowMs: number,
) {
	const [row] = await db
		.select({
			id: invitation.id,
			organizationId: invitation.organizationId,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			practiceName: organization.name,
			inviterName: user.name,
		})
		.from(invitation)
		.innerJoin(organization, eq(organization.id, invitation.organizationId))
		.innerJoin(user, eq(user.id, invitation.inviterId))
		.where(eq(invitation.id, invitationId))
		.limit(1);
	if (!row) {
		return { state: "not_found" as const };
	}
	if (normalizeEmail(row.email) !== normalizeEmail(invitee.email)) {
		return { state: "other_address" as const };
	}
	const [page] = await db
		.select({ firstName: practitioners.firstName, lastName: practitioners.lastName })
		.from(practitioners)
		.where(eq(practitioners.ownerOrgId, row.organizationId))
		.limit(1);
	const details = {
		practiceName: row.practiceName,
		inviterName: row.inviterName,
		role: (INVITABLE_ROLES as readonly string[]).includes(row.role ?? "")
			? (row.role as InvitableRole)
			: "assistant",
		expiresAt: row.expiresAt,
		practitioner: page ? `${page.firstName} ${page.lastName}` : null,
	};
	if (row.status === "accepted") {
		return { state: "accepted" as const, organizationId: row.organizationId, ...details };
	}
	if (row.status !== "pending") {
		return { state: "closed" as const, ...details };
	}
	if (row.expiresAt.getTime() <= nowMs) {
		return { state: "expired" as const, ...details };
	}
	return { state: "open" as const, ...details };
}

/**
 * Joins the practice. The caller's session has proved a second factor (`mfa` procedure); the
 * account's email is verified and is the invited address. One transaction, invitation locked.
 */
export async function acceptInvitation(
	db: Database,
	invitationId: string,
	invitee: Invitee,
	nowMs: number,
) {
	if (!invitee.emailVerified) {
		throw new TeamError("EMAIL_NOT_VERIFIED");
	}
	const [account] = await db
		.select({
			totp: user.twoFactorEnabled,
			passkeys: sql<number>`(select count(*)::int from ${passkey} where ${passkey.userId} = ${user.id})`,
		})
		.from(user)
		.where(eq(user.id, invitee.id))
		.limit(1);
	if (!account || (account.totp !== true && account.passkeys === 0)) {
		throw new TeamError("NO_SECOND_FACTOR");
	}
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(invitation)
			.where(eq(invitation.id, invitationId))
			.for("update")
			.limit(1);
		if (!row) {
			throw new TeamError("NOT_FOUND");
		}
		if (normalizeEmail(row.email) !== normalizeEmail(invitee.email)) {
			// Same answer as an unknown invitation: nothing to learn by guessing ids.
			throw new TeamError("NOT_FOUND");
		}
		if (row.status !== "pending") {
			throw new TeamError("NOT_PENDING");
		}
		if (row.expiresAt.getTime() <= nowMs) {
			throw new TeamError("EXPIRED");
		}
		const role = (INVITABLE_ROLES as readonly string[]).includes(row.role ?? "")
			? (row.role as InvitableRole)
			: "assistant";
		const inserted = await tx
			.insert(member)
			.values({ id: randomUUID(), organizationId: row.organizationId, userId: invitee.id, role })
			.onConflictDoNothing()
			.returning({ id: member.id });
		if (inserted.length === 0) {
			throw new TeamError("ALREADY_MEMBER");
		}
		await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, row.id));
		// Other open invitations of the same address to this practice are spent too.
		await tx
			.update(invitation)
			.set({ status: "canceled" })
			.where(
				and(
					eq(invitation.organizationId, row.organizationId),
					eq(invitation.email, row.email),
					eq(invitation.status, "pending"),
					ne(invitation.id, row.id),
				),
			);
		return { organizationId: row.organizationId, role };
	});
}

export async function declineInvitation(db: Database, invitationId: string, invitee: Invitee) {
	const rows = await db
		.update(invitation)
		.set({ status: "rejected" })
		.where(
			and(
				eq(invitation.id, invitationId),
				eq(invitation.email, normalizeEmail(invitee.email)),
				eq(invitation.status, "pending"),
			),
		)
		.returning({ id: invitation.id });
	if (rows.length === 0) {
		throw new TeamError("NOT_FOUND");
	}
	return { declined: true as const };
}

/** Organizations whose open invitations name this address (dashboard hint). */
export async function openInvitationsFor(db: Database, email: string, nowMs: number) {
	return db
		.select({ id: invitation.id, practiceName: organization.name })
		.from(invitation)
		.innerJoin(organization, eq(organization.id, invitation.organizationId))
		.where(
			and(
				eq(invitation.email, normalizeEmail(email)),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date(nowMs)),
				inArray(invitation.role, [...INVITABLE_ROLES]),
			),
		);
}
