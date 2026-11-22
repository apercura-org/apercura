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
 * Removal requests, counted from their decision: one year (proof that the objection was
 * handled). The suppression that keeps the page from coming back is not affected.
 */
export const REMOVAL_REQUEST_RETENTION: RetentionSetting = {
	variable: "REMOVAL_REQUEST_RETENTION_MONTHS",
	fallback: 12,
	min: 1,
	max: 60,
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
