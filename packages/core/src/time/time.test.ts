import { CalendarDate } from "@internationalized/date";
import { describe, expect, it } from "vitest";
import { timeZoneForDepartment } from "./departments";
import {
	isoWeekday,
	localToInstant,
	parseLocalDate,
	parseLocalDateTime,
	parseLocalTime,
} from "./local";

describe("timeZoneForDepartment", () => {
	it("maps metropolitan departments and Corsica to Europe/Paris", () => {
		for (const code of ["01", "13", "19", "21", "75", "95", "2A", "2b", " 69 "]) {
			expect(timeZoneForDepartment(code)).toBe("Europe/Paris");
		}
	});

	it.each([
		["971", "America/Guadeloupe"],
		["972", "America/Martinique"],
		["973", "America/Cayenne"],
		["974", "Indian/Reunion"],
		["975", "America/Miquelon"],
		["976", "Indian/Mayotte"],
		["977", "America/St_Barthelemy"],
		["978", "America/Marigot"],
	])("maps %s to %s", (code, zone) => {
		expect(timeZoneForDepartment(code)).toBe(zone);
	});

	it.each(["00", "20", "96", "979", "984", "988", "1", "2C", ""])("rejects %j", (code) => {
		expect(() => timeZoneForDepartment(code)).toThrow(RangeError);
	});
});

describe("local time parsing", () => {
	it("parses valid values and rejects impossible ones", () => {
		expect(parseLocalDate("2028-02-29").toString()).toBe("2028-02-29");
		expect(() => parseLocalDate("2026-02-29")).toThrow(RangeError);
		expect(parseLocalTime("00:00")).toBe(0);
		expect(parseLocalTime("24:00")).toBe(1440);
		expect(() => parseLocalTime("24:30")).toThrow(RangeError);
		expect(() => parseLocalTime("12:60")).toThrow(RangeError);
		expect(parseLocalDateTime("2026-06-06T09:15").minutes).toBe(555);
		expect(() => parseLocalDateTime("2026-06-06T24:00")).toThrow(RangeError);
	});

	it("computes ISO weekdays", () => {
		expect(isoWeekday(new CalendarDate(2026, 1, 5))).toBe(1);
		expect(isoWeekday(new CalendarDate(2026, 3, 29))).toBe(7);
	});

	it("converts 24:00 to the next local midnight", () => {
		expect(localToInstant(new CalendarDate(2026, 3, 28), 1440, "Europe/Paris")).toBe(
			Date.parse("2026-03-28T23:00:00Z"),
		);
	});
});
