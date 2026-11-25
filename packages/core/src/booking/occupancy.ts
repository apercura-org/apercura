import { MINUTE_MS } from "../time/local";
import type { AppointmentType } from "./types";

/** The range an appointment blocks in the practitioner's agenda, buffers included: `[fromMs, untilMs)`. */
export interface Occupancy {
	fromMs: number;
	untilMs: number;
}

export type OccupancyType = Pick<
	AppointmentType,
	"durationMin" | "beforeMin" | "afterMin" | "travelMin"
>;

/** Throws a RangeError unless the durations of `type` are integers, with a positive duration. */
export function assertOccupancyType(type: OccupancyType): void {
	if (!Number.isInteger(type.durationMin) || type.durationMin <= 0) {
		throw new RangeError("durationMin must be a positive integer");
	}
	if (!Number.isInteger(type.beforeMin) || type.beforeMin < 0) {
		throw new RangeError("beforeMin must be a non-negative integer");
	}
	if (!Number.isInteger(type.afterMin) || type.afterMin < 0) {
		throw new RangeError("afterMin must be a non-negative integer");
	}
	const travelMin = type.travelMin ?? 0;
	if (!Number.isInteger(travelMin) || travelMin < 0) {
		throw new RangeError("travelMin must be a non-negative integer");
	}
}

/**
 * The single source of truth for occupied ranges:
 * `[start − before, start + duration + after + travel)`. The travel time of a home visit is
 * stored after the visit; the travel before it is checked with {@link travelConflict}, so two
 * visits in a row count it once while a visit right after the practice still gets it.
 *
 * The slot engine and the database write path (`occupied_from` / `occupied_until`) must both use
 * it, otherwise they would disagree on buffers.
 */
export function occupancy(type: OccupancyType, startMs: number): Occupancy {
	assertOccupancyType(type);
	if (!Number.isFinite(startMs)) {
		throw new RangeError("startMs must be a finite number");
	}
	return {
		fromMs: startMs - type.beforeMin * MINUTE_MS,
		untilMs: startMs + (type.durationMin + type.afterMin + (type.travelMin ?? 0)) * MINUTE_MS,
	};
}

/** End of the appointment itself (`ends_at`), without buffers. */
export function appointmentEnd(type: OccupancyType, startMs: number): number {
	assertOccupancyType(type);
	return startMs + type.durationMin * MINUTE_MS;
}

/** A range with, for a home visit, its travel time (0 at the site). */
export interface TravelRange extends Occupancy {
	travelMin: number;
}

const overlap = (aFrom: number, aUntil: number, bFrom: number, bUntil: number) =>
	aFrom < bUntil && bFrom < aUntil;

/**
 * Whether two entries of one practitioner cannot both stand, travel included. Their occupied
 * ranges must not overlap (the database's overlap constraint); and when only one of them travels
 * (a home visit next to the practice, a block or a visit without travel time), the travel before
 * it, `[from − travel, from)`, must not overlap the other one either. Two home visits in a row
 * count one travel time: the one stored after the first.
 *
 * The slot engine and the booking writes (`server/booking/travel.ts`) must both use this rule.
 */
export function travelConflict(a: TravelRange, b: TravelRange): boolean {
	if (overlap(a.fromMs, a.untilMs, b.fromMs, b.untilMs)) {
		return true;
	}
	if (a.travelMin > 0 && b.travelMin === 0) {
		return overlap(a.fromMs - a.travelMin * MINUTE_MS, a.fromMs, b.fromMs, b.untilMs);
	}
	if (b.travelMin > 0 && a.travelMin === 0) {
		return overlap(b.fromMs - b.travelMin * MINUTE_MS, b.fromMs, a.fromMs, a.untilMs);
	}
	return false;
}
