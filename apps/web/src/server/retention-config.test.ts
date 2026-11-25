import { describe, expect, it } from "vitest";
import {
	ADMIN_ALERT_INTERVAL,
	AUDIT_LOG_RETENTION,
	CONTACT_REQUEST_RETENTION,
	PAGE_VIEW_RETENTION,
	REMOVAL_REQUEST_RETENTION,
	REPORT_RETENTION,
	retentionMonths,
} from "./retention-config";

describe("retention periods", () => {
	it("defaults to what the privacy policy states", () => {
		expect(retentionMonths(AUDIT_LOG_RETENTION, {})).toBe(12);
		expect(retentionMonths(REPORT_RETENTION, {})).toBe(6);
		expect(retentionMonths(REMOVAL_REQUEST_RETENTION, {})).toBe(12);
		expect(retentionMonths(CONTACT_REQUEST_RETENTION, {})).toBe(12);
		expect(retentionMonths(PAGE_VIEW_RETENTION, {})).toBe(13);
		expect(retentionMonths(ADMIN_ALERT_INTERVAL, {})).toBe(15);
	});

	it("keeps page views 25 months at most, and alerts at most a day apart", () => {
		expect(retentionMonths(PAGE_VIEW_RETENTION, { PAGE_VIEW_RETENTION_MONTHS: "26" })).toBe(13);
		expect(retentionMonths(PAGE_VIEW_RETENTION, { PAGE_VIEW_RETENTION_MONTHS: "1" })).toBe(1);
		expect(retentionMonths(ADMIN_ALERT_INTERVAL, { ADMIN_ALERT_INTERVAL_MINUTES: "1441" })).toBe(
			15,
		);
		expect(retentionMonths(ADMIN_ALERT_INTERVAL, { ADMIN_ALERT_INTERVAL_MINUTES: "60" })).toBe(60);
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
