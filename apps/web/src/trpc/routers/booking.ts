import { MAX_HOME_ADDRESS_LENGTH } from "@apercura/core/booking";
import { z } from "zod";
import { LOCALES } from "~/i18n/locales";
import { BOOKING_LIMITS, BROWSER_COOKIE, bookingEnabled } from "~/server/booking/config";
import { asTrpc, BookingError } from "~/server/booking/errors";
import { hold } from "~/server/booking/hold";
import {
	cancelManaged,
	confirmManagedEmail,
	getManaged,
	managedSlots,
	rescheduleManaged,
} from "~/server/booking/manage";
import { createProofChallenge } from "~/server/booking/proof";
import { bookingOptions, bookingSlots } from "~/server/booking/public";
import { limit } from "~/server/booking/runtime";
import { release, resendCode, verify } from "~/server/booking/verify";
import { newOpaqueToken } from "~/server/phi";
import { assertSameOrigin, bookingRuntime, readCookie } from "../booking-runtime";
import { type Context, createTRPCRouter, publicProcedure } from "../init";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const days = z.number().int().min(1).max(14);
const holdRef = { holdId: z.uuid(), holdToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) };
const manageToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const name = z.string().trim().min(1).max(100);
/** Home visits: the patient's street address and the INSEE code of their commune. */
export const homeAddress = z.object({
	street: z.string().trim().min(1).max(MAX_HOME_ADDRESS_LENGTH),
	communeCode: z
		.string()
		.trim()
		.regex(/^(\d{5}|2[ABab]\d{3})$/),
});

/** Public mutations: same-origin only. Queries never write booking data. */
const publicMutation = publicProcedure.use(({ ctx, next }) => {
	assertSameOrigin(ctx.headers);
	return next();
});

/** The browser's booking cookie, set on the first hold (one live hold per browser). */
function browserKey(ctx: Context): string {
	const existing = readCookie(ctx.headers, BROWSER_COOKIE);
	if (existing) {
		return existing;
	}
	const value = newOpaqueToken();
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	ctx.resHeaders?.append(
		"set-cookie",
		`${BROWSER_COOKIE}=${value}; Path=/api/trpc; Max-Age=86400; HttpOnly; SameSite=Strict${secure}`,
	);
	return value;
}

/**
 * The patient's manage link. The token is posted in the body of a mutation, never sent in a URL
 * (tRPC queries are GET requests with their input in the query string): even the read-only
 * `get` and `slots` are mutations, and none of them is reachable by GET.
 */
const manageRouter = createTRPCRouter({
	get: publicMutation
		.input(z.object({ token: manageToken }))
		.mutation(({ ctx, input }) => asTrpc(() => getManaged(bookingRuntime(ctx), input.token))),
	confirm: publicMutation
		.input(z.object({ token: manageToken }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => confirmManagedEmail(bookingRuntime(ctx), input.token)),
		),
	cancel: publicMutation
		.input(z.object({ token: manageToken }))
		.mutation(({ ctx, input }) => asTrpc(() => cancelManaged(bookingRuntime(ctx), input.token))),
	slots: publicMutation
		.input(z.object({ token: manageToken, fromDate: localDate, days }))
		.mutation(({ ctx, input }) => asTrpc(() => managedSlots(bookingRuntime(ctx), input))),
	reschedule: publicMutation
		.input(z.object({ token: manageToken, startsAt: z.date() }))
		.mutation(({ ctx, input }) => asTrpc(() => rescheduleManaged(bookingRuntime(ctx), input))),
});

/** Online booking for patients (plan §9). Public, rate limited, disabled with FEATURE_BOOKING. */
export const bookingRouter = createTRPCRouter({
	/** A signed ALTCHA proof-of-work challenge, solved by the browser before `hold`. */
	challenge: publicProcedure.query(({ ctx }) =>
		asTrpc(async () => {
			if (!bookingEnabled()) {
				throw new BookingError("BOOKING_DISABLED");
			}
			const rt = bookingRuntime(ctx);
			await limit(rt, rt.clientKey("booking-challenge"), BOOKING_LIMITS.challengesPerIp);
			return createProofChallenge();
		}),
	),

	options: publicProcedure
		.input(
			z
				.object({
					practitionerId: z.number().int().positive().optional(),
					calendarId: z.uuid().optional(),
				})
				.refine((value) => value.practitionerId !== undefined || value.calendarId !== undefined),
		)
		.query(({ ctx, input }) => asTrpc(() => bookingOptions(bookingRuntime(ctx), input))),

	slots: publicProcedure
		.input(
			z.object({
				calendarId: z.uuid(),
				typeId: z.uuid(),
				fromDate: localDate,
				days,
				patient: z.enum(["new", "existing"]).optional(),
			}),
		)
		.query(({ ctx, input }) => asTrpc(() => bookingSlots(bookingRuntime(ctx), input))),

	hold: publicMutation
		.input(
			z.object({
				calendarId: z.uuid(),
				typeId: z.uuid(),
				startsAt: z.date(),
				patient: z.object({
					firstName: name,
					lastName: name,
					email: z.string().trim().min(3).max(254),
					phone: z.string().trim().max(32).nullish(),
					isNew: z.boolean().nullish(),
					homeAddress: homeAddress.nullish(),
				}),
				locale: z.enum(LOCALES),
				idempotencyKey: z.uuid(),
				altcha: z.string().min(16).max(8192),
				/** Honeypot: hidden from people, filled by naive bots. */
				website: z.string().max(0).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				hold(bookingRuntime(ctx), {
					calendarId: input.calendarId,
					typeId: input.typeId,
					startsAt: input.startsAt,
					patient: input.patient,
					locale: input.locale,
					idempotencyKey: input.idempotencyKey,
					proof: input.altcha,
					browserKey: browserKey(ctx),
				}),
			),
		),

	resendCode: publicMutation
		.input(z.object(holdRef))
		.mutation(({ ctx, input }) => asTrpc(() => resendCode(bookingRuntime(ctx), input))),

	verify: publicMutation
		.input(
			z.object({
				...holdRef,
				code: z
					.string()
					.trim()
					.regex(/^\d{6}$/),
			}),
		)
		.mutation(({ ctx, input }) => asTrpc(() => verify(bookingRuntime(ctx), input))),

	release: publicMutation
		.input(z.object(holdRef))
		.mutation(({ ctx, input }) => asTrpc(() => release(bookingRuntime(ctx), input))),

	manage: manageRouter,
});
