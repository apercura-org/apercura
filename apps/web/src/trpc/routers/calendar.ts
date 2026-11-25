import { MAX_SERVICE_AREA, MAX_TRAVEL_MIN } from "@apercura/core/booking";
import { z } from "zod";
import { LOCALES } from "~/i18n/locales";
import {
	addException,
	agendaOverview,
	createCalendar,
	listCalendars,
	presetsFor,
	removeException,
	replaceRules,
	revokeFeedToken,
	rotateFeedToken,
	saveType,
	setCalendarStatus,
	suggestAreaAround,
	updateCalendar,
} from "~/server/booking/calendar-settings";
import { asTrpc } from "~/server/booking/errors";
import { agendaRequirements } from "~/server/booking/gate";
import { searchCommunes } from "~/server/booking/home-visit";
import { feedUrl } from "~/server/booking/ics-feed";
import { bookingRuntime } from "../booking-runtime";
import { createTRPCRouter, memberProcedure } from "../init";

/** Owners only: opening and configuring the agenda (`agenda:open`). */
const owner = memberProcedure({ agenda: ["open"] });

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);

const settings = z.object({
	minNoticeMin: z.number().int().min(0).max(43_200).optional(),
	horizonDays: z.number().int().min(0).max(365).optional(),
	stepMin: z.number().int().min(5).max(240).optional(),
	manualValidation: z.boolean().optional(),
	acceptsNewPatients: z.boolean().optional(),
	cancellationCutoffMin: z.number().int().min(0).max(20_160).optional(),
	requirePhone: z.boolean().optional(),
	askFirstVisit: z.boolean().optional(),
	retentionDays: z.number().int().min(30).max(365).optional(),
	publicInstructions: z.string().trim().max(1000).nullish(),
	icsFullNames: z.boolean().optional(),
});

const typeFields = {
	name: z.string().trim().min(1).max(80),
	durationMin: z.number().int().min(5).max(480),
	beforeMin: z.number().int().min(0).max(240).default(0),
	afterMin: z.number().int().min(0).max(240).default(0),
	audience: z.enum(["all", "new", "existing"]).default("all"),
	position: z.number().int().min(0).max(1000).optional(),
	active: z.boolean().optional(),
	/** `home`: a home visit (the patient's address, inside the service area). */
	// Left out, an update keeps the type's place, travel time and communes.
	location: z.enum(["site", "home"]).optional(),
	/** Home visits: fixed travel time after each visit, in minutes. */
	travelMin: z.number().int().min(0).max(MAX_TRAVEL_MIN).optional(),
	/** Home visits: INSEE codes of the communes visited. */
	serviceAreaCodes: z
		.array(
			z
				.string()
				.trim()
				.regex(/^(\d{5}|2[ABab]\d{3})$/),
		)
		.max(MAX_SERVICE_AREA)
		.optional(),
};

const typeIds = z.array(z.uuid()).max(50).optional();

