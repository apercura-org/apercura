import { describe, expect, it } from "vitest";
import { addLocalDays, localToday, slotParts, slotTime } from "./slot-format";

describe("slot formatting in the site's time zone", () => {
	it("labels both 02:30 of the night clocks go back with their offset", () => {
		// 2026-10-25: Paris goes back from 03:00 to 02:00; 00:30Z and 01:30Z both read 02:30.
		const first = slotParts(Date.parse("2026-10-25T00:30:00Z"), "Europe/Paris", "fr");
		const second = slotParts(Date.parse("2026-10-25T01:30:00Z"), "Europe/Paris", "fr");
		expect(first.time).toBe("02:30");
		expect(second.time).toBe("02:30");
		expect(first.offset).toBe("UTC+2");
		expect(second.offset).toBe("UTC+1");
		expect(slotTime(second)).toBe("02:30 UTC+1");
		expect(slotParts(Date.parse("2026-10-25T08:30:00Z"), "Europe/Paris", "fr").offset).toBeNull();
	});

	it("groups a slot under the site's local day, not the visitor's", () => {
		// 21:00Z on 24 Nov is already 25 Nov in La Réunion (UTC+4).
		const parts = slotParts(Date.parse("2026-11-24T21:00:00Z"), "Indian/Reunion", "fr");
		expect(parts.day).toBe("2026-11-25");
		expect(parts.time).toBe("01:00");
		expect(slotParts(Date.parse("2026-11-24T21:00:00Z"), "Europe/Paris", "fr").day).toBe(
			"2026-11-24",
		);
	});

	it("moves windows by calendar days across a clock change", () => {
		expect(addLocalDays("2026-10-20", 14)).toBe("2026-11-03");
		expect(addLocalDays("2026-03-28", 1)).toBe("2026-03-29");
		expect(addLocalDays("2026-11-03", -14)).toBe("2026-10-20");
		expect(localToday("Europe/Paris", Date.parse("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
	});

	it("prints English dates in English", () => {
		const parts = slotParts(Date.parse("2026-12-01T08:30:00Z"), "Europe/Paris", "en");
		expect(parts.dateNoYear).toBe("Tuesday 1 December");
		expect(parts.time).toBe("09:30");
	});
});
