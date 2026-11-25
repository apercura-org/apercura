import {
	type AppointmentType,
	type AvailabilityException,
	type AvailabilityRule,
	type BusyInterval,
	bookingNoticeMin,
	computeSlots,
	isSlotOffered,
	MAX_SLOT_DAYS,
	type SlotQuery,
} from "@apercura/core/booking";
import {
	type IsoWeekday,
	instantToLocalDate,
	localToInstant,
	parseLocalDate,
} from "@apercura/core/time";
import {
	appointments,
	appointmentTypes,
	availabilityExceptions,
	availabilityRules,
	calendars,
} from "@apercura/db/schema";
import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";
import { BookingError } from "./errors";
import { at } from "./sql-time";

export type CalendarRow = typeof calendars.$inferSelect;
export type AppointmentTypeRow = typeof appointmentTypes.$inferSelect;

export const ACTIVE = ["held", "pending", "confirmed"] as const;

/** A calendar by id, optionally restricted to an organization (staff) or to open calendars. */
export async function findCalendar(
	db: Executor,
	calendarId: string,
	scope: { organizationId?: string; openOnly?: boolean } = {},
): Promise<CalendarRow> {
	const [row] = await db
		.select()
		.from(calendars)
		.where(
			and(
				eq(calendars.id, calendarId),
				scope.organizationId ? eq(calendars.organizationId, scope.organizationId) : undefined,
				scope.openOnly ? eq(calendars.status, "open") : undefined,
			),
		)
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row;
}

/** An appointment type of a calendar (active ones only unless `includeInactive`). */
export async function findType(
	db: Executor,
	calendarId: string,
	typeId: string,
	includeInactive = false,
): Promise<AppointmentTypeRow> {
	const [row] = await db
		.select()
		.from(appointmentTypes)
		.where(
			and(
				eq(appointmentTypes.id, typeId),
				eq(appointmentTypes.calendarId, calendarId),
				includeInactive ? undefined : eq(appointmentTypes.active, true),
			),
		)
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	return row;
}

export function toCoreType(row: AppointmentTypeRow): AppointmentType {
	return {
		id: row.id,
		durationMin: row.durationMin,
		beforeMin: row.beforeMin,
		afterMin: row.afterMin,
		// Only home visits travel (the database refuses a travel time elsewhere).
		travelMin: row.location === "home" ? row.travelMin : 0,
		audience: row.audience as AppointmentType["audience"],
	};
}

async function loadRules(db: Executor, calendar: CalendarRow): Promise<AvailabilityRule[]> {
	const rows = await db
		.select()
		.from(availabilityRules)
		.where(eq(availabilityRules.calendarId, calendar.id));
	return rows.map((row) => ({
		siteId: String(calendar.siteId),
		weekday: row.weekday as IsoWeekday,
		start: row.startTime,
		end: row.endTime,
		validFrom: row.validFrom,
		validUntil: row.validUntil,
		typeIds: row.typeIds,
	}));
}

async function loadExceptions(db: Executor, calendarId: string): Promise<AvailabilityException[]> {
	const rows = await db
		.select()
		.from(availabilityExceptions)
		.where(eq(availabilityExceptions.calendarId, calendarId));
	return rows.map((row): AvailabilityException => {
		const base = { kind: row.kind as "closed" | "open", typeIds: row.typeIds };
		return row.span === "days"
			? { ...base, span: "days", fromDate: row.fromDate ?? "", untilDate: row.untilDate ?? "" }
			: { ...base, span: "time", from: row.fromLocal ?? "", until: row.untilLocal ?? "" };
	});
}

/**
 * Ranges the practitioner already occupies on ALL their calendars between two instants. Holds
 * and requests past their `expires_at` are left out even before a write or the sweep expires
 * them (correctness never depends on the scheduled job).
 */
export async function busyIntervals(
	db: Executor,
	practitionerId: number,
	fromMs: number,
	untilMs: number,
	nowMs: number,
	excludeAppointmentId?: string,
): Promise<BusyInterval[]> {
	const now = new Date(nowMs);
	const rows = await db
		.select({ from: appointments.occupiedFrom, until: appointments.occupiedUntil })
		.from(appointments)
		.where(
			and(
				eq(appointments.practitionerId, practitionerId),
				inArray(appointments.status, [...ACTIVE]),
				or(eq(appointments.status, "confirmed"), gt(appointments.expiresAt, now)),
				gt(appointments.occupiedUntil, new Date(fromMs)),
				lt(appointments.occupiedFrom, new Date(untilMs)),
				excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined,
			),
		);
	return rows.map((row) => ({ startMs: row.from.getTime(), endMs: row.until.getTime() }));
}

const DAY_MS = 86_400_000;

