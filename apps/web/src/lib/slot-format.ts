/**
 * Dates and times of appointments, always in the site's time zone (never the visitor's). Pure:
 * shared by the emails, the practitioner page and the booking panel, so a slot reads the same
 * everywhere.
 */

import { LOCALE_TAGS, type Locale, toLocale } from "~/i18n/locales";

export type BookingLocale = Locale;

/** BCP 47 tag of an interface locale (a 24-hour clock in every one of them). */
export function localeTag(locale: string): string {
	return LOCALE_TAGS[toLocale(locale)];
}

export interface SlotParts {
	/** Local day `YYYY-MM-DD`, to group slots by day. */
	day: string;
	/** "mardi 24 novembre 2026". */
	date: string;
	/** "mardi 24 novembre". */
	dateNoYear: string;
	/** "24 novembre". */
	shortDate: string;
	/** "mar. 24 nov." */
	dayLabel: string;
	/** "09:30". */
	time: string;
	/** "UTC+2" when the wall-clock time occurs twice (clocks going back), else null. */
	offset: string | null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tag: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
	const key = `${tag}|${timeZone}|${JSON.stringify(options)}`;
	let found = formatters.get(key);
	if (!found) {
		found = new Intl.DateTimeFormat(tag, { timeZone, ...options });
		formatters.set(key, found);
	}
	return found;
}

/** Every printed form of an instant in `timeZone`. */
export function slotParts(ms: number, timeZone: string, locale: string): SlotParts {
	const tag = localeTag(locale);
	const wall = (instant: number) =>
		formatter(tag, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
			instant,
		);
	const time = wall(ms);
	const ambiguous = wall(ms - 3_600_000) === time || wall(ms + 3_600_000) === time;
	const offset = ambiguous
		? (formatter(tag, timeZone, { timeZoneName: "shortOffset" })
				.formatToParts(ms)
				.find((part) => part.type === "timeZoneName")
				?.value.replace(/^GMT/, "UTC") ?? null)
		: null;
	const day = formatter("en-CA", timeZone, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(ms);
	return {
		day,
		date: formatter(tag, timeZone, {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
		}).format(ms),
		dateNoYear: formatter(tag, timeZone, { weekday: "long", day: "numeric", month: "long" }).format(
			ms,
		),
		shortDate: formatter(tag, timeZone, { day: "numeric", month: "long" }).format(ms),
		dayLabel: formatter(tag, timeZone, { weekday: "short", day: "numeric", month: "short" }).format(
			ms,
		),
		time,
		offset,
	};
}

/** Time with its offset when the hour repeats: "02:30 UTC+2". */
export function slotTime(parts: Pick<SlotParts, "time" | "offset">): string {
	return parts.offset ? `${parts.time} ${parts.offset}` : parts.time;
}

/** Printed day of a local date `YYYY-MM-DD` ("mar. 24 nov."), read at noon UTC so no zone shifts it. */
export function localDayLabel(day: string, locale: string, style: "short" | "long" = "short") {
	const options: Intl.DateTimeFormatOptions =
		style === "short"
			? { weekday: "short", day: "numeric", month: "short" }
			: { weekday: "long", day: "numeric", month: "long" };
	return formatter(localeTag(locale), "UTC", options).format(Date.parse(`${day}T12:00:00Z`));
}

/** The local date `days` after `day` (`YYYY-MM-DD`, calendar arithmetic, no time zone involved). */
export function addLocalDays(day: string, days: number): string {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Today's local date in `timeZone`. */
export function localToday(timeZone: string, nowMs = Date.now()): string {
	return formatter("en-CA", timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(
		nowMs,
	);
}

/** Human name of a time zone ("heure : France", "Central European Time"…) for the slot legend. */
export function timeZoneName(timeZone: string, locale: string, nowMs = Date.now()): string {
	return (
		formatter(localeTag(locale), timeZone, { timeZoneName: "longGeneric" })
			.formatToParts(nowMs)
			.find((part) => part.type === "timeZoneName")?.value ?? timeZone
	);
}
