import type { CalendarDate } from "@internationalized/date";
import {
	assertTimeZone,
	instantToLocalDate,
	isoWeekday,
	type LocalDate,
	localToInstant,
	MINUTE_MS,
	parseLocalDate,
	parseLocalDateTime,
	parseLocalTime,
} from "../time/local";
import { type Interval, subtractIntervals, unionIntervals } from "./intervals";
import { assertOccupancyType, occupancy } from "./occupancy";
import type {
	AppointmentType,
	AvailabilityException,
	AvailabilityRule,
	BusyInterval,
	CalendarSettings,
} from "./types";

/** Largest number of local days a single {@link computeSlots} call may cover. */
export const MAX_SLOT_DAYS = 14;

export interface SlotQuery {
	/** IANA time zone of the site (see `timeZoneForDepartment`). */
	timeZone: string;
	rules: readonly AvailabilityRule[];
	exceptions: readonly AvailabilityException[];
	/**
	 * Ranges already occupied by the practitioner on all of their calendars, buffers included.
	 * Expired holds and requests must be left out by the caller. Any order.
	 */
	busy: readonly BusyInterval[];
	type: AppointmentType;
	settings: CalendarSettings;
	/** Current instant, injected by the caller. */
	nowMs: number;
	/** When set, only the rules of this site are used. */
	siteId?: string;
	/**
	 * When known, whether the patient is new or already followed. A type reserved to the other
	 * audience then yields no slot. When unknown, every type is offered.
	 */
	patient?: "new" | "existing";
}

export interface ComputeSlotsInput extends SlotQuery {
	/** First local day of the range. */
	fromDate: LocalDate;
	/** Number of local days in the range, from 1 to {@link MAX_SLOT_DAYS}. */
	days: number;
}

interface ParsedRule {
	weekday: number;
	startMin: number;
	endMin: number;
	validFrom: CalendarDate | null;
	validUntil: CalendarDate | null;
}

function allowsType(typeIds: readonly string[] | null | undefined, typeId: string): boolean {
	return typeIds === undefined || typeIds === null || typeIds.length === 0
		? true
		: typeIds.includes(typeId);
}

function assertNonNegativeInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative integer`);
	}
}

function validateQuery(query: SlotQuery): void {
	assertTimeZone(query.timeZone);
	assertOccupancyType(query.type);
	const { stepMin, minNoticeMin, horizonDays } = query.settings;
	if (!Number.isInteger(stepMin) || stepMin <= 0) {
		throw new RangeError("stepMin must be a positive integer");
	}
	assertNonNegativeInteger(minNoticeMin, "minNoticeMin");
	assertNonNegativeInteger(horizonDays, "horizonDays");
	if (!Number.isFinite(query.nowMs)) {
		throw new RangeError("nowMs must be a finite number");
	}
}

function parseRule(rule: AvailabilityRule): ParsedRule {
	if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
		throw new RangeError(`Invalid ISO weekday: ${rule.weekday}`);
	}
	const startMin = parseLocalTime(rule.start);
	const endMin = parseLocalTime(rule.end);
	if (endMin <= startMin) {
		throw new RangeError(`Rule ends before it starts: ${rule.start}–${rule.end}`);
	}
	return {
		weekday: rule.weekday,
		startMin,
		endMin,
		validFrom: rule.validFrom ? parseLocalDate(rule.validFrom) : null,
		validUntil: rule.validUntil ? parseLocalDate(rule.validUntil) : null,
	};
}

function exceptionInterval(exception: AvailabilityException, timeZone: string): Interval {
	if (exception.span === "days") {
		const from = parseLocalDate(exception.fromDate);
		const until = parseLocalDate(exception.untilDate);
		if (until.compare(from) < 0) {
			throw new RangeError(`Exception ends before it starts: ${exception.fromDate}`);
		}
		return {
			start: localToInstant(from, 0, timeZone),
			end: localToInstant(until.add({ days: 1 }), 0, timeZone),
		};
	}
	const from = parseLocalDateTime(exception.from);
	const until = parseLocalDateTime(exception.until);
	const interval = {
		start: localToInstant(from.date, from.minutes, timeZone),
		end: localToInstant(until.date, until.minutes, timeZone),
	};
	if (interval.end < interval.start) {
		throw new RangeError(`Exception ends before it starts: ${exception.from}`);
	}
	return interval;
}

/**
 * Bookable windows (sorted, disjoint UTC ranges) for `type`, built from the rules of the local
 * days `[firstDay, firstDay + dayCount)` plus open exceptions, minus closed exceptions.
 * Days are walked as calendar days, never as 24-hour steps.
 */
function buildWindows(query: SlotQuery, firstDay: CalendarDate, dayCount: number): Interval[] {
	const { timeZone, type } = query;
	const rules = query.rules
		.filter((rule) => query.siteId === undefined || rule.siteId === query.siteId)
		.filter((rule) => allowsType(rule.typeIds, type.id))
		.map(parseRule);

	const open: Interval[] = [];
	for (let offset = 0; offset < dayCount; offset += 1) {
		const day = firstDay.add({ days: offset });
		const weekday = isoWeekday(day);
		for (const rule of rules) {
			if (
				rule.weekday === weekday &&
				(rule.validFrom === null || day.compare(rule.validFrom) >= 0) &&
				(rule.validUntil === null || day.compare(rule.validUntil) <= 0)
			) {
				open.push({
					start: localToInstant(day, rule.startMin, timeZone),
					end: localToInstant(day, rule.endMin, timeZone),
				});
			}
		}
	}

	const closed: Interval[] = [];
	for (const exception of query.exceptions) {
		const interval = exceptionInterval(exception, timeZone);
		if (exception.kind === "closed") {
			closed.push(interval);
		} else if (allowsType(exception.typeIds, type.id)) {
			open.push(interval);
		}
	}

	return subtractIntervals(unionIntervals(open), unionIntervals(closed));
}

function offeredToPatient(query: SlotQuery): boolean {
	const { audience } = query.type;
	return audience === "all" || query.patient === undefined || query.patient === audience;
}

/**
 * Computes the bookable start instants (UTC milliseconds, ascending) of `type` over the local
 * days `[fromDate, fromDate + days)` of the site.
 *
 * Candidates advance by `stepMin` real minutes from the start of each window, so daylight saving
 * changes neither duplicate nor drop slots. A start `s` is kept when:
 * - `s ≥ now + minNotice` and its local day is within the horizon;
 * - the appointment itself (without buffers) ends inside its window — buffers may spill out;
 * - `occupancy(type, s)` overlaps no busy interval (half-open, so back-to-back is fine).
 *
 * Pure: no clock read, no I/O.
 *
 * @throws RangeError when `days` is not an integer from 1 to {@link MAX_SLOT_DAYS}, or on
 * malformed input.
 */
export function computeSlots(input: ComputeSlotsInput): number[] {
	validateQuery(input);
	if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_SLOT_DAYS) {
		throw new RangeError(`days must be an integer from 1 to ${MAX_SLOT_DAYS}`);
	}
	if (!offeredToPatient(input)) {
		return [];
	}

	const { timeZone, type, settings, nowMs } = input;
	const fromDay = parseLocalDate(input.fromDate);
	const today = instantToLocalDate(nowMs, timeZone);
	const horizonEnd = localToInstant(today.add({ days: settings.horizonDays + 1 }), 0, timeZone);
	const lower = Math.max(
		localToInstant(fromDay, 0, timeZone),
		nowMs + settings.minNoticeMin * MINUTE_MS,
	);
	const upper = Math.min(
		localToInstant(fromDay.add({ days: input.days }), 0, timeZone),
		horizonEnd,
	);
	if (lower >= upper) {
		return [];
	}

	// One extra day on each side keeps the grid anchored on the true start of windows that cross
	// midnight, so the result for a day does not depend on the range it was asked with.
	const windows = buildWindows(input, fromDay.subtract({ days: 1 }), input.days + 2);
	const busy = unionIntervals(
		input.busy.map((interval) => ({ start: interval.startMs, end: interval.endMs })),
	);
	const stepMs = settings.stepMin * MINUTE_MS;
	const durationMs = type.durationMin * MINUTE_MS;

	const slots: number[] = [];
	let busyIndex = 0;
	for (const window of windows) {
		if (window.end - durationMs < lower) {
			continue;
		}
		if (window.start >= upper) {
			break;
		}
		const skipped = window.start >= lower ? 0 : Math.ceil((lower - window.start) / stepMs);
		for (
			let start = window.start + skipped * stepMs;
			start < upper && start + durationMs <= window.end;
			start += stepMs
		) {
			const occupied = occupancy(type, start);
			while (busyIndex < busy.length && (busy[busyIndex] as Interval).end <= occupied.fromMs) {
				busyIndex += 1;
			}
			const next = busy[busyIndex];
			if (next === undefined || next.start >= occupied.untilMs) {
				slots.push(start);
			}
		}
	}
	return slots;
}

/**
 * Whether `startMs` is exactly one of the slots {@link computeSlots} offers for its local day.
 * `booking.hold` uses it to refuse any start that is not on the grid.
 */
export function isSlotOffered(query: SlotQuery, startMs: number): boolean {
	if (!Number.isFinite(startMs)) {
		return false;
	}
	const day = instantToLocalDate(startMs, query.timeZone);
	return computeSlots({ ...query, fromDate: day.toString(), days: 1 }).includes(startMs);
}
