import { hasMarkup, normalizePlainText } from "@apercura/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LOCALES } from "~/i18n/locales";
import { alertAdminsQuietly } from "~/server/admin-alerts";
import { createProofChallenge, verifyProof } from "~/server/booking/proof";
import { submitContactRequest } from "~/server/contact-requests/service";
import { mailErrorSummary } from "~/server/mail/error-summary";
import { sendNotice } from "~/server/mail/notices";
import { clientRateLimitKey, emailRateLimitKey } from "~/server/rate-limit";
import { assertSameOrigin } from "../booking-runtime";
import { createTRPCRouter, publicProcedure } from "../init";
import { service } from "./errors";
import { PUBLIC_FORM_LIMIT } from "./gdpr";

/** Proof-of-work challenges per client and hour: a few retries per form, no more. */
const CHALLENGE_LIMIT = { max: 20, windowSeconds: 60 * 60 };

/**
 * Acknowledgments per address and day, whoever sends the form: an address typed by someone else
 * from many connections still gets three at most (the requests themselves are kept).
 */
const ACK_LIMIT = { max: 3, windowSeconds: 24 * 60 * 60 };

const plain = (max: number, min = 0) =>
	z
		.string()
		.max(max * 2)
		.transform((value) => normalizePlainText(value, { multiline: max > 200 }))
		.refine((value) => value.length >= min, { message: "TOO_SHORT" })
		.refine((value) => value.length <= max, { message: "TOO_LONG" })
		.refine((value) => !hasMarkup(value), { message: "MARKUP" });

/** A phone number as people type it: digits, spaces, dots, dashes, parentheses, a leading +. */
const phone = z
	.string()
	.trim()
	.max(32)
	.regex(/^\+?[\d\s().-]{6,31}$/, { message: "PHONE" });

/**
 * "I am this practitioner, contact me" (public): for those who cannot claim their page with
 * Pro Santé Connect, the registry email or a document. Same budget as the GDPR forms (5 an hour
 * per client) and an ALTCHA proof of work; stored encrypted; the requester gets a fixed
 * acknowledgment (never their own text back, so the form cannot relay messages to third
 * parties) and the administrators a batched alert.
 */
export const practitionerContactRouter = createTRPCRouter({
	/** A signed ALTCHA challenge for the form (self-hosted, no third-party request). */
	challenge: publicProcedure.query(async ({ ctx }) => {
		if (
			!(await ctx.rateLimit(clientRateLimitKey("contact-challenge", ctx.headers), CHALLENGE_LIMIT))
		) {
			throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
		}
		return createProofChallenge();
	}),

	submit: publicProcedure
		.input(
			z.object({
				rpps: z.string().regex(/^\d{11}$/),
				name: plain(120, 2),
				email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
				phone: phone.nullable(),
				message: plain(2000, 10),
				locale: z.enum(LOCALES).default("fr"),
				altcha: z.string().min(16).max(8192),
				/** Honeypot: hidden from people, filled by naive bots. */
				website: z.string().max(0).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertSameOrigin(ctx.headers);
			if (!(await ctx.rateLimit(clientRateLimitKey("contact", ctx.headers), PUBLIC_FORM_LIMIT))) {
				throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
			}
			if (!(await verifyProof({ rateLimit: ctx.rateLimit }, input.altcha))) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "PROOF" });
			}
			await service(() =>
				submitContactRequest(ctx.db(), {
					rpps: input.rpps,
					name: input.name,
					email: input.email,
					phone: input.phone,
					message: input.message,
					locale: input.locale,
				}),
			);
			const followUp = async () => {
				try {
					if (await ctx.rateLimit(emailRateLimitKey("contact-ack", input.email), ACK_LIMIT)) {
						await sendNotice({ to: input.email, locale: input.locale, kind: "contactReceived" });
					}
				} catch (error) {
					console.error(`Contact request acknowledgment failed: ${mailErrorSummary(error)}`);
				}
				await alertAdminsQuietly(ctx.db(), "contact_requests");
			};
			if (ctx.defer) ctx.defer(followUp);
			else await followUp();
			return { ok: true as const };
		}),
});
