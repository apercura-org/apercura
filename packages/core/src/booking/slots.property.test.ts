import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { occupancy } from "./occupancy";
import { type ComputeSlotsInput, computeSlots, isSlotOffered } from "./slots";
import { makeSettings, makeType, PARIS, utc } from "./test-helpers";
import type { AvailabilityRule, BusyInterval } from "./types";

const hhmm = (minutes: number) =>
	`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const ruleArb: fc.Arbitrary<AvailabilityRule> = fc
	.record({
		weekday: fc.integer({ min: 1, max: 7 }),
		start: fc.integer({ min: 0, max: 287 }).map((n) => n * 5),
		length: fc.integer({ min: 1, max: 120 }).map((n) => n * 5),
	})
	.map(({ weekday, start, length }) => ({
		siteId: "s1",
		weekday: weekday as AvailabilityRule["weekday"],
		start: hhmm(start),
		end: hhmm(Math.min(start + length, 1440)),
	}));

const inputArb: fc.Arbitrary<ComputeSlotsInput> = fc
	.record({
		timeZone: fc.constantFrom(PARIS, "America/Martinique", "Indian/Reunion"),
		fromDate: fc.constantFrom("2026-03-27", "2026-10-23", "2027-03-26", "2027-10-29", "2026-06-10"),
		days: fc.integer({ min: 1, max: 4 }),
		rules: fc.array(ruleArb, { minLength: 1, maxLength: 16 }),
		durationMin: fc.integer({ min: 1, max: 24 }).map((n) => n * 5),
		beforeMin: fc.integer({ min: 0, max: 30 }),
		afterMin: fc.integer({ min: 0, max: 30 }),
		stepMin: fc.constantFrom(5, 10, 15, 20, 25, 30, 45, 60),
		minNoticeMin: fc.integer({ min: 0, max: 600 }),
		nowOffsetMin: fc.integer({ min: -3000, max: 900 }),
		busy: fc.array(
			fc.record({
				offsetMin: fc.integer({ min: -600, max: 7200 }),
				lengthMin: fc.integer({ min: 0, max: 300 }),
			}),
			{ maxLength: 25 },
		),
	})
	.map((r) => {
		const base = utc(`${r.fromDate}T00:00:00Z`);
		return {
			timeZone: r.timeZone,
			fromDate: r.fromDate,
			days: r.days,
			rules: r.rules,
			exceptions: [],
			busy: r.busy.map(({ offsetMin, lengthMin }) => ({
				startMs: base + offsetMin * 60_000,
				endMs: base + (offsetMin + lengthMin) * 60_000,
			})),
			type: makeType({ durationMin: r.durationMin, beforeMin: r.beforeMin, afterMin: r.afterMin }),
			settings: makeSettings({ stepMin: r.stepMin, minNoticeMin: r.minNoticeMin, horizonDays: 30 }),
			nowMs: base + r.nowOffsetMin * 60_000,
		};
	});

/** Half-open overlap; an empty busy interval occupies nothing. */
const overlaps = (a: { fromMs: number; untilMs: number }, b: BusyInterval) =>
	b.startMs < b.endMs && a.fromMs < b.endMs && b.startMs < a.untilMs;

describe("computeSlots properties", () => {
	it("returns ascending starts that fit without conflict and are all offered", () => {
		fc.assert(
			fc.property(inputArb, (input) => {
				const result = computeSlots(input);
				for (let i = 1; i < result.length; i += 1) {
					expect(result[i]).toBeGreaterThan(result[i - 1] as number);
				}
				for (const start of result) {
					expect(start).toBeGreaterThanOrEqual(input.nowMs + input.settings.minNoticeMin * 60_000);
					const occupied = occupancy(input.type, start);
					expect(input.busy.some((busy) => overlaps(occupied, busy))).toBe(false);
					expect(isSlotOffered(input, start)).toBe(true);
				}
			}),
			{ numRuns: 300 },
		);
	}, 30_000);

	it("never lets successive bookings of returned slots overlap", () => {
		fc.assert(
			fc.property(inputArb, fc.array(fc.nat(), { minLength: 1, maxLength: 15 }), (input, picks) => {
				const booked: { fromMs: number; untilMs: number }[] = [];
				let busy = [...input.busy];
				for (const pick of picks) {
					const offered = computeSlots({ ...input, busy });
					if (offered.length === 0) {
						break;
					}
					const start = offered[pick % offered.length] as number;
					const occupied = occupancy(input.type, start);
					expect(busy.some((interval) => overlaps(occupied, interval))).toBe(false);
					booked.push(occupied);
					busy = [...busy, { startMs: occupied.fromMs, endMs: occupied.untilMs }];
				}
				const sorted = [...booked].sort((a, b) => a.fromMs - b.fromMs);
				for (let i = 1; i < sorted.length; i += 1) {
					expect(sorted[i]?.fromMs).toBeGreaterThanOrEqual(sorted[i - 1]?.untilMs as number);
				}
			}),
			{ numRuns: 200 },
		);
	}, 30_000);
});
