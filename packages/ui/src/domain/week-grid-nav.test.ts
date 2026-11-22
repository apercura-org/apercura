import { describe, expect, it } from "vitest";
import { isOpen, moveCell, rowOf } from "./week-grid-nav";

describe("week grid keyboard moves", () => {
	const size = { rows: 24, columns: 6 };

	it("walks times with up and down, days with left and right", () => {
		expect(moveCell({ row: 3, column: 2 }, "ArrowDown", size)).toEqual({ row: 4, column: 2 });
		expect(moveCell({ row: 3, column: 2 }, "ArrowUp", size)).toEqual({ row: 2, column: 2 });
		expect(moveCell({ row: 3, column: 2 }, "ArrowRight", size)).toEqual({ row: 3, column: 3 });
		expect(moveCell({ row: 3, column: 2 }, "ArrowLeft", size)).toEqual({ row: 3, column: 1 });
	});

	it("stays at the edges and jumps with Home and End", () => {
		expect(moveCell({ row: 0, column: 0 }, "ArrowUp", size)).toEqual({ row: 0, column: 0 });
		expect(moveCell({ row: 0, column: 0 }, "ArrowLeft", size)).toEqual({ row: 0, column: 0 });
		expect(moveCell({ row: 23, column: 5 }, "ArrowDown", size)).toEqual({ row: 23, column: 5 });
		expect(moveCell({ row: 23, column: 5 }, "ArrowRight", size)).toEqual({ row: 23, column: 5 });
		expect(moveCell({ row: 9, column: 4 }, "Home", size)).toEqual({ row: 0, column: 4 });
		expect(moveCell({ row: 9, column: 4 }, "End", size)).toEqual({ row: 23, column: 4 });
	});

	it("works on a single-day view", () => {
		expect(moveCell({ row: 1, column: 0 }, "ArrowRight", { rows: 4, columns: 1 })).toEqual({
			row: 1,
			column: 0,
		});
	});

	it("places minutes in rows and tells open hours", () => {
		expect(rowOf(9 * 60 + 15, 8 * 60, 30)).toBe(2);
		expect(isOpen([[480, 720]], 690, 720)).toBe(true);
		expect(isOpen([[480, 720]], 720, 750)).toBe(false);
		expect(isOpen([], 600, 630)).toBe(false);
	});
});
