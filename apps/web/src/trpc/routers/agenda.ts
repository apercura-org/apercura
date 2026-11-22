import { APPOINTMENT_STATUSES } from "@apercura/db/schema";
import { z } from "zod";
import {
	blockTime,
	cancelEntry,
	createEntry,
	decideRequest,
	listAgenda,
	listAgendaCalendars,
	markNoShow,
	type StaffContext,
} from "~/server/booking/agenda";
import { asTrpc } from "~/server/booking/errors";
import { bookingRuntime } from "../booking-runtime";
import { createTRPCRouter, memberProcedure } from "../init";

const name = z.string().trim().min(1).max(100);

const staff = (ctx: { organizationId: string; user: { id: string } }): StaffContext => ({
	organizationId: ctx.organizationId,
	userId: ctx.user.id,
});

/**
 * The practice's agenda (plan §9). Second factor and membership checked on every call; every
 * query is scoped by the organization read from the database, never by the client.
 */
export const agendaRouter = createTRPCRouter({
	/** Entries in a range (at most 6 weeks), patient data decrypted with an audit row. */
	list: memberProcedure({ agenda: ["read"] })
		.input(
			z.object({
				calendarId: z.uuid().optional(),
				from: z.date(),
				to: z.date(),
				statuses: z.array(z.enum(APPOINTMENT_STATUSES)).max(9).optional(),
			}),
		)
		.query(({ ctx, input }) => asTrpc(() => listAgenda(bookingRuntime(ctx), staff(ctx), input))),

	/** Calendars, sites, types and opening hours: what drawing the agenda needs (no patient data). */
	calendars: memberProcedure({ agenda: ["read"] }).query(({ ctx }) =>
		asTrpc(() => listAgendaCalendars(bookingRuntime(ctx), staff(ctx))),
	),

	/** An appointment taken by phone: confirmed at once, outside the opening hours if need be. */
	create: memberProcedure({ agenda: ["write"] })
		.input(
			z.object({
				calendarId: z.uuid(),
				typeId: z.uuid(),
				startsAt: z.date(),
				patient: z.object({
					firstName: name,
					lastName: name,
					email: z.string().trim().max(254).nullish(),
					phone: z.string().trim().max(32).nullish(),
				}),
				locale: z.enum(["fr", "en"]).default("fr"),
				idempotencyKey: z.uuid().optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			asTrpc(() => createEntry(bookingRuntime(ctx), staff(ctx), input)),
		),

	block: memberProcedure({ agenda: ["write"] })
		.input(z.object({ calendarId: z.uuid(), startsAt: z.date(), endsAt: z.date() }))
		.mutation(({ ctx, input }) => asTrpc(() => blockTime(bookingRuntime(ctx), staff(ctx), input))),

	cancel: memberProcedure({ agenda: ["write"] })
		.input(z.object({ appointmentId: z.uuid(), message: z.string().trim().max(500).nullish() }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => cancelEntry(bookingRuntime(ctx), staff(ctx), input)),
		),

	/** Accept or decline a pending request. */
	decide: memberProcedure({ agenda: ["write"] })
		.input(z.object({ appointmentId: z.uuid(), decision: z.enum(["approve", "decline"]) }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => decideRequest(bookingRuntime(ctx), staff(ctx), input)),
		),

	noShow: memberProcedure({ agenda: ["write"] })
		.input(z.object({ appointmentId: z.uuid() }))
		.mutation(({ ctx, input }) => asTrpc(() => markNoShow(bookingRuntime(ctx), staff(ctx), input))),
});
