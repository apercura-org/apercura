import { describe, expect, it } from "vitest";
import { timeZoneForDepartment } from "../time/departments";
import { MINUTE_MS } from "../time/local";
import { occupancy, travelConflict } from "./occupancy";
import { isSlotOffered, MAX_SLOT_DAYS } from "./slots";
import {
	clock,
	local,
	makeInput,
	makeRule,
	makeSettings,
	makeType,
	PARIS,
	slots,
	utc,
} from "./test-helpers";
import type { BusyInterval } from "./types";

const isStrictlyAscending = (values: readonly number[]) =>
	values.every((value, index) => index === 0 || value > (values[index - 1] as number));

describe("computeSlots: daylight saving time in Europe/Paris", () => {
	describe.each([
		{ year: 2026, spring: "2026-03-29", autumn: "2026-10-25" },
		{ year: 2027, spring: "2027-03-28", autumn: "2027-10-31" },
	])("$year", ({ spring, autumn }) => {
		it("skips the missing hour in spring without losing real-time slots", () => {
			const result = slots({ rules: [makeRule(7, "01:00", "04:00")], fromDate: spring });
			expect(result.map((s) => local(s))).toEqual([
				`${spring}T01:00+01:00`,
				`${spring}T01:30+01:00`,
				`${spring}T03:00+02:00`,
				`${spring}T03:30+02:00`,
			]);
			expect((result[3] as number) - (result[0] as number)).toBe(90 * MINUTE_MS);
		});

		it("shifts a rule starting at a nonexistent 02:30 forward by the gap", () => {
			const result = slots({ rules: [makeRule(7, "02:30", "04:00")], fromDate: spring });
			expect(result.map((s) => local(s))).toEqual([`${spring}T03:30+02:00`]);
		});

		it("offers both occurrences of the repeated hour in autumn, once each", () => {
			const result = slots({ rules: [makeRule(7, "01:00", "04:00")], fromDate: autumn });
			expect(result.map((s) => local(s))).toEqual([
				`${autumn}T01:00+02:00`,
				`${autumn}T01:30+02:00`,
				`${autumn}T02:00+02:00`,
				`${autumn}T02:30+02:00`,
				`${autumn}T02:00+01:00`,
				`${autumn}T02:30+01:00`,
				`${autumn}T03:00+01:00`,
				`${autumn}T03:30+01:00`,
			]);
			expect(new Set(result).size).toBe(result.length);
			expect(
				result.every((s, i) => i === 0 || s - (result[i - 1] as number) === 30 * MINUTE_MS),
			).toBe(true);
		});

		it("resolves a rule starting at the repeated 02:30 to its first occurrence", () => {
			const result = slots({ rules: [makeRule(7, "02:30", "04:00")], fromDate: autumn });
			expect(result.map((s) => local(s))).toEqual([
				`${autumn}T02:30+02:00`,
				`${autumn}T02:00+01:00`,
				`${autumn}T02:30+01:00`,
				`${autumn}T03:00+01:00`,
				`${autumn}T03:30+01:00`,
			]);
		});

		it("keeps daily rules on the same wall-clock times across the change", () => {
			const rules = ([1, 2, 3, 4, 5, 6, 7] as const).map((d) => makeRule(d, "09:00", "12:00"));
			for (const sunday of [spring, autumn]) {
				const from = new Date(utc(`${sunday}T12:00:00Z`) - 6 * 86_400_000)
					.toISOString()
					.slice(0, 10);
				const result = slots({ rules, fromDate: from, days: 14 });
				expect(result).toHaveLength(14 * 6);
				expect(new Set(clock(result))).toEqual(
					new Set(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]),
				);
				expect(isStrictlyAscending(result)).toBe(true);
			}
		});
	});
});

describe("computeSlots: overseas site", () => {
	const MARTINIQUE = timeZoneForDepartment("972");

	it("uses the site time zone, which has no daylight saving time", () => {
		for (const fromDate of ["2026-03-29", "2026-10-25"]) {
			const result = slots({
				timeZone: MARTINIQUE,
				rules: [makeRule(7, "09:00", "10:00")],
				fromDate,
			});
			expect(result).toEqual([utc(`${fromDate}T13:00:00Z`), utc(`${fromDate}T13:30:00Z`)]);
			expect(clock(result, MARTINIQUE)).toEqual(["09:00", "09:30"]);
		}
	});
});

