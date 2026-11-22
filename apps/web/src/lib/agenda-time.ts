/**
 * Wall-clock helpers of the agenda pages. Every calendar lives in its site's time zone, which
 * may differ from the browser's (a practice in Réunion run from Paris): dates and times are
 * always computed in the calendar's zone, never with the browser's local `Date` methods.
 */

import { instantToLocalDate, isoWeekday, localToInstant } from "@apercura/core/time";
import { CalendarDate } from "@internationalized/date";

export { instantToLocalDate, localToInstant };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function wallFormat(timeZone: string) {
	let format = partsCache.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		partsCache.set(timeZone, format);
	}
	return format;
}

/** Minutes since local midnight of an instant, in `timeZone`. */
export function localMinutes(instantMs: number, timeZone: string): number {
	const parts = wallFormat(timeZone).formatToParts(instantMs);
	const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
	const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
	return hour * 60 + minute;
}

/** The Monday of the week that contains `date`. */
export function weekStart(date: CalendarDate): CalendarDate {
	return date.subtract({ days: isoWeekday(date) - 1 });
}

/** `YYYY-MM-DD`. */
export function isoDate(date: CalendarDate): string {
	return date.toString();
}

/** Parses `YYYY-MM-DD`, or null. */
export function parseIsoDate(value: string | null | undefined): CalendarDate | null {
	const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
	if (!match) return null;
	try {
		const date = new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
		return date.toString() === value ? date : null;
	} catch {
		return null;
	}
}

/** `[start, end)` instants of a local day in `timeZone`. */
export function dayBounds(date: CalendarDate, timeZone: string): [number, number] {
	return [localToInstant(date, 0, timeZone), localToInstant(date.add({ days: 1 }), 0, timeZone)];
}

/** `HH:mm` of minutes since midnight. */
export function hhmm(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Minutes since midnight of `HH:mm` (`24:00` is 1440), or null. */
export function minutesOf(value: string): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const total = Number(match[1]) * 60 + Number(match[2]);
	return total <= 24 * 60 && Number(match[2]) < 60 ? total : null;
}

/** A local date as a UTC-noon `Date`, for `Intl` date formatting that ignores the time zone. */
export function noonOf(date: CalendarDate): Date {
	return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}

export { isoWeekday };