/** Calendar settings (plan §9): calendars per site, types, weekly rules, exceptions. */
export const calendarRouter = createTRPCRouter({
	list: owner.query(({ ctx }) => listCalendars(ctx.db(), ctx.organizationId)),

	/** The settings page: places with their time zone, calendars, presets and the agenda gate. */
	overview: owner
		.input(z.object({ locale: z.enum(LOCALES) }))
		.query(({ ctx, input }) =>
			asTrpc(() =>
				agendaOverview(
					ctx.db(),
					ctx.organizationId,
					input.locale,
					new Date((ctx.now ?? Date.now)()),
				),
			),
		),

	/** Issues a new private feed link (the old one stops working). The URL is shown once. */
	rotateFeed: owner.input(z.object({ calendarId: z.uuid() })).mutation(({ ctx, input }) =>
		asTrpc(async () => {
			const { token } = await rotateFeedToken(
				bookingRuntime(ctx),
				ctx.organizationId,
				input.calendarId,
			);
			return { url: feedUrl(token) };
		}),
	),

	revokeFeed: owner
		.input(z.object({ calendarId: z.uuid() }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => revokeFeedToken(bookingRuntime(ctx), ctx.organizationId, input.calendarId)),
		),

	/** What opening the agenda still needs: verified claim, fees, payment methods. */
	requirements: owner
		.input(z.object({ practitionerId: z.number().int().positive() }))
		.query(({ ctx, input }) =>
			agendaRequirements(ctx.db(), ctx.organizationId, input.practitionerId),
		),

	presets: owner
		.input(z.object({ practitionerId: z.number().int().positive(), locale: z.enum(LOCALES) }))
		.query(({ ctx, input }) =>
			asTrpc(() => presetsFor(ctx.db(), ctx.organizationId, input.practitionerId, input.locale)),
		),

	create: owner
		.input(
			z.object({
				practitionerId: z.number().int().positive(),
				siteId: z.number().int().positive(),
				withPresets: z.boolean().default(true),
				locale: z.enum(LOCALES).default("fr"),
				settings: settings.optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				createCalendar(ctx.db(), ctx.organizationId, {
					practitionerId: input.practitionerId,
					siteId: input.siteId,
					withPresets: input.withPresets,
					locale: input.locale,
					...(input.settings ? { settings: input.settings } : {}),
				}),
			),
		),

	update: owner
		.input(z.object({ calendarId: z.uuid(), settings }))
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				updateCalendar(bookingRuntime(ctx), ctx.organizationId, input.calendarId, input.settings),
			),
		),

	/** Opens the agenda online (requirements checked) or pauses it. */
	setStatus: owner
		.input(z.object({ calendarId: z.uuid(), status: z.enum(["open", "paused"]) }))
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				setCalendarStatus(bookingRuntime(ctx), ctx.organizationId, input.calendarId, input.status),
			),
		),

	saveType: owner
		.input(z.object({ calendarId: z.uuid(), typeId: z.uuid().optional(), ...typeFields }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => saveType(bookingRuntime(ctx), ctx.organizationId, input)),
		),

	replaceRules: owner
		.input(
			z.object({
				calendarId: z.uuid(),
				rules: z
					.array(
						z.object({
							weekday: z.number().int().min(1).max(7),
							startTime: localTime,
							endTime: localTime,
							typeIds,
							validFrom: localDate.nullish(),
							validUntil: localDate.nullish(),
						}),
					)
					.max(100),
			}),
		)
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				replaceRules(bookingRuntime(ctx), ctx.organizationId, input.calendarId, input.rules),
			),
		),

	addException: owner
		.input(
			z.object({
				calendarId: z.uuid(),
				exception: z.discriminatedUnion("span", [
					z.object({
						kind: z.enum(["closed", "open"]),
						span: z.literal("days"),
						fromDate: localDate,
						untilDate: localDate,
						typeIds,
					}),
					z.object({
						kind: z.enum(["closed", "open"]),
						span: z.literal("time"),
						from: localDateTime,
						until: localDateTime,
						typeIds,
					}),
				]),
			}),
		)
		.mutation(({ ctx, input }) =>
			asTrpc(() =>
				addException(bookingRuntime(ctx), ctx.organizationId, input.calendarId, input.exception),
			),
		),

	removeException: owner
		.input(z.object({ exceptionId: z.uuid() }))
		.mutation(({ ctx, input }) =>
			asTrpc(() => removeException(bookingRuntime(ctx), ctx.organizationId, input.exceptionId)),
		),

	/** Home visits: communes and arrondissements by name, postcode or INSEE code. */
	searchCommunes: owner
		.input(z.object({ q: z.string().trim().min(2).max(80) }))
		.query(({ ctx, input }) => asTrpc(() => searchCommunes(ctx.db(), input.q))),

	/** Home visits: communes within a radius of the calendar's site, to fill a service area. */
	communesAround: owner
		.input(z.object({ calendarId: z.uuid(), radiusKm: z.number().int().min(1).max(50) }))
		.query(({ ctx, input }) =>
			asTrpc(() =>
				suggestAreaAround(ctx.db(), ctx.organizationId, input.calendarId, input.radiusKm),
			),
		),
});
