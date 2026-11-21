import { formatPersonName } from "@apercura/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	afterApproval,
	notifyClaimReceived,
	sendRegistryLink,
	userContact,
} from "~/server/claims/notify";
import {
	claimForClaimant,
	claimsOfUser,
	confirmRegistryEmail,
	evaluateClaim,
	findPractitionerByRpps,
	issuePhoneCode,
	prepareRegistryEmail,
	recordPscResult,
	startClaim,
	submitClaim,
	withdrawClaim,
} from "~/server/claims/service";
import { claimDocumentsEnabled, pscConfigured } from "~/server/features";
import { clientRateLimitKey } from "~/server/rate-limit";
import { createTRPCRouter, mfaProcedure, publicProcedure } from "../init";
import { service } from "./errors";

/** Claims per account and day (plan §10: 3/24 h). */
export const CLAIM_LIMIT = { max: 3, windowSeconds: 24 * 60 * 60 };

/** Registry email confirmations per client and hour. */
const LINK_LIMIT = { max: 10, windowSeconds: 60 * 60 };

const claimId = z.object({ claimId: z.uuid() });
const rpps = z.object({ rpps: z.string().regex(/^\d{11}$/) });

const methodOptions = () => ({
	pscEnabled: pscConfigured(),
	documentsEnabled: claimDocumentsEnabled(),
});

/**
 * The claimant's side. Every procedure needs a session that proved a second
 * factor, so the factor always exists before a claim is submitted.
 */
export const claimsRouter = createTRPCRouter({
	mine: mfaProcedure.query(({ ctx }) => claimsOfUser(ctx.db(), ctx.user.id)),

	/** The record an RPPS designates, before the claim starts. */
	preview: mfaProcedure.input(rpps).query(async ({ ctx, input }) => {
		const practitioner = await findPractitionerByRpps(ctx.db(), input.rpps);
		if (practitioner?.status !== "active") {
			throw new TRPCError({ code: "NOT_FOUND" });
		}
		return practitioner;
	}),

	start: mfaProcedure.input(rpps).mutation(async ({ ctx, input }) => {
		if (!(await ctx.rateLimit(`claim:${ctx.user.id}`, CLAIM_LIMIT))) {
			throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
		}
		return service(() => startClaim(ctx.db(), ctx.user.id, input.rpps));
	}),

	get: mfaProcedure
		.input(claimId)
		.query(({ ctx, input }) =>
			service(() => claimForClaimant(ctx.db(), input.claimId, ctx.user.id, methodOptions())),
		),

	sendRegistryEmail: mfaProcedure.input(claimId).mutation(async ({ ctx, input }) => {
		const prepared = await service(() =>
			prepareRegistryEmail(ctx.db(), input.claimId, ctx.user.id),
		);
		const contact = await userContact(ctx.db(), ctx.user.id);
		await sendRegistryLink({
			to: prepared.to,
			token: prepared.token,
			locale: contact?.locale,
			practitionerName: `${prepared.practitioner.firstName} ${formatPersonName(prepared.practitioner.lastName, { familyName: true })}`,
		});
		return { sent: prepared.to.length };
	}),

	/** Called back after Pro Santé Connect was linked (see /api/pro/claims/[id]/psc). */
	pscResult: mfaProcedure.input(claimId).mutation(async ({ ctx, input }) => {
		await service(() => recordPscResult(ctx.db(), input.claimId, ctx.user.id));
		const approval = await service(() => evaluateClaim(ctx.db(), input.claimId));
		if (approval) await afterApproval(ctx.db(), approval);
		return { verified: approval !== null };
	}),

	/** The code to keep on screen for the registry phone callback. Only its hash is stored. */
	phoneCode: mfaProcedure
		.input(claimId)
		.mutation(({ ctx, input }) =>
			service(() => issuePhoneCode(ctx.db(), input.claimId, ctx.user.id)),
		),

	submit: mfaProcedure.input(claimId).mutation(async ({ ctx, input }) => {
		await service(() => submitClaim(ctx.db(), input.claimId, ctx.user.id));
		await notifyClaimReceived(ctx.db(), ctx.user.id);
		return { ok: true as const };
	}),

	/**
	 * Confirms a registry email link. Public: the link may be opened on the
	 * practice's computer, and the token alone proves control of its mailbox.
	 * A button press (POST), never the page load, so link scanners cannot
	 * confirm it.
	 */
	confirmEmail: publicProcedure
		.input(z.object({ token: z.string().min(1).max(64) }))
		.mutation(async ({ ctx, input }) => {
			if (!(await ctx.rateLimit(clientRateLimitKey("claim-link", ctx.headers), LINK_LIMIT))) {
				throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
			}
			const confirmed = await service(() => confirmRegistryEmail(ctx.db(), input.token));
			const approval = confirmed.alreadyDone
				? null
				: await service(() => evaluateClaim(ctx.db(), confirmed.claimId));
			if (approval) await afterApproval(ctx.db(), approval);
			return { verified: approval !== null || confirmed.alreadyDone };
		}),

	withdraw: mfaProcedure.input(claimId).mutation(async ({ ctx, input }) => {
		await service(() => withdrawClaim(ctx.db(), input.claimId, ctx.user.id));
		return { ok: true as const };
	}),
});
