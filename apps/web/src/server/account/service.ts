import "server-only";
import type { Database } from "@apercura/db";
import {
	account,
	claimChecks,
	claimDocuments,
	claims,
	member,
	organization,
	passkey,
	practitionerProfiles,
	practitioners,
	session,
	user,
} from "@apercura/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { closeOrganization, finalizeClosures } from "../booking/closure";
import { revokeOrganizationFeeds } from "../booking/feeds";
import type { StorageDriver } from "../storage";

/**
 * A JSON copy of everything the platform holds about the account (GDPR art.
 * 15 and 20): profile, sign-in methods (never their secrets), sessions,
 * memberships and organizations, claims with their checks and document
 * metadata, and the page content of the practitioners it owns.
 */
export async function exportAccount(db: Database, userId: string, headers?: Headers) {
	const [person] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			locale: user.locale,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		})
		.from(user)
		.where(eq(user.id, userId));
	const signIn = await db
		.select({ providerId: account.providerId, createdAt: account.createdAt })
		.from(account)
		.where(eq(account.userId, userId));
	const passkeys = await db
		.select({ name: passkey.name, deviceType: passkey.deviceType, createdAt: passkey.createdAt })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	const sessions = await db
		.select({
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			expiresAt: session.expiresAt,
			userAgent: session.userAgent,
			mfaMethod: session.mfaMethod,
		})
		.from(session)
		.where(eq(session.userId, userId));
	const memberships = await db
		.select({
			organizationId: organization.id,
			organization: organization.name,
			role: member.role,
			since: member.createdAt,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(eq(member.userId, userId));
	const claimRows = await db
		.select({
			id: claims.id,
			rpps: practitioners.nationalId,
			status: claims.status,
			contest: claims.contest,
			createdAt: claims.createdAt,
			submittedAt: claims.submittedAt,
			verifiedAt: claims.verifiedAt,
			decidedAt: claims.decidedAt,
			decisionReason: claims.decisionReason,
		})
		.from(claims)
		.innerJoin(practitioners, eq(practitioners.id, claims.practitionerId))
		.where(eq(claims.userId, userId));
	const claimIds = claimRows.map((row) => row.id);
	const checks = claimIds.length
		? await db
				.select({
					claimId: claimChecks.claimId,
					method: claimChecks.method,
					status: claimChecks.status,
					passedAt: claimChecks.passedAt,
				})
				.from(claimChecks)
				.where(inArray(claimChecks.claimId, claimIds))
		: [];
	const documents = claimIds.length
		? await db
				.select({
					claimId: claimDocuments.claimId,
					kind: claimDocuments.kind,
					contentType: claimDocuments.contentType,
					byteSize: claimDocuments.byteSize,
					createdAt: claimDocuments.createdAt,
					purgeAfter: claimDocuments.purgeAfter,
					purgedAt: claimDocuments.purgedAt,
				})
				.from(claimDocuments)
				.where(inArray(claimDocuments.claimId, claimIds))
		: [];
	const ownedOrgs = memberships.filter((item) => item.role.split(",").includes("owner"));
	const pages = ownedOrgs.length
		? await db
				.select({
					rpps: practitioners.nationalId,
					slug: practitioners.slug,
					profile: practitionerProfiles,
				})
				.from(practitioners)
				.leftJoin(practitionerProfiles, eq(practitionerProfiles.practitionerId, practitioners.id))
				.where(
					inArray(
						practitioners.ownerOrgId,
						ownedOrgs.map((item) => item.organizationId),
					),
				)
		: [];
	await recordAudit(db, {
		actor: userId,
		action: "account.export",
		subjectType: "user",
		subjectId: userId,
		headers,
	});
	return {
		exportedAt: new Date().toISOString(),
		account: person ?? null,
		signInMethods: signIn,
		passkeys,
		sessions,
		memberships,
		claims: claimRows.map((claim) => ({
			...claim,
			checks: checks.filter((check) => check.claimId === claim.id),
			documents: documents.filter((document) => document.claimId === claim.id),
		})),
		pages,
	};
}

export class AccountError extends Error {
	constructor(readonly code: "HAS_TEAM" | "LAST_ADMIN" | "NO_SUCH_MEMBER") {
		super(code);
		this.name = "AccountError";
	}
}

export type PracticeOutcome =
	/** The practice is deleted with the account; its members lose access. */
	| { kind: "close" }
	/** Another member becomes the owner and keeps the practice. */
	| { kind: "transfer"; memberUserId: string };

/**
 * What deleting the account would do to each practice it owns: nothing to
 * decide when it is the only member; otherwise close the practice or hand it
 * to another member.
 */
export async function deletionPlan(db: Database, userId: string) {
	const owned = await db.$client<
		{ organizationId: string; name: string; practitionerId: number | null; others: number }[]
	>`
		SELECT o.id AS "organizationId", o.name, p.id AS "practitionerId",
			(SELECT count(*)::integer FROM directory.member x
				WHERE x.organization_id = o.id AND x.user_id <> ${userId}) AS others
		FROM directory.member m
		JOIN directory.organization o ON o.id = m.organization_id
		LEFT JOIN directory.practitioners p ON p.owner_org_id = o.id
		WHERE m.user_id = ${userId} AND m.role LIKE '%owner%'
		ORDER BY o.name
	`;
	const teams = await Promise.all(
		owned
			.filter((item) => item.others > 0)
			.map(async (item) => ({
				organizationId: item.organizationId,
				members: await db
					.select({ userId: user.id, name: user.name, email: user.email, role: member.role })
					.from(member)
					.innerJoin(user, eq(user.id, member.userId))
					.where(and(eq(member.organizationId, item.organizationId), ne(member.userId, userId))),
			})),
	);
	return owned.map((item) => ({
		...item,
		members: teams.find((team) => team.organizationId === item.organizationId)?.members ?? [],
	}));
}

/**
 * Deletes the account (GDPR art. 17). Rules:
 * - a practice the account owns alone is closed;
 * - a practice with other members is closed or handed to one of them, as
 *   the caller chose (no choice: refused with HAS_TEAM);
 * - closing a practice (`booking/closure.ts`) cancels its upcoming
 *   appointments and tells their patients, revokes its calendar feeds and
 *   removes its team at once; its booking data, data keys and the
 *   organization are deleted once the cancellation emails are out (right
 *   away when there are none, otherwise by the jobs, within a day at most);
 * - either way the practitioner's own page goes back to the registry facts:
 *   unclaimed, the owner's content and photo deleted (the page itself stays,
 *   built from open data, unless the owner removed it);
 * - claims and their documents are deleted with the account;
 * - the last platform administrator cannot delete their account.
 * The platform audit log keeps the pseudonymous account id, and the access
 * log of a closed practice stays until its own retention.
 */
export async function deleteAccount(
	db: Database,
	storage: StorageDriver,
	input: {
		userId: string;
		practices: Record<string, PracticeOutcome>;
		headers?: Headers;
		/** Injected by tests; defaults to the current time. */
		nowMs?: number;
	},
) {
	const nowMs = input.nowMs ?? Date.now();
	const plan = await deletionPlan(db, input.userId);
	for (const practice of plan) {
		if (practice.others > 0 && !input.practices[practice.organizationId]) {
			throw new AccountError("HAS_TEAM");
		}
	}
	const objects: string[] = [];
	const practitionerIds: number[] = [];
	const closed = new Set<string>();
	await db.transaction(async (tx) => {
		const [self] = await tx
			.select({ isPlatformAdmin: user.isPlatformAdmin })
			.from(user)
			.where(eq(user.id, input.userId));
		if (self?.isPlatformAdmin) {
			const [admins] = await tx.execute<{ n: number }>(
				sql`SELECT count(*)::integer AS n FROM directory."user" WHERE is_platform_admin`,
			);
			if ((admins?.n ?? 0) <= 1) throw new AccountError("LAST_ADMIN");
		}
		for (const practice of plan) {
			// The practice first: closing it takes the practitioners' booking locks before any
			// other row of theirs is touched.
			const outcome = input.practices[practice.organizationId] ?? { kind: "close" };
			if (outcome.kind === "transfer") {
				const promoted = await tx
					.update(member)
					.set({ role: "owner" })
					.where(
						and(
							eq(member.organizationId, practice.organizationId),
							eq(member.userId, outcome.memberUserId),
							ne(member.userId, input.userId),
						),
					)
					.returning({ id: member.id });
				if (promoted.length === 0) throw new AccountError("NO_SUCH_MEMBER");
				// The leaving owner's feed links must not outlive their account.
				await revokeOrganizationFeeds(tx, practice.organizationId);
			} else if (!closed.has(practice.organizationId)) {
				closed.add(practice.organizationId);
				await closeOrganization(tx, {
					organizationId: practice.organizationId,
					actor: `user:${input.userId}`,
					nowMs,
				});
				await recordAudit(tx, {
					actor: input.userId,
					action: "organization.close",
					subjectType: "organization",
					subjectId: practice.organizationId,
					headers: input.headers,
				});
			}
			if (practice.practitionerId) {
				practitionerIds.push(practice.practitionerId);
				const [profile] = await tx
					.select({ photoKey: practitionerProfiles.photoKey })
					.from(practitionerProfiles)
					.where(eq(practitionerProfiles.practitionerId, practice.practitionerId));
				if (profile?.photoKey) objects.push(profile.photoKey);
				await tx
					.delete(practitionerProfiles)
					.where(eq(practitionerProfiles.practitionerId, practice.practitionerId));
				await tx
					.update(practitioners)
					.set({ claimStatus: "unclaimed", ownerOrgId: null })
					.where(eq(practitioners.id, practice.practitionerId));
			}
		}
		const documents = await tx.execute<{ storage_key: string }>(sql`
			SELECT d.storage_key FROM directory.claim_documents d
			JOIN directory.claims c ON c.id = d.claim_id
			WHERE c.user_id = ${input.userId} AND d.purged_at IS NULL
		`);
		objects.push(...[...documents].map((row) => row.storage_key));
		await recordAudit(tx, {
			actor: input.userId,
			action: "account.delete",
			subjectType: "user",
			subjectId: input.userId,
			headers: input.headers,
		});
		// Sessions, sign-in methods, memberships, claims, checks and documents cascade.
		await tx.delete(user).where(eq(user.id, input.userId));
	});
	// Practices with no email left to send go at once; the others with the jobs.
	if (closed.size > 0) {
		await finalizeClosures(db, nowMs, [...closed]).catch((error: unknown) => {
			console.error("Practice closure left to the scheduled jobs:", error);
		});
	}
	for (const key of objects) await storage.delete(key).catch(() => undefined);
	return { practitionerIds };
}
