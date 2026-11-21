import { describe, expect, it } from "vitest";
import { type GridDay, isBookable, moveFocus, nowFraction } from "./slot-grid";

const day = (date: string, times: string[], available = true): GridDay => ({
	date,
	slots: times.map((time) => ({
		id: `${date}T${time}`,
		start: `${date}T${time}:00+01:00`,
		available,
	})),
});

const DAYS: GridDay[] = [
	day("2026-11-24", ["09:00", "09:30", "10:00", "10:30"]),
	day("2026-11-25", []),
	day("2026-11-26", ["14:00", "14:30"]),
];

describe("moveFocus", () => {
	it("moves along a row and clamps at its ends", () => {
		expect(moveFocus(DAYS, { row: 0, column: 0 }, "ArrowRight")).toEqual({ row: 0, column: 1 });
		expect(moveFocus(DAYS, { row: 0, column: 0 }, "ArrowLeft")).toEqual({ row: 0, column: 0 });
		expect(moveFocus(DAYS, { row: 0, column: 1 }, "End")).toEqual({ row: 0, column: 3 });
		expect(moveFocus(DAYS, { row: 0, column: 3 }, "Home")).toEqual({ row: 0, column: 0 });
	});

	it("skips empty days and keeps the column when it exists", () => {
		expect(moveFocus(DAYS, { row: 0, column: 3 }, "ArrowDown")).toEqual({ row: 2, column: 1 });
		expect(moveFocus(DAYS, { row: 2, column: 0 }, "ArrowUp")).toEqual({ row: 0, column: 0 });
		expect(moveFocus(DAYS, { row: 2, column: 0 }, "ArrowDown")).toEqual({ row: 2, column: 0 });
	});

	it("jumps to the first and last day with page keys", () => {
		expect(moveFocus(DAYS, { row: 2, column: 1 }, "PageUp")).toEqual({ row: 0, column: 1 });
		expect(moveFocus(DAYS, { row: 0, column: 2 }, "PageDown")).toEqual({ row: 2, column: 1 });
	});
});

describe("nowFraction", () => {
	const morning = DAYS[0] as GridDay;

	it("places now inside the row in proportion to elapsed slots", () => {
		expect(nowFraction(morning, new Date("2026-11-24T09:00:00+01:00"))).toBe(0);
		expect(nowFraction(morning, new Date("2026-11-24T10:00:00+01:00"))).toBe(0.5);
		expect(nowFraction(morning, new Date("2026-11-24T11:00:00+01:00"))).toBe(1);
	});

	it("returns null outside the day's slots", () => {
		expect(nowFraction(morning, new Date("2026-11-24T08:59:00+01:00"))).toBeNull();
		expect(nowFraction(morning, new Date("2026-11-25T09:30:00+01:00"))).toBeNull();
		expect(nowFraction(DAYS[1] as GridDay, new Date("2026-11-25T09:30:00+01:00"))).toBeNull();
	});
});

describe("isBookable", () => {
	const slot = { id: "a", start: "2026-11-24T09:30:00+01:00", available: true };

	it("refuses past and closed slots", () => {
		expect(isBookable(slot, new Date("2026-11-24T09:00:00+01:00"))).toBe(true);
		expect(isBookable(slot, new Date("2026-11-24T09:31:00+01:00"))).toBe(false);
		expect(isBookable({ ...slot, available: false }, null)).toBe(false);
		expect(isBookable(slot, null)).toBe(true);
	});
});
