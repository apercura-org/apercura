import { describe, expect, it } from "vitest";
import { clientSchema, describeEnvIssues, serverSchema } from "./env";

const VALID = {
	APP_URL: "https://apercura.example",
	DATABASE_URL: "postgres://user:password@localhost:5432/apercura",
};
const LONG_SECRET = "x".repeat(32);

function issuesOf(schema: typeof serverSchema | typeof clientSchema, values: object): string[] {
	const result = schema.safeParse(values);
	if (result.success) return [];
	return describeEnvIssues(result.error);
}

describe("environment validation messages", () => {
	it("accepts a complete production environment", () => {
		expect(
			issuesOf(serverSchema, { ...VALID, NODE_ENV: "production", BETTER_AUTH_SECRET: LONG_SECRET }),
		).toEqual([]);
	});

	it("names the secret that is too short in production", () => {
		expect(
			issuesOf(serverSchema, {
				...VALID,
				NODE_ENV: "production",
				BETTER_AUTH_SECRET: LONG_SECRET,
				JOBS_SECRET: "short",
			}),
		).toEqual(["JOBS_SECRET must be at least 32 characters in production"]);
	});

	it.each([
		"BETTER_AUTH_SECRET",
		"ALTCHA_HMAC_KEY",
		"RATE_LIMIT_KEY",
		"REVALIDATE_SECRET",
		"JOBS_SECRET",
	])("names %s when it is too short", (name) => {
		const issues = issuesOf(serverSchema, {
			...VALID,
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: LONG_SECRET,
			[name]: "short",
		});
		expect(issues).toEqual([`${name} must be at least 32 characters in production`]);
	});

	it("names the session secret when production lacks it", () => {
		expect(issuesOf(serverSchema, { ...VALID, NODE_ENV: "production" })).toEqual([
			"BETTER_AUTH_SECRET is required in production (bun run keys:generate)",
		]);
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

	it("names the client variables too", () => {
		expect(issuesOf(clientSchema, { NEXT_PUBLIC_MAP_STYLE_URL: "tiles" })).toEqual([
			"NEXT_PUBLIC_MAP_STYLE_URL: Invalid URL",
		]);
	});
});
