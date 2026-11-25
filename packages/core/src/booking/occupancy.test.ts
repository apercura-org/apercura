import { describe, expect, it } from "vitest";
import { appointmentEnd, occupancy, travelConflict } from "./occupancy";

describe("occupancy", () => {
	const start = Date.parse("2026-05-04T08:00:00Z");

	it("covers the buffers before and after the appointment", () => {
		expect(occupancy({ durationMin: 30, beforeMin: 5, afterMin: 10 }, start)).toEqual({
			fromMs: start - 5 * 60_000,
			untilMs: start + 40 * 60_000,
		});
		expect(appointmentEnd({ durationMin: 30, beforeMin: 5, afterMin: 10 }, start)).toBe(
			start + 30 * 60_000,
		);
	});

	it("occupies a home visit's travel time after the visit, never before", () => {
		const homeCare = { durationMin: 20, beforeMin: 0, afterMin: 5, travelMin: 15 };
		expect(occupancy(homeCare, start)).toEqual({
			fromMs: start,
			untilMs: start + 40 * 60_000,
		});
		expect(appointmentEnd(homeCare, start)).toBe(start + 20 * 60_000);
		expect(occupancy({ durationMin: 20, beforeMin: 0, afterMin: 0 }, start).untilMs).toBe(
			start + 20 * 60_000,
		);
	});

	it("rejects invalid durations", () => {
		expect(() => occupancy({ durationMin: 0, beforeMin: 0, afterMin: 0 }, start)).toThrow(
			RangeError,
		);
		expect(() => occupancy({ durationMin: 15, beforeMin: -1, afterMin: 0 }, start)).toThrow(
			RangeError,
		);
		expect(() => occupancy({ durationMin: 15, beforeMin: 0, afterMin: 0.5 }, start)).toThrow(
			RangeError,
		);
		expect(() =>
			occupancy({ durationMin: 15, beforeMin: 0, afterMin: 0, travelMin: -1 }, start),
		).toThrow(RangeError);
		expect(() => occupancy({ durationMin: 15, beforeMin: 0, afterMin: 0 }, Number.NaN)).toThrow(
			RangeError,
		);
	});
});

describe("travelConflict", () => {
	const at = (minute: number) => Date.parse("2026-05-04T08:00:00Z") + minute * 60_000;
	const range = (from: number, until: number, travelMin = 0) => ({
		fromMs: at(from),
		untilMs: at(until),
		travelMin,
	});

	it("refuses overlapping ranges and accepts back-to-back ones", () => {
		expect(travelConflict(range(0, 30), range(20, 40))).toBe(true);
		expect(travelConflict(range(0, 30), range(30, 40))).toBe(false);
	});

	it("counts one travel time between two home visits", () => {
		// The first visit's range holds its travel after (20 min of care + 15 of travel).
		expect(travelConflict(range(0, 35, 15), range(35, 70, 15))).toBe(false);
		expect(travelConflict(range(0, 35, 15), range(30, 65, 15))).toBe(true);
	});

	it("keeps the travel before a home visit free of entries that do not travel", () => {
		expect(travelConflict(range(0, 10), range(10, 45, 15))).toBe(true);
		expect(travelConflict(range(10, 45, 15), range(0, 10))).toBe(true);
		expect(travelConflict(range(0, 10), range(25, 60, 15))).toBe(false);
	});
});
