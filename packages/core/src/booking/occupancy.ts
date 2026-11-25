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
 * `[start − before, start + duration + after + travel)`. A home visit's travel time comes after
 * the visit, so two visits in a row count it once.
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
