import { describe, expect, it } from "vitest";
import { appointmentEnd, occupancy } from "./occupancy";

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
		expect(() => occupancy({ durationMin: 15, beforeMin: 0, afterMin: 0 }, Number.NaN)).toThrow(
			RangeError,
		);
	});
});
