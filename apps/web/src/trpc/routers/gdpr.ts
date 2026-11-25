import { hasMarkup, normalizePlainText } from "@apercura/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LOCALES } from "~/i18n/locales";
import { REPORT_KINDS, requestRemoval, submitReport } from "~/server/gdpr/service";
import { mailErrorSummary } from "~/server/mail/error-summary";
import { sendNotice } from "~/server/mail/notices";
import { practitionerRefInput } from "~/server/practitioner-ref";
import { clientRateLimitKey } from "~/server/rate-limit";
import { refreshPractitioners } from "~/server/refresh";
import { createTRPCRouter, publicProcedure } from "../init";
import { service } from "./errors";

/** Plan §10: reports 5/h per client; removal requests share the same budget. */
export const PUBLIC_FORM_LIMIT = { max: 5, windowSeconds: 60 * 60 };

const plain = (max: number) =>
	z
		.string()
		.max(max * 2)
		.transform((value) => normalizePlainText(value, { multiline: true }))
		.refine((value) => value.length <= max, { message: "TOO_LONG" })
		.refine((value) => !hasMarkup(value), { message: "MARKUP" });

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Public GDPR tools: objecting to a page (art. 21) and reporting an error. */
export const gdprRouter = createTRPCRouter({
	requestRemoval: publicProcedure
		.input(
			z.object({
				/** The page: an RPPS in France, the list letters and number in Austria (`w7983`). */
				ref: practitionerRefInput,
				contact: email,
				message: plain(1000).optional(),
				/** The person confirms they are the practitioner of the page. */
				isPractitioner: z.literal(true),
				locale: z.enum(LOCALES).default("fr"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!(await ctx.rateLimit(clientRateLimitKey("removal", ctx.headers), PUBLIC_FORM_LIMIT))) {
				throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
			}
			const request = await service(() =>
				requestRemoval(ctx.db(), {
					ref: input.ref,
					contact: input.contact,
					message: input.message || null,
					locale: input.locale,
				}),
			);
			await refreshPractitioners(ctx.db().$client, [request.practitionerId]);
			try {
				await sendNotice({ to: input.contact, locale: input.locale, kind: "removalReceived" });
			} catch (error) {
				console.error(`Removal acknowledgment failed: ${mailErrorSummary(error)}`);
			}
			return { ok: true as const };
		}),

	report: publicProcedure
		.input(
			z.object({
				ref: practitionerRefInput.nullable(),
				kind: z.enum(REPORT_KINDS),
				message: plain(2000).refine((value) => value.length >= 5, { message: "TOO_SHORT" }),
				contact: email.nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!(await ctx.rateLimit(clientRateLimitKey("report", ctx.headers), PUBLIC_FORM_LIMIT))) {
				throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
			}
			await service(() => submitReport(ctx.db(), input));
			return { ok: true as const };
		}),
});
