import { describe, expect, it } from "vitest";
import { parseOklch } from "./color";

describe("parseOklch", () => {
	it("parses channels, percentages, degrees and alpha", () => {
		expect(parseOklch("oklch(32% 0.07 235)")).toEqual({ l: 0.32, c: 0.07, h: 235 });
		expect(parseOklch("oklch(0.45 0.17 295deg / 50%)")).toEqual({
			l: 0.45,
			c: 0.17,
			h: 295,
			alpha: 0.5,
		});
	});

	it("rejects malformed values", () => {
		for (const bad of [
			"oklch(1 2)",
			"oklch(a b c)",
			"rgb(1 2 3)",
			"oklch(1 2 3 / 4 / 5)",
			"oklch(1 2 3",
		]) {
			expect(() => parseOklch(bad)).toThrow();
		}
	});

	it("stays fast on pathological whitespace", () => {
		const input = `oklch(1 1 1${" ".repeat(100_000)}x`;
		const start = performance.now();
		expect(() => parseOklch(input)).toThrow();
		expect(performance.now() - start).toBeLessThan(100);
	});
});
