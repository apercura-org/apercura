import { describe, expect, it } from "vitest";
import { SuppressedLines } from "./suppressions";

const SUPPRESSED = "19999990038";

describe("SuppressedLines", () => {
	const lines = () =>
		new SuppressedLines({ country: "FR", idScheme: "RPPS" }, new Set([SUPPRESSED]));

	it("drops the lines of a suppressed national id and counts them per file and country", () => {
		const filter = lines();
		expect(filter.skip("personneActivite", ["8", SUPPRESSED, "MARTIN"], 1, 3, "10")).toBe(true);
		expect(filter.skip("personneActivite", ["8", SUPPRESSED, "MARTIN"], 1, 3, "10")).toBe(true);
		expect(filter.skip("personneActivite", ["8", "19999990012", "DURAND"], 1, 3, "10")).toBe(false);
		expect(filter.skip("savoirFaire", [SUPPRESSED, "S", "SM54"], 0, 3)).toBe(true);
		expect(filter.summary()).toEqual({
			FR: {
				idScheme: "RPPS",
				ids: 1,
				lines: 3,
				byFile: { personneActivite: 2, savoirFaire: 1 },
			},
		});
		// Only the rows that would have been staged count in the volume checks, by profession.
		expect(filter.droppedRows()).toEqual({ rows: 2, idsByGroup: { "10": 1 } });
	});

	it("also drops a malformed line that names the id elsewhere, before it is quarantined", () => {
		const filter = lines();
		// One field short: the id is not where the header says, but the line still holds it.
		expect(filter.skip("diplomes", [` ${SUPPRESSED}`, "DE"], 2, 3)).toBe(true);
		// A well-formed line is only read at its id column.
		expect(filter.skip("diplomes", ["19999990012", SUPPRESSED, "DE"], 0, 3)).toBe(false);
	});

	it("keeps every line when nothing is suppressed", () => {
		const filter = new SuppressedLines({ country: "FR", idScheme: "RPPS" }, new Set());
		expect(filter.skip("personneActivite", ["8", SUPPRESSED], 1, 2)).toBe(false);
		expect(filter.summary()).toEqual({ FR: { idScheme: "RPPS", ids: 0, lines: 0, byFile: {} } });
	});
});
