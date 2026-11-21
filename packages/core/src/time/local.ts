import {
	CalendarDate,
	CalendarDateTime,
	fromAbsolute,
	toCalendarDate,
	toZoned,
} from "@internationalized/date";

/** A local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;
/** A local wall-clock time, `HH:mm` (`24:00` is accepted as an end of day). */
export type LocalTime = string;
/** A local date and wall-clock time, `YYYY-MM-DDTHH:mm`. */
export type LocalDateTime = string;
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MINUTES = 24 * 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** Parses a `YYYY-MM-DD` local date, rejecting impossible dates such as `2026-02-30`. */
export function parseLocalDate(value: LocalDate): CalendarDate {
	const match = DATE_PATTERN.exec(value);
	if (match) {
		const date = new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
		if (date.toString() === value) {
			return date;
		}
	}
	throw new RangeError(`Invalid local date: "${value}"`);
}

/** Parses a `HH:mm` local time into minutes after midnight, from 0 to 1440 (`24:00`). */
export function parseLocalTime(value: LocalTime): number {
	const match = TIME_PATTERN.exec(value);
	if (match) {
		const hours = Number(match[1]);
		const minutes = Number(match[2]);
		if (minutes < 60 && (hours < 24 || (hours === 24 && minutes === 0))) {
			return hours * 60 + minutes;
		}
	}
	throw new RangeError(`Invalid local time: "${value}"`);
}

/** Parses a `YYYY-MM-DDTHH:mm` local date-time into its date and minutes after midnight. */
export function parseLocalDateTime(value: LocalDateTime): { date: CalendarDate; minutes: number } {
	const match = DATE_TIME_PATTERN.exec(value);
	if (match?.[1] !== undefined && match[2] !== undefined) {
		const minutes = parseLocalTime(match[2]);
		if (minutes < DAY_MINUTES) {
			return { date: parseLocalDate(match[1]), minutes };
		}
	}
	throw new RangeError(`Invalid local date-time: "${value}"`);
}

/** Throws a RangeError unless `timeZone` is a time zone known to the runtime. */
export function assertTimeZone(timeZone: string): void {
	try {
		new Intl.DateTimeFormat("en", { timeZone });
	} catch {
		throw new RangeError(`Unknown time zone: "${timeZone}"`);
	}
}

/**
 * Converts a local wall-clock time on `date` (minutes after midnight, up to 1440) into a UTC
 * instant in milliseconds, in `timeZone`.
 *
 * A time that does not exist (skipped by a daylight saving gap) is shifted forward by the length
 * of the gap; a time that occurs twice (when clocks go back) resolves to its first occurrence.
 */
export function localToInstant(date: CalendarDate, minutes: number, timeZone: string): number {
	const day = date.add({ days: Math.floor(minutes / DAY_MINUTES) });
	const rest = minutes % DAY_MINUTES;
	const local = new CalendarDateTime(
		day.year,
		day.month,
		day.day,
		Math.floor(rest / 60),
		rest % 60,
	);
	return toZoned(local, timeZone, "compatible").toDate().getTime();
}

/** Returns the local calendar date of a UTC instant in `timeZone`. */
export function instantToLocalDate(instantMs: number, timeZone: string): CalendarDate {
	return toCalendarDate(fromAbsolute(instantMs, timeZone));
}

/** Returns the ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: CalendarDate): IsoWeekday {
	const sundayBased = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
	return (((sundayBased + 6) % 7) + 1) as IsoWeekday;
}