/** Everything `computeSlots` needs for a calendar and type, busy ranges around a local range. */
export async function slotQuery(
	db: Executor,
	calendar: CalendarRow,
	type: AppointmentTypeRow,
	range: { fromDate: string; days: number },
	nowMs: number,
	options: {
		patient?: "new" | "existing";
		excludeAppointmentId?: string;
		ignoreBusy?: boolean;
	} = {},
): Promise<SlotQuery> {
	const from = parseLocalDate(range.fromDate);
	// One local day of margin on each side (windows crossing midnight, buffers).
	const startMs = localToInstant(from.subtract({ days: 1 }), 0, calendar.timeZone);
	const endMs = localToInstant(from.add({ days: range.days + 1 }), 0, calendar.timeZone) + DAY_MS;
	const [rules, exceptions, busy] = await Promise.all([
		loadRules(db, calendar),
		loadExceptions(db, calendar.id),
		options.ignoreBusy
			? Promise.resolve([])
			: busyIntervals(
					db,
					calendar.practitionerId,
					startMs,
					endMs,
					nowMs,
					options.excludeAppointmentId,
				),
	]);
	return {
		timeZone: calendar.timeZone,
		rules,
		exceptions,
		busy,
		type: toCoreType(type),
		settings: {
			stepMin: calendar.stepMin,
			// A practice that validates by hand needs time to answer: no time it could not.
			minNoticeMin: bookingNoticeMin(calendar.minNoticeMin, calendar.manualValidation),
			horizonDays: calendar.horizonDays,
		},
		nowMs,
		siteId: String(calendar.siteId),
		...(options.patient ? { patient: options.patient } : {}),
	};
}

/** Bookable starts (UTC ms) of `type` over `days` local days from `fromDate`. */
export async function availableSlots(
	db: Executor,
	calendar: CalendarRow,
	type: AppointmentTypeRow,
	range: { fromDate: string; days: number },
	nowMs: number,
	options: { patient?: "new" | "existing"; excludeAppointmentId?: string } = {},
): Promise<number[]> {
	if (!Number.isInteger(range.days) || range.days < 1 || range.days > MAX_SLOT_DAYS) {
		throw new BookingError("INVALID_INPUT");
	}
	try {
		parseLocalDate(range.fromDate);
	} catch {
		throw new BookingError("INVALID_INPUT");
	}
	const query = await slotQuery(db, calendar, type, range, nowMs, options);
	return computeSlots({ ...query, fromDate: range.fromDate, days: range.days });
}

/**
 * The free starts of a window and the grid starts that are not free (another booking, a block,
 * too close to now, or already gone), so the picker strikes them in their own column. Only
 * start instants leave the server: never who or what occupies a time.
 */
export async function slotGrid(
	db: Executor,
	calendar: CalendarRow,
	type: AppointmentTypeRow,
	range: { fromDate: string; days: number },
	nowMs: number,
	options: { patient?: "new" | "existing"; excludeAppointmentId?: string } = {},
): Promise<{ free: number[]; taken: number[] }> {
	if (!Number.isInteger(range.days) || range.days < 1 || range.days > MAX_SLOT_DAYS) {
		throw new BookingError("INVALID_INPUT");
	}
	let from: ReturnType<typeof parseLocalDate>;
	try {
		from = parseLocalDate(range.fromDate);
	} catch {
		throw new BookingError("INVALID_INPUT");
	}
	const query = await slotQuery(db, calendar, type, range, nowMs, options);
	const free = computeSlots({ ...query, fromDate: range.fromDate, days: range.days });
	// The same grid from the start of the window, busy ranges and minimal notice ignored.
	const windowStartMs = Math.min(nowMs, localToInstant(from, 0, calendar.timeZone));
	const grid = computeSlots({
		...query,
		busy: [],
		nowMs: windowStartMs,
		settings: { ...query.settings, minNoticeMin: 0 },
		fromDate: range.fromDate,
		days: range.days,
	});
	const horizonEndMs = nowMs + calendar.horizonDays * DAY_MS;
	const offered = new Set(free);
	const taken = grid.filter((start) => !offered.has(start) && start < horizonEndMs);
	return { free, taken };
}

/**
 * Whether `startMs` is on the calendar's grid for `type` (rules, exceptions, notice, horizon),
 * busy ranges ignored: the overlap constraint, not a prior read, decides whether it is free.
 */
export async function isOnGrid(
	db: Executor,
	calendar: CalendarRow,
	type: AppointmentTypeRow,
	startMs: number,
	nowMs: number,
): Promise<boolean> {
	const day = instantToLocalDate(startMs, calendar.timeZone).toString();
	const query = await slotQuery(db, calendar, type, { fromDate: day, days: 1 }, nowMs, {
		ignoreBusy: true,
	});
	return isSlotOffered(query, startMs);
}

/** The `count` free starts closest to `aroundMs` (within a week around it), ascending. */
export async function nearestAlternatives(
	db: Executor,
	calendar: CalendarRow,
	type: AppointmentTypeRow,
	aroundMs: number,
	nowMs: number,
	count: number,
	excludeAppointmentId?: string,
): Promise<number[]> {
	const today = instantToLocalDate(nowMs, calendar.timeZone);
	let from = instantToLocalDate(aroundMs, calendar.timeZone).subtract({ days: 3 });
	if (from.compare(today) < 0) {
		from = today;
	}
	const slots = await availableSlots(
		db,
		calendar,
		type,
		{ fromDate: from.toString(), days: 7 },
		nowMs,
		excludeAppointmentId ? { excludeAppointmentId } : {},
	);
	return slots
		.filter((slot) => slot !== aroundMs)
		.sort((a, b) => Math.abs(a - aroundMs) - Math.abs(b - aroundMs) || a - b)
		.slice(0, count)
		.sort((a, b) => a - b);
}

/** SQL fragment: the entry still occupies its slot at `now` (held/pending not lapsed). */
export function occupiesAt(now: Date) {
	return sql`(${appointments.status} = 'confirmed' or (${appointments.status} in ('held', 'pending') and ${appointments.expiresAt} > ${at(now)}))`;
}
