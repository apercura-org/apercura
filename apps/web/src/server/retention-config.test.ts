import { describe, expect, it } from "vitest";
import {
	AUDIT_LOG_RETENTION,
	REMOVAL_REQUEST_RETENTION,
	REPORT_RETENTION,
	retentionMonths,
} from "./retention-config";

describe("retention periods", () => {
	it("defaults to what the privacy policy states", () => {
		expect(retentionMonths(AUDIT_LOG_RETENTION, {})).toBe(12);
		expect(retentionMonths(REPORT_RETENTION, {})).toBe(6);
		expect(retentionMonths(REMOVAL_REQUEST_RETENTION, {})).toBe(12);
	});

	it("reads a configured period within its bounds", () => {
		expect(retentionMonths(AUDIT_LOG_RETENTION, { AUDIT_LOG_RETENTION_MONTHS: "6" })).toBe(6);
		expect(retentionMonths(REPORT_RETENTION, { REPORT_RETENTION_MONTHS: "3" })).toBe(3);
	});

	it("falls back to the default outside the bounds (jobs that skip validation)", () => {
		for (const value of ["5", "0", "-1", "61", "1.5", "a year", " "]) {
			expect(
				retentionMonths(AUDIT_LOG_RETENTION, { AUDIT_LOG_RETENTION_MONTHS: value }),
				value,
			).toBe(12);
		}
	});
});
