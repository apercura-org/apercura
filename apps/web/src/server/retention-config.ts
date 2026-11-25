/**
 * Retention periods in months, configurable within bounds. The privacy policy
 * (`PrivacyPage` messages) and the legal documents state the defaults.
 */
export interface RetentionSetting {
	variable: string;
	fallback: number;
	min: number;
	max: number;
}

/**
 * Both access logs (`care.audit_events`, `directory.platform_audit_events`): one year. Six
 * months at least, as `care.purge_audit_events()` enforces too (CNIL: 6 months to a year).
 */
export const AUDIT_LOG_RETENTION: RetentionSetting = {
	variable: "AUDIT_LOG_RETENTION_MONTHS",
	fallback: 12,
	min: 6,
	max: 60,
};

/** Error reports, counted from their resolution or dismissal: six months. */
export const REPORT_RETENTION: RetentionSetting = {
	variable: "REPORT_RETENTION_MONTHS",
	fallback: 6,
	min: 1,
	max: 60,
};

/**
 * Rejected removal requests, counted from their decision: one year (proof that the request was
 * handled). A confirmed one is deleted with the page (`purgeSuppressed`): the suppression that
 * keeps the page from coming back is then the record of the objection.
 */
export const REMOVAL_REQUEST_RETENTION: RetentionSetting = {
	variable: "REMOVAL_REQUEST_RETENTION_MONTHS",
	fallback: 12,
	min: 1,
	max: 60,
};

/**
 * "I am this practitioner" contact requests, counted from their last change (whatever their
 * status, so a request nobody answered does not stay forever): one year.
 */
export const CONTACT_REQUEST_RETENTION: RetentionSetting = {
	variable: "CONTACT_REQUEST_RETENTION_MONTHS",
	fallback: 12,
	min: 1,
	max: 60,
};

/**
 * Daily view counters of claimed pages: 13 months, so an owner can compare a month with the same
 * month a year earlier, and no longer (CNIL guidance on audience measurement).
 */
export const PAGE_VIEW_RETENTION: RetentionSetting = {
	variable: "PAGE_VIEW_RETENTION_MONTHS",
	fallback: 13,
	min: 1,
	max: 25,
};

/**
 * Not a retention but read the same way, in minutes: at most one administrators' alert per queue
 * in this interval (`server/admin-alerts.ts`).
 */
export const ADMIN_ALERT_INTERVAL: RetentionSetting = {
	variable: "ADMIN_ALERT_INTERVAL_MINUTES",
	fallback: 15,
	min: 1,
	max: 1440,
};

/**
 * Reads a period from the environment defensively: the jobs and builds that skip the
 * environment validation still get a value within bounds (the default when it is not a whole
 * number in range).
 */
export function retentionMonths(
	setting: RetentionSetting,
	env: Record<string, string | undefined> = process.env,
): number {
	const raw = env[setting.variable];
	if (raw === undefined || raw.trim() === "") return setting.fallback;
	const value = Number(raw);
	return Number.isInteger(value) && value >= setting.min && value <= setting.max
		? value
		: setting.fallback;
}
