import { describe, expect, it } from "vitest";
import { subtractIntervals, unionIntervals } from "./intervals";

const iv = (start: number, end: number) => ({ start, end });

describe("intervals", () => {
	it("merges overlapping and touching intervals and drops empty ones", () => {
		expect(unionIntervals([iv(5, 7), iv(1, 3), iv(3, 4), iv(6, 9), iv(10, 10)])).toEqual([
			iv(1, 4),
			iv(5, 9),
		]);
	});

	it("subtracts cuts, splitting intervals", () => {
		expect(subtractIntervals([iv(0, 10), iv(20, 30)], [iv(2, 3), iv(5, 22), iv(28, 40)])).toEqual([
			iv(0, 2),
			iv(3, 5),
			iv(22, 28),
		]);
		expect(subtractIntervals([iv(0, 10)], [])).toEqual([iv(0, 10)]);
		expect(subtractIntervals([iv(0, 10)], [iv(-5, 15)])).toEqual([]);
	});
});
