import { fromAbsolute } from "@internationalized/date";
import { type ComputeSlotsInput, computeSlots } from "./slots";
import type { AppointmentType, AvailabilityRule, CalendarSettings } from "./types";

export const PARIS = "Europe/Paris";
export const NEW_YEAR_2026 = Date.parse("2026-01-01T00:00:00Z");

export function makeType(overrides: Partial<AppointmentType> = {}): AppointmentType {
	return { id: "t1", durationMin: 30, beforeMin: 0, afterMin: 0, audience: "all", ...overrides };
}

export function makeSettings(overrides: Partial<CalendarSettings> = {}): CalendarSettings {
	return { stepMin: 30, minNoticeMin: 0, horizonDays: 800, ...overrides };
}

export function makeRule(
	weekday: AvailabilityRule["weekday"],
	start: string,
	end: string,
	overrides: Partial<AvailabilityRule> = {},
): AvailabilityRule {
	return { siteId: "s1", weekday, start, end, ...overrides };
}

export function makeInput(overrides: Partial<ComputeSlotsInput> = {}): ComputeSlotsInput {
	return {
		timeZone: PARIS,
		rules: [],
		exceptions: [],
		busy: [],
		type: makeType(),
		settings: makeSettings(),
		nowMs: NEW_YEAR_2026,
		fromDate: "2026-01-05",
		days: 1,
		...overrides,
	};
}

export function slots(overrides: Partial<ComputeSlotsInput> = {}): number[] {
	return computeSlots(makeInput(overrides));
}

/** `2026-03-29T03:30+02:00`: local date-time with its UTC offset. */
export function local(instantMs: number, timeZone = PARIS): string {
	const iso = fromAbsolute(instantMs, timeZone).toString();
	return `${iso.slice(0, 16)}${iso.slice(19, 25)}`;
}

/** Local `HH:mm` of each instant. */
export function clock(instants: readonly number[], timeZone = PARIS): string[] {
	return instants.map((instant) => local(instant, timeZone).slice(11, 16));
}

export const utc = (iso: string): number => Date.parse(iso);
