import { FR_PROFESSIONS } from "@apercura/core/taxonomy";
import { describe, expect, it } from "vitest";
import { countedProfessions, FIGURE_PROFESSIONS, shapeRegistryFigures } from "./registry-figures";

describe("register figures", () => {
	it("count every enabled profession, each with a label on the home page", () => {
		const enabled = Object.entries(FR_PROFESSIONS)
			.filter(([, entry]) => entry.enabled)
			.map(([code]) => code);
		// Enabling a profession must give it a line on the home page.
		expect(Object.keys(FIGURE_PROFESSIONS).sort()).toEqual(enabled.sort());
		expect(countedProfessions()).toEqual(["10", "40", "50", "60"]);
	});

	it("print the professions in order, with nurses, and sum the addresses", () => {
		const figures = shapeRegistryFigures(
			[
				{ professionCode: "60", practitioners: 7, withAddress: 6 },
				{ professionCode: "10", practitioners: 120, withAddress: 100 },
				{ professionCode: "50", practitioners: 4, withAddress: 4 },
				// Not counted on the home page (not enabled).
				{ professionCode: "21", practitioners: 99, withAddress: 99 },
			],
			"2026-11-25",
		);
		expect(figures).toEqual({
			professions: [
				{ key: "doctors", count: 120 },
				{ key: "dentists", count: 0 },
				{ key: "midwives", count: 4 },
				{ key: "nurses", count: 7 },
			],
			withAddress: 110,
			importedAt: "2026-11-25",
		});
	});

	it("reads counts that the database returns as strings (bigint)", () => {
		const figures = shapeRegistryFigures(
			[
				{
					professionCode: "10",
					practitioners: "12" as unknown as number,
					withAddress: "3" as unknown as number,
				},
			],
			"2026-11-25",
		);
		expect(figures?.professions[0]).toEqual({ key: "doctors", count: 12 });
		expect(figures?.withAddress).toBe(3);
	});

	it("print nothing before the first import or on an empty directory", () => {
		expect(
			shapeRegistryFigures([{ professionCode: "10", practitioners: 5, withAddress: 5 }], null),
		).toBeNull();
		expect(shapeRegistryFigures([], "2026-11-25")).toBeNull();
	});
});
