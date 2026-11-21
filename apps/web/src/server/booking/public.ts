import { appointmentTypes, calendars, sites } from "@apercura/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { findCalendar, findType, slotGrid } from "./availability";
import { BOOKING_LIMITS, bookingEnabled } from "./config";
import { BookingError } from "./errors";
import { type BookingRuntime, limit } from "./runtime";

/*
 * Read-only public procedures. They never write booking data (lapsed holds are
 * filtered out at read time, never expired here): crawlers and link scanners
 * may call them as often as they like.
 */

/** `booking.options`: the open calendars of a practitioner (or one calendar) and their types. */
export async function bookingOptions(
	rt: BookingRuntime,
	input: { practitionerId?: number | undefined; calendarId?: string | undefined },
) {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await limit(rt, rt.clientKey("booking-read"), BOOKING_LIMITS.slotsPerIp);
	if (input.practitionerId === undefined && input.calendarId === undefined) {
		throw new BookingError("INVALID_INPUT");
	}
	const rows = await rt.db
		.select({
			id: calendars.id,
			practitionerId: calendars.practitionerId,
			siteId: calendars.siteId,
			timeZone: calendars.timeZone,
			requirePhone: calendars.requirePhone,
			askFirstVisit: calendars.askFirstVisit,
			acceptsNewPatients: calendars.acceptsNewPatients,
			manualValidation: calendars.manualValidation,
			publicInstructions: calendars.publicInstructions,
			siteName: sites.name,
			addressLine: sites.addressLine,
			postcode: sites.postcode,
			communeLabel: sites.communeLabel,
		})
		.from(calendars)
		.innerJoin(sites, eq(sites.id, calendars.siteId))
		.where(
			and(
				eq(calendars.status, "open"),
				input.calendarId ? eq(calendars.id, input.calendarId) : undefined,
				input.practitionerId !== undefined
					? eq(calendars.practitionerId, input.practitionerId)
					: undefined,
			),
		)
		.orderBy(asc(calendars.createdAt));
	if (rows.length === 0) {
		return { calendars: [] };
	}
	const types = await rt.db
		.select({
			id: appointmentTypes.id,
			calendarId: appointmentTypes.calendarId,
			name: appointmentTypes.name,
			durationMin: appointmentTypes.durationMin,
			audience: appointmentTypes.audience,
		})
		.from(appointmentTypes)
		.where(
			and(
				inArray(
					appointmentTypes.calendarId,
					rows.map((row) => row.id),
				),
				eq(appointmentTypes.active, true),
			),
		)
		.orderBy(asc(appointmentTypes.position));
	return {
		calendars: rows.map((row) => ({
			...row,
			types: types
				.filter((type) => type.calendarId === row.id)
				.map(({ calendarId: _calendar, ...type }) => type),
		})),
	};
}

/** `booking.slots`: UTC starts over at most 14 local days (the client groups them by day). */
export async function bookingSlots(
	rt: BookingRuntime,
	input: {
		calendarId: string;
		typeId: string;
		fromDate: string;
		days: number;
		patient?: "new" | "existing" | undefined;
	},
) {
	if (!bookingEnabled()) {
		throw new BookingError("BOOKING_DISABLED");
	}
	await limit(rt, rt.clientKey("booking-read"), BOOKING_LIMITS.slotsPerIp);
	const calendar = await findCalendar(rt.db, input.calendarId, { openOnly: true });
	const type = await findType(rt.db, calendar.id, input.typeId);
	const { free, taken } = await slotGrid(
		rt.db,
		calendar,
		type,
		{ fromDate: input.fromDate, days: input.days },
		rt.nowMs(),
		input.patient ? { patient: input.patient } : {},
	);
	return {
		timeZone: calendar.timeZone,
		slots: free.map((ms) => new Date(ms)),
		/** Grid starts that cannot be booked: start instants only, never who holds them. */
		taken: taken.map((ms) => new Date(ms)),
	};
}
