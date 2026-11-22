import { describe, expect, it } from "vitest";
import { clientSchema, describeEnvIssues, LEGAL_REQUIRED_IN_PRODUCTION, serverSchema } from "./env";

const VALID = {
	APP_URL: "https://apercura.example",
	DATABASE_URL: "postgres://user:password@localhost:5432/apercura",
};
const LONG_SECRET = "x".repeat(32);
/** Fictitious publisher and host: a production environment needs them all. */
const LEGAL = {
	LEGAL_PUBLISHER_NAME: "Association Exemple",
	LEGAL_PUBLISHER_LEGAL_FORM: "Association loi 1901",
	LEGAL_PUBLISHER_ADDRESS: "1 rue de l’Exemple, 75000 Paris",
	LEGAL_PUBLISHER_PHONE: "01 00 00 00 00",
	LEGAL_PUBLISHER_REGISTRATION: "RNA W000000000",
	LEGAL_PUBLICATION_DIRECTOR: "Camille Exemple",
	LEGAL_CONTACT_EMAIL: "contact@apercura.example",
	LEGAL_HOST_NAME: "Hébergeur Exemple",
	LEGAL_HOST_ADDRESS: "2 rue de l’Exemple, 75000 Paris",
	LEGAL_HOST_PHONE: "01 00 00 00 01",
	LEGAL_SMTP_PROVIDER: "Courrier Exemple",
	LEGAL_EFFECTIVE_DATE: "2026-12-01",
};
const PRODUCTION = { ...VALID, ...LEGAL, NODE_ENV: "production", BETTER_AUTH_SECRET: LONG_SECRET };

function issuesOf(schema: typeof serverSchema | typeof clientSchema, values: object): string[] {
	const result = schema.safeParse(values);
	if (result.success) return [];
	return describeEnvIssues(result.error);
}

