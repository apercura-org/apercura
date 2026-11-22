import { TRPCError } from "@trpc/server";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { BOOKING_LIMITS } from "~/server/booking/config";
import { sendInvitationEmail } from "~/server/team/notify";
import {
	acceptInvitation,
	cancelInvitation,
	declineInvitation,
	INVITABLE_ROLES,
	invitationFor,
	inviteMember,
	listTeam,
	openInvitationsFor,
	removeMember,
	TeamError,
	updateMemberRole,
} from "~/server/team/service";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { createTRPCRouter, memberProcedure, mfaProcedure } from "../init";

const CODE_FOR: Record<TeamError["code"], TRPCError["code"]> = {
	NOT_FOUND: "NOT_FOUND",
	ALREADY_MEMBER: "CONFLICT",
	OWNER_LOCKED: "FORBIDDEN",
	EXPIRED: "PRECONDITION_FAILED",
	NOT_PENDING: "PRECONDITION_FAILED",
	EMAIL_MISMATCH: "FORBIDDEN",
	EMAIL_NOT_VERIFIED: "PRECONDITION_FAILED",
	NO_SECOND_FACTOR: "PRECONDITION_FAILED",
};

async function team<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof TeamError) {
			throw new TRPCError({ code: CODE_FOR[error.code], message: error.code, cause: error });
		}
		throw error;
	}
}

const role = z.enum(INVITABLE_ROLES);
const invitationId = z.object({ invitationId: z.uuid() });

/**
 * The practice's team (plan §10), owners only: invitations, roles, removals. The invited
 * person's side (`invitation`, `accept`, `decline`) needs a session that proved a second factor.
 */
export const teamRouter = createTRPCRouter({
	list: memberProcedure({ member: ["update"] }).query(({ ctx }) =>
		listTeam(ctx.db(), ctx.organizationId, (ctx.now ?? Date.now)()),
	),

	invite: memberProcedure({ invitation: ["create"] })
		.input(
			z.object({
				email: z.email().max(254),
				role,
				locale: z.enum(["fr", "en"]).default("fr"),
			}),
		)
		.mutation(({ ctx, input }) =>
			team(async () => {
				if (
					!(await ctx.rateLimit(
						`team-invite:${ctx.organizationId}`,
						BOOKING_LIMITS.invitationsPerOrganization,
					))
				) {
					throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
				}
				const created = await inviteMember(ctx.db(), {
					organizationId: ctx.organizationId,
					inviterId: ctx.user.id,
					email: input.email,
					role: input.role,
					nowMs: (ctx.now ?? Date.now)(),
				});
				const t = createTranslator({
					locale: input.locale,
					messages: input.locale === "en" ? en : fr,
					namespace: "auth.roles",
				});
				const send = () =>
					sendInvitationEmail({
						to: created.invitation.email,
						locale: input.locale,
						invitationId: created.invitation.id,
						practiceName: created.practiceName,
						inviterName: created.inviterName,
						roleLabel: t(input.role),
					}).catch((error: unknown) => {
						console.error("Invitation email failed:", error);
					});
				if (ctx.defer) {
					ctx.defer(send);
				} else {
					await send();
				}
				return {
					id: created.invitation.id,
					email: created.invitation.email,
					expiresAt: created.invitation.expiresAt,
				};
			}),
		),

	cancelInvitation: memberProcedure({ invitation: ["cancel"] })
		.input(invitationId)
		.mutation(({ ctx, input }) =>
			team(() => cancelInvitation(ctx.db(), ctx.organizationId, input.invitationId)),
		),

	updateRole: memberProcedure({ member: ["update"] })
		.input(z.object({ memberId: z.string().min(1).max(64), role }))
		.mutation(({ ctx, input }) =>
			team(() =>
				updateMemberRole(ctx.db(), {
					organizationId: ctx.organizationId,
					actorUserId: ctx.user.id,
					memberId: input.memberId,
					role: input.role,
				}),
			),
		),

	remove: memberProcedure({ member: ["delete"] })
		.input(z.object({ memberId: z.string().min(1).max(64) }))
		.mutation(({ ctx, input }) =>
			team(() =>
				removeMember(ctx.db(), {
					organizationId: ctx.organizationId,
					actorUserId: ctx.user.id,
					memberId: input.memberId,
				}),
			),
		),

	/** Open invitations sent to the signed-in person's address (dashboard). */
	mine: mfaProcedure.query(({ ctx }) =>
		openInvitationsFor(ctx.db(), ctx.user.email, (ctx.now ?? Date.now)()),
	),

	/** The invited person's view of an invitation (nothing about the practice for another address). */
	invitation: mfaProcedure
		.input(invitationId)
		.query(({ ctx, input }) =>
			invitationFor(ctx.db(), input.invitationId, ctx.user, (ctx.now ?? Date.now)()),
		),

	accept: mfaProcedure
		.input(invitationId)
		.mutation(({ ctx, input }) =>
			team(() => acceptInvitation(ctx.db(), input.invitationId, ctx.user, (ctx.now ?? Date.now)())),
		),

	decline: mfaProcedure
		.input(invitationId)
		.mutation(({ ctx, input }) =>
			team(() => declineInvitation(ctx.db(), input.invitationId, ctx.user)),
		),
});
