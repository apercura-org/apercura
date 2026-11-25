import { member, organization, session } from "@apercura/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { AccountError, deleteAccount, deletionPlan } from "~/server/account/service";
import { hasSecondFactor, secondFactors } from "~/server/auth/membership";
import { afterPurge, purgeSuppressed } from "~/server/gdpr/minimise";
import { refreshPractitioners } from "~/server/refresh";
import { getStorage } from "~/server/storage";
import { authedProcedure, createTRPCRouter, mfaProcedure } from "../init";

/** The signed-in person's own account: second factors, sessions, memberships. */
export const accountRouter = createTRPCRouter({
	status: authedProcedure.query(async ({ ctx }) => {
		const factors = await secondFactors(ctx.db(), ctx.user.id);
		return {
			email: ctx.user.email,
			name: ctx.user.name,
			totp: factors.totp,
			passkeys: factors.passkeys,
			hasSecondFactor: hasSecondFactor(factors),
			mfaVerified: Boolean(ctx.session.mfaVerifiedAt),
		};
	}),

	/** Open sessions, newest first. Tokens never leave the server. */
	sessions: mfaProcedure.query(async ({ ctx }) => {
		const rows = await ctx
			.db()
			.select({
				id: session.id,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				expiresAt: session.expiresAt,
				userAgent: session.userAgent,
				mfaMethod: session.mfaMethod,
			})
			.from(session)
			.where(and(eq(session.userId, ctx.user.id), gt(session.expiresAt, new Date())))
			.orderBy(desc(session.updatedAt));
		return rows.map((row) => ({ ...row, current: row.id === ctx.session.id }));
	}),

	/** Signs out one other session. The current one signs out with the sign-out button. */
	revokeSession: mfaProcedure
		.input(z.object({ id: z.string().min(1).max(64) }))
		.mutation(async ({ ctx, input }) => {
			if (input.id === ctx.session.id) {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}
			const deleted = await ctx
				.db()
				.delete(session)
				.where(
					and(
						eq(session.id, input.id),
						eq(session.userId, ctx.user.id),
						ne(session.id, ctx.session.id),
					),
				)
				.returning({ id: session.id });
			if (deleted.length === 0) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			return { ok: true as const };
		}),

	/** Organizations the person belongs to, with their role, read from the database. */
	memberships: mfaProcedure.query(async ({ ctx }) =>
		ctx
			.db()
			.select({
				organizationId: organization.id,
				name: organization.name,
				role: member.role,
			})
			.from(member)
			.innerJoin(organization, eq(organization.id, member.organizationId))
			.where(eq(member.userId, ctx.user.id))
			.orderBy(asc(organization.name)),
	),

	/** What deleting the account would do to the practices it owns. */
	deletionPlan: mfaProcedure.query(({ ctx }) => deletionPlan(ctx.db(), ctx.user.id)),

	/**
	 * Deletes the account. The caller retypes their email address, and says for
	 * each practice with a team whether it is closed or handed to a member.
	 */
	delete: mfaProcedure
		.input(
			z.object({
				confirmEmail: z.string().trim().toLowerCase(),
				practices: z
					.record(
						z.string().min(1).max(64),
						z.discriminatedUnion("kind", [
							z.object({ kind: z.literal("close") }),
							z.object({ kind: z.literal("transfer"), memberUserId: z.string().min(1).max(64) }),
						]),
					)
					.default({}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.confirmEmail !== ctx.user.email.toLowerCase()) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "CONFIRMATION_MISMATCH" });
			}
			try {
				const result = await deleteAccount(ctx.db(), getStorage(), {
					userId: ctx.user.id,
					practices: input.practices,
					headers: ctx.headers,
				});
				await refreshPractitioners(ctx.db().$client, result.practitionerIds);
				// A page its owner had removed is no longer held by their claim: only the
				// suppression stays (or, while the practice's agenda is being closed, a bare row
				// until the next import).
				const purge = await purgeSuppressed(ctx.db(), result.practitionerIds);
				if (purge.deleted > 0) await afterPurge(ctx.db(), purge, { storage: getStorage() });
				return { ok: true as const };
			} catch (error) {
				if (error instanceof AccountError) {
					throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.code });
				}
				throw error;
			}
		}),
});