describe("environment validation messages", () => {
	it("accepts a complete production environment", () => {
		expect(issuesOf(serverSchema, PRODUCTION)).toEqual([]);
	});

	it("names the secret that is too short in production", () => {
		expect(issuesOf(serverSchema, { ...PRODUCTION, JOBS_SECRET: "short" })).toEqual([
			"JOBS_SECRET must be at least 32 characters in production",
		]);
	});

	it.each([
		"BETTER_AUTH_SECRET",
		"ALTCHA_HMAC_KEY",
		"RATE_LIMIT_KEY",
		"REVALIDATE_SECRET",
		"JOBS_SECRET",
	])("names %s when it is too short", (name) => {
		const issues = issuesOf(serverSchema, { ...PRODUCTION, [name]: "short" });
		expect(issues).toEqual([`${name} must be at least 32 characters in production`]);
	});

	it("names the session secret when production lacks it", () => {
		expect(issuesOf(serverSchema, { ...VALID, ...LEGAL, NODE_ENV: "production" })).toEqual([
			"BETTER_AUTH_SECRET is required in production (bun run keys:generate)",
		]);
	});

	it.each(LEGAL_REQUIRED_IN_PRODUCTION)("names %s when production lacks it", (name) => {
		expect(issuesOf(serverSchema, { ...PRODUCTION, [name]: undefined })).toEqual([
			`${name} is required in production (legal pages, docs/launch-checklist.md)`,
		]);
	});

	it("leaves the legal variables optional outside production", () => {
		expect(issuesOf(serverSchema, VALID)).toEqual([]);
	});

	it("takes the host's name from PUBLIC_HDS_HOST when LEGAL_HOST_NAME is unset", () => {
		const { LEGAL_HOST_NAME: _, ...withoutHost } = PRODUCTION;
		expect(issuesOf(serverSchema, withoutHost)).toEqual([
			"LEGAL_HOST_NAME (or PUBLIC_HDS_HOST) is required in production (legal notice)",
		]);
		expect(
			issuesOf(serverSchema, { ...withoutHost, PUBLIC_HDS_HOST: "Hébergeur Exemple" }),
		).toEqual([]);
	});

	it("asks for the DPO's contact once booking is on in production", () => {
		expect(issuesOf(serverSchema, { ...PRODUCTION, FEATURE_BOOKING: "true" })).toEqual([
			"LEGAL_DPO_CONTACT is required in production when FEATURE_BOOKING is on (GDPR art. 37)",
		]);
		expect(
			issuesOf(serverSchema, {
				...PRODUCTION,
				FEATURE_BOOKING: "true",
				LEGAL_DPO_CONTACT: "dpo@apercura.example",
			}),
		).toEqual([]);
	});

	it("checks the formats of the contact, the date and the security contact", () => {
		expect(
			issuesOf(serverSchema, {
				...VALID,
				LEGAL_CONTACT_EMAIL: "not an email",
				LEGAL_EFFECTIVE_DATE: "1 December 2026",
				SECURITY_CONTACT: "security@apercura.example",
			}).map((line) => line.split(":")[0]),
		).toEqual(["LEGAL_CONTACT_EMAIL", "LEGAL_EFFECTIVE_DATE", "SECURITY_CONTACT"]);
	});

	it("names the variable of every type and format rule", () => {
		const issues = issuesOf(serverSchema, {
			APP_URL: "not a url",
			NODE_ENV: "staging",
			BETTER_AUTH_URL: "nope",
			TRUSTED_PROXY_COUNT: "-1",
			FEATURE_BOOKING: "yes",
		});
		const named = (name: string) => issues.filter((line) => line.startsWith(`${name}: `));
		for (const name of [
			"APP_URL",
			"DATABASE_URL",
			"NODE_ENV",
			"BETTER_AUTH_URL",
			"TRUSTED_PROXY_COUNT",
			"FEATURE_BOOKING",
		]) {
			expect(named(name), name).toHaveLength(1);
		}
		expect(issues).toHaveLength(6);
	});

	it("refuses an SMTP_URL that weakens TLS in production, unless SMTP_ALLOW_INSECURE", () => {
		const insecure = { ...PRODUCTION, SMTP_URL: "smtp://mail.apercura.example:25?ignoreTLS=true" };
		expect(issuesOf(serverSchema, insecure)).toEqual([
			'SMTP_URL may not set "ignoreTLS" in production: TLS comes from the scheme (smtps:// implicit TLS, smtp:// STARTTLS required)',
		]);
		expect(issuesOf(serverSchema, { ...insecure, SMTP_ALLOW_INSECURE: "true" })).toEqual([]);
		expect(
			issuesOf(serverSchema, { ...PRODUCTION, SMTP_URL: "smtps://u:p@mail.apercura.example:465" }),
		).toEqual([]);
		expect(
			issuesOf(serverSchema, { ...PRODUCTION, SMTP_URL: "smtp://u:p@mail.apercura.example:587" }),
		).toEqual([]);
		expect(
			issuesOf(serverSchema, { ...VALID, SMTP_URL: "smtp://localhost:1025?ignoreTLS=true" }),
		).toEqual([]);
	});

	it("keeps the retention periods within their bounds", () => {
		const parsed = serverSchema.parse(VALID);
		expect([
			parsed.AUDIT_LOG_RETENTION_MONTHS,
			parsed.REPORT_RETENTION_MONTHS,
			parsed.REMOVAL_REQUEST_RETENTION_MONTHS,
		]).toEqual([12, 6, 12]);
		expect(
			issuesOf(serverSchema, { ...VALID, AUDIT_LOG_RETENTION_MONTHS: "3" }).map(
				(line) => line.split(":")[0],
			),
		).toEqual(["AUDIT_LOG_RETENTION_MONTHS"]);
		expect(issuesOf(serverSchema, { ...VALID, REPORT_RETENTION_MONTHS: "24" })).toEqual([]);
	});

	it("names the client variables too", () => {
		expect(issuesOf(clientSchema, { NEXT_PUBLIC_MAP_STYLE_URL: "tiles" })).toEqual([
			"NEXT_PUBLIC_MAP_STYLE_URL: Invalid URL",
		]);
	});
});
