import type { IsoWeekday, LocalDate, LocalDateTime, LocalTime } from "../time/local";

/** Who an appointment type is offered to. */
export type Audience = "all" | "new" | "existing";

/** A weekly opening window, in the local time of the site. */
export interface AvailabilityRule {
	siteId: string;
	/** ISO weekday: 1 = Monday … 7 = Sunday. */
	weekday: IsoWeekday;
	/** Local start time, `HH:mm`. */
	start: LocalTime;
	/** Local end time, `HH:mm`, strictly after `start` (`24:00` closes at midnight). */
	end: LocalTime;
	/** First local date the rule applies to (inclusive). Unbounded when absent. */
	validFrom?: LocalDate | null;
	/** Last local date the rule applies to (inclusive). Unbounded when absent. */
	validUntil?: LocalDate | null;
	/** Appointment types allowed in this window. Absent or empty means every type. */
	typeIds?: readonly string[] | null;
}

interface ExceptionBase {
	/** `closed` removes time (holidays), `open` adds an exceptional window. */
	kind: "closed" | "open";
	/**
	 * For `open` exceptions only: appointment types allowed in the added window.
	 * Absent or empty means every type. Closed exceptions always apply to every type.
	 */
	typeIds?: readonly string[] | null;
}

/** Whole local days, from `fromDate` to `untilDate`, both inclusive. */
export interface DaysException extends ExceptionBase {
	span: "days";
	fromDate: LocalDate;
	untilDate: LocalDate;
}

/** A local date-time range `[from, until)`. */
export interface TimeException extends ExceptionBase {
	span: "time";
	from: LocalDateTime;
	until: LocalDateTime;
}

export type AvailabilityException = DaysException | TimeException;

export interface AppointmentType {
	id: string;
	/** Length of the appointment itself, in minutes (> 0). */
	durationMin: number;
	/** Buffer occupied before the appointment, in minutes (≥ 0). */
	beforeMin: number;
	/** Buffer occupied after the appointment, in minutes (≥ 0). */
	afterMin: number;
	/**
	 * Home visits only: fixed travel time occupied after the visit, on top of `afterMin` (the way
	 * to the next patient or back to the practice), in minutes (≥ 0). Absent means 0.
	 */
	travelMin?: number;
	audience: Audience;
}

/** Where the care of an appointment type happens: at the practitioner's site or at home. */
export type VisitLocation = "site" | "home";

export interface CalendarSettings {
	/** Distance between two candidate starts, in real minutes (> 0). */
	stepMin: number;
	/** Minimal delay between now and the start of a bookable slot, in minutes (≥ 0). */
	minNoticeMin: number;
	/**
	 * How far ahead patients can book, in local days: slots are offered up to the end of the
	 * local day `today + horizonDays` (0 = today only).
	 */
	horizonDays: number;
}

/** A time range already occupied by the practitioner, half-open: `[startMs, endMs)`. */
export interface BusyInterval {
	startMs: number;
	endMs: number;
}