describe("computeSlots: windows", () => {
	it("merges overlapping rules without duplicating slots", () => {
		const result = slots({ rules: [makeRule(1, "09:00", "11:00"), makeRule(1, "10:00", "12:00")] });
		expect(clock(result)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
	});

	it("lets an appointment run across two adjacent rules", () => {
		const result = slots({
			rules: [makeRule(1, "09:00", "10:00"), makeRule(1, "10:00", "11:00")],
			type: makeType({ durationMin: 45 }),
			settings: makeSettings({ stepMin: 15 }),
		});
		expect(clock(result)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"]);
	});

	it("aligns candidates on the step from the window start", () => {
		expect(
			clock(
				slots({ rules: [makeRule(1, "09:00", "10:30")], settings: makeSettings({ stepMin: 20 }) }),
			),
		).toEqual(["09:00", "09:20", "09:40", "10:00"]);
		expect(
			clock(
				slots({
					rules: [makeRule(1, "09:00", "11:00")],
					type: makeType({ durationMin: 15 }),
					settings: makeSettings({ stepMin: 45 }),
				}),
			),
		).toEqual(["09:00", "09:45", "10:30"]);
		expect(clock(slots({ rules: [makeRule(1, "14:10", "15:10")] }))).toEqual(["14:10", "14:40"]);
	});

	it("respects validFrom and validUntil, both inclusive", () => {
		const rules = [
			makeRule(1, "09:00", "10:00", { validFrom: "2026-01-12", validUntil: "2026-01-19" }),
		];
		const daysOf = (fromDate: string) =>
			slots({ rules, fromDate, days: 14 }).map((s) => local(s).slice(0, 10));
		expect(daysOf("2026-01-05")).toEqual(["2026-01-12", "2026-01-12"]);
		expect(daysOf("2026-01-06")).toEqual(["2026-01-12", "2026-01-12", "2026-01-19", "2026-01-19"]);
		expect(daysOf("2026-01-13")).toEqual(["2026-01-19", "2026-01-19"]);
	});

	it("only uses the rules of the requested site", () => {
		const rules = [makeRule(1, "09:00", "10:00"), makeRule(1, "14:00", "15:00", { siteId: "s2" })];
		expect(clock(slots({ rules, siteId: "s2" }))).toEqual(["14:00", "14:30"]);
		expect(slots({ rules })).toHaveLength(4);
	});

	it("rejects malformed rules", () => {
		expect(() => slots({ rules: [makeRule(1, "10:00", "09:00")] })).toThrow(RangeError);
		expect(() => slots({ rules: [makeRule(1, "9:00", "10:00")] })).toThrow(RangeError);
		expect(() => slots({ rules: [makeRule(8 as 1, "09:00", "10:00")] })).toThrow(RangeError);
	});

	it("accepts 24:00 as the end of a rule", () => {
		expect(clock(slots({ rules: [makeRule(1, "23:00", "24:00")] }))).toEqual(["23:00", "23:30"]);
	});
});

describe("computeSlots: appointment types", () => {
	it("filters rules by allowed type ids, empty meaning every type", () => {
		const only = (typeIds: string[] | null) =>
			slots({ rules: [makeRule(1, "09:00", "10:00", { typeIds })] });
		expect(only(["other"])).toEqual([]);
		expect(only(["other", "t1"])).toHaveLength(2);
		expect(only([])).toHaveLength(2);
		expect(only(null)).toHaveLength(2);
	});

	it("offers a type reserved to one audience only when the patient matches or is unknown", () => {
		const base = { rules: [makeRule(1, "09:00", "10:00")], type: makeType({ audience: "new" }) };
		expect(slots(base)).toHaveLength(2);
		expect(slots({ ...base, patient: "new" })).toHaveLength(2);
		expect(slots({ ...base, patient: "existing" })).toEqual([]);
	});
});

describe("computeSlots: buffers and busy intervals", () => {
	const rules = [makeRule(1, "09:00", "10:00")];
	const at = (time: string) => utc(`2026-01-05T${time}:00+01:00`);

	it("lets buffers spill outside the window", () => {
		const type = makeType({ beforeMin: 10, afterMin: 10 });
		expect(clock(slots({ rules, type }))).toEqual(["09:00", "09:30"]);
	});

	it("blocks a slot whose buffers overlap a busy interval", () => {
		const type = makeType({ beforeMin: 10, afterMin: 10 });
		expect(
			clock(slots({ rules, type, busy: [{ startMs: at("08:50"), endMs: at("09:00") }] })),
		).toEqual(["09:30"]);
		expect(
			clock(slots({ rules, type, busy: [{ startMs: at("09:40"), endMs: at("09:50") }] })),
		).toEqual(["09:00"]);
		expect(
			clock(slots({ rules, type, busy: [{ startMs: at("10:10"), endMs: at("11:00") }] })),
		).toEqual(["09:00", "09:30"]);
	});

	it("treats busy intervals as half-open, so back-to-back appointments fit", () => {
		expect(clock(slots({ rules, busy: [{ startMs: at("09:30"), endMs: at("10:00") }] }))).toEqual([
			"09:00",
		]);
		expect(clock(slots({ rules, busy: [{ startMs: at("08:00"), endMs: at("09:00") }] }))).toEqual([
			"09:00",
			"09:30",
		]);
	});

	it("accepts unsorted, overlapping and empty busy intervals", () => {
		const busy = [
			{ startMs: at("11:00"), endMs: at("12:00") },
			{ startMs: at("09:10"), endMs: at("09:20") },
			{ startMs: at("09:15"), endMs: at("09:25") },
			{ startMs: at("09:45"), endMs: at("09:45") },
		];
		expect(clock(slots({ rules: [makeRule(1, "09:00", "12:00")], busy }))).toEqual([
			"09:30",
			"10:00",
			"10:30",
		]);
	});
});

describe("computeSlots: home visits with a fixed travel time", () => {
	const at = (time: string) => utc(`2026-01-05T${time}:00+01:00`);
	// "Soins à domicile": 20 minutes of care, 15 minutes of travel.
	const homeCare = makeType({ durationMin: 20, travelMin: 15 });
	const bloodTest = makeType({ id: "t2", durationMin: 10 });
	const rules = [makeRule(1, "09:00", "11:00")];
	const settings = makeSettings({ stepMin: 5 });
	/** A visit booked at `time`, as the database stores it: care + travel after, and its travel. */
	const visitAt = (time: string) => ({
		startMs: at(time),
		endMs: at(time) + 35 * MINUTE_MS,
		travelMin: 15,
	});
	/** Something at the practice (or a block): no travel. */
	const officeAt = (from: string, until: string): BusyInterval => ({
		startMs: at(from),
		endMs: at(until),
	});

	it("counts the travel time once between two visits in a row", () => {
		const after = clock(slots({ rules, type: homeCare, settings, busy: [visitAt("09:00")] }));
		// The visit ends at 09:20, its travel at 09:35: the next visit may start then.
		expect(after[0]).toBe("09:35");
		const before = clock(slots({ rules, type: homeCare, settings, busy: [visitAt("10:00")] }));
		// A visit at 09:25 ends, travel included, at 10:00, when the next one starts.
		expect(before).toContain("09:25");
		expect(before).not.toContain("09:30");
	});

	it("keeps the travel time free before a visit that follows the practice or a block", () => {
		const free = clock(
			slots({ rules, type: homeCare, settings, busy: [officeAt("09:00", "09:10")] }),
		);
		expect(free).not.toContain("09:10");
		expect(free).not.toContain("09:20");
		expect(free[0]).toBe("09:25");
	});

	it("keeps the travel time free after a visit for care at the practice", () => {
		const free = clock(slots({ rules, type: bloodTest, settings, busy: [visitAt("09:00")] }));
		expect(free[0]).toBe("09:35");
	});

	it("keeps care at the practice out of the travel before a visit", () => {
		const free = clock(slots({ rules, type: bloodTest, settings, busy: [visitAt("10:00")] }));
		// The blood test must end by 09:45, when the nurse leaves for the 10:00 visit.
		expect(free).toContain("09:35");
		expect(free).not.toContain("09:40");
		expect(free).toContain("10:35");
	});

	it("lets the travel time spill outside the window, like the other buffers", () => {
		const free = clock(slots({ rules, type: homeCare, settings }));
		expect(free[0]).toBe("09:00");
		expect(free.at(-1)).toBe("10:40");
	});

	it("adds the travel time to the free time after the visit", () => {
		const type = makeType({ durationMin: 20, afterMin: 5, travelMin: 15 });
		const free = clock(slots({ rules, type, settings, busy: [officeAt("09:40", "10:00")] }));
		expect(free).toContain("09:00");
		expect(free).not.toContain("09:05");
		// After the practice, the travel comes first.
		expect(free).not.toContain("10:00");
		expect(free).toContain("10:15");
	});

	it("offers exactly the starts that have no travel conflict with the agenda", () => {
		const busy = [visitAt("09:30"), officeAt("10:15", "10:25"), visitAt("10:50")];
		const ranges = busy.map((item) => ({
			fromMs: item.startMs,
			untilMs: item.endMs,
			travelMin: item.travelMin ?? 0,
		}));
		for (const type of [homeCare, bloodTest]) {
			const free = new Set(slots({ rules, type, settings, busy }));
			for (
				let start = at("09:00");
				start + type.durationMin * MINUTE_MS <= at("11:00");
				start += 5 * MINUTE_MS
			) {
				const candidate = { ...occupancy(type, start), travelMin: type.travelMin ?? 0 };
				const conflict = ranges.some((range) => travelConflict(candidate, range));
				expect(free.has(start), `${type.id} at ${local(start)}`).toBe(!conflict);
			}
		}
	});

	it("rejects a negative or fractional travel time", () => {
		expect(() => slots({ rules, type: makeType({ travelMin: -5 }) })).toThrow(RangeError);
		expect(() => slots({ rules, type: makeType({ travelMin: 2.5 }) })).toThrow(RangeError);
	});
});

describe("computeSlots: notice, horizon and range", () => {
	const daily = ([1, 2, 3, 4, 5, 6, 7] as const).map((d) => makeRule(d, "09:00", "12:00"));

	it("drops slots that start before now plus the minimal notice", () => {
		const nowMs = utc("2026-01-05T08:00:00+01:00");
		expect(
			clock(slots({ rules: daily, nowMs, settings: makeSettings({ minNoticeMin: 90 }) })),
		).toEqual(["09:30", "10:00", "10:30", "11:00", "11:30"]);
	});

	it("keeps the step grid when now falls between two candidates", () => {
		const nowMs = utc("2026-01-05T09:10:00+01:00");
		expect(clock(slots({ rules: daily, nowMs }))[0]).toBe("09:30");
	});

	it("stops at the end of the local day today + horizonDays", () => {
		const nowMs = utc("2026-06-01T10:00:00+02:00");
		const result = slots({
			rules: daily,
			nowMs,
			fromDate: "2026-06-01",
			days: 7,
			settings: makeSettings({ horizonDays: 2 }),
		});
		const days = result.map((s) => local(s).slice(0, 10));
		expect(new Set(days)).toEqual(new Set(["2026-06-01", "2026-06-02", "2026-06-03"]));
		expect(days.filter((d) => d === "2026-06-01")).toHaveLength(4);
		expect(
			slots({
				rules: daily,
				nowMs,
				fromDate: "2026-06-04",
				settings: makeSettings({ horizonDays: 2 }),
			}),
		).toEqual([]);
	});

	it("covers at most 14 days per call", () => {
		expect(slots({ rules: daily, days: MAX_SLOT_DAYS })).toHaveLength(14 * 6);
		expect(() => slots({ rules: daily, days: 15 })).toThrow(RangeError);
		expect(() => slots({ rules: daily, days: 0 })).toThrow(RangeError);
		expect(() => slots({ rules: daily, days: 1.5 })).toThrow(RangeError);
	});

	it("rejects invalid settings and inputs", () => {
		expect(() => slots({ settings: makeSettings({ stepMin: 0 }) })).toThrow(RangeError);
		expect(() => slots({ type: makeType({ durationMin: 0 }) })).toThrow(RangeError);
		expect(() => slots({ timeZone: "Mars/Olympus" })).toThrow(RangeError);
		expect(() => slots({ fromDate: "2026-02-30" })).toThrow(RangeError);
	});

	it("returns the same slots for a day whatever the range it is asked with", () => {
		const input = makeInput({
			rules: [
				makeRule(1, "09:00", "12:00"),
				makeRule(5, "20:00", "24:00"),
				makeRule(6, "00:00", "02:00"),
			],
			exceptions: [
				{ kind: "open", span: "time", from: "2026-01-07T22:00", until: "2026-01-08T03:00" },
			],
			settings: makeSettings({ stepMin: 45 }),
		});
		const whole = slots({ ...input, fromDate: "2026-01-05", days: 14 });
		const byDay = Array.from({ length: 14 }, (_, offset) =>
			slots({
				...input,
				fromDate: new Date(utc("2026-01-05T12:00:00Z") + offset * 86_400_000)
					.toISOString()
					.slice(0, 10),
				days: 1,
			}),
		).flat();
		expect(byDay).toEqual(whole);
		// The Friday-night window continues past midnight on the 45-minute grid of 20:00.
		expect(clock(whole.filter((s) => local(s).startsWith("2026-01-10")))).toEqual([
			"00:30",
			"01:15",
		]);
	});
});

describe("computeSlots: exceptions", () => {
	const weekdays = ([1, 2, 3, 4, 5] as const).map((d) => makeRule(d, "09:00", "12:00"));

	it("closes whole days, across several days", () => {
		const result = slots({
			rules: weekdays,
			fromDate: "2026-08-03",
			days: 14,
			exceptions: [
				{ kind: "closed", span: "days", fromDate: "2026-08-03", untilDate: "2026-08-07" },
			],
		});
		const days = new Set(result.map((s) => local(s).slice(0, 10)));
		expect(days).toEqual(
			new Set(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]),
		);
	});

	it("closes a local time range spanning days, splitting windows", () => {
		const result = slots({
			rules: weekdays,
			fromDate: "2026-08-03",
			days: 3,
			exceptions: [
				{ kind: "closed", span: "time", from: "2026-08-03T10:00", until: "2026-08-05T10:15" },
			],
		});
		expect(result.map((s) => local(s).slice(0, 16))).toEqual([
			"2026-08-03T09:00",
			"2026-08-03T09:30",
			"2026-08-05T10:15",
			"2026-08-05T10:45",
			"2026-08-05T11:15",
		]);
	});

	it("adds open windows, filtered by type", () => {
		const saturday = {
			kind: "open",
			span: "time",
			from: "2026-06-06T09:00",
			until: "2026-06-06T10:00",
		} as const;
		expect(clock(slots({ fromDate: "2026-06-06", exceptions: [saturday] }))).toEqual([
			"09:00",
			"09:30",
		]);
		expect(
			slots({ fromDate: "2026-06-06", exceptions: [{ ...saturday, typeIds: ["other"] }] }),
		).toEqual([]);
		const wholeDay = slots({
			fromDate: "2026-06-06",
			exceptions: [{ kind: "open", span: "days", fromDate: "2026-06-06", untilDate: "2026-06-06" }],
		});
		expect(wholeDay).toHaveLength(48);
	});

	it("lets a closed exception win over an open one", () => {
		const result = slots({
			fromDate: "2026-06-06",
			exceptions: [
				{ kind: "open", span: "time", from: "2026-06-06T09:00", until: "2026-06-06T11:00" },
				{ kind: "closed", span: "days", fromDate: "2026-06-06", untilDate: "2026-06-06" },
			],
		});
		expect(result).toEqual([]);
	});
});

describe("isSlotOffered", () => {
	const query = makeInput({ rules: [makeRule(1, "09:00", "12:00")], fromDate: "2026-01-05" });
	const at = (time: string) => utc(`2026-01-05T${time}:00+01:00`);

	it("accepts exactly the starts on the grid", () => {
		expect(isSlotOffered(query, at("09:30"))).toBe(true);
		expect(isSlotOffered(query, at("09:35"))).toBe(false);
		expect(isSlotOffered(query, at("12:00"))).toBe(false);
		expect(isSlotOffered(query, Number.NaN)).toBe(false);
	});

	it("refuses a start that is busy or too soon", () => {
		expect(
			isSlotOffered(
				{ ...query, busy: [{ startMs: at("09:30"), endMs: at("09:45") }] },
				at("09:30"),
			),
		).toBe(false);
		expect(isSlotOffered({ ...query, nowMs: at("09:31") }, at("09:30"))).toBe(false);
	});

	it("matches the repeated hour by instant, not by wall clock", () => {
		const autumn = makeInput({ rules: [makeRule(7, "01:00", "04:00")], timeZone: PARIS });
		expect(isSlotOffered(autumn, utc("2026-10-25T02:30:00+01:00"))).toBe(true);
		expect(isSlotOffered(autumn, utc("2026-10-25T02:30:00+02:00"))).toBe(true);
	});
});
