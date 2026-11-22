import { describe, expect, it } from "vitest";
import { authRateLimitKey, clientRateLimitKey, emailRateLimitKey } from "./rate-limit-key";

const headers = (forwarded?: string) =>
	new Headers(forwarded ? { "x-forwarded-for": forwarded } : {});
const env = (count: number) => ({ RATE_LIMIT_KEY: "test-key", TRUSTED_PROXY_COUNT: count });

describe("clientRateLimitKey", () => {
	it("never stores the raw IP address", () => {
		const key = clientRateLimitKey("search", headers("203.0.113.7"), env(1));
		expect(key).toMatch(/^search:[\w-]{43}$/);
		expect(key).not.toContain("203.0.113.7");
	});

	it("ignores X-Forwarded-For without a trusted proxy", () => {
		expect(clientRateLimitKey("search", headers("203.0.113.7"), env(0))).toBe(
			clientRateLimitKey("search", headers("198.51.100.9"), env(0)),
		);
	});

	it("tells clients apart through the trusted proxies only", () => {
		const a = clientRateLimitKey("search", headers("198.51.100.1, 203.0.113.7"), env(1));
		const b = clientRateLimitKey("search", headers("198.51.100.2, 203.0.113.7"), env(1));
		const c = clientRateLimitKey("search", headers("198.51.100.1, 203.0.113.8"), env(1));
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it("scopes keys", () => {
		expect(clientRateLimitKey("a", headers(), env(0))).not.toBe(
			clientRateLimitKey("b", headers(), env(0)),
		);
	});
});

describe("emailRateLimitKey", () => {
	it("keys an address without storing it, whatever its case", () => {
		const key = emailRateLimitKey("auth/sign-in/email", " Camille.Exemple@Example.test ", {
			RATE_LIMIT_KEY: "test-key",
		});
		expect(key).toMatch(/^auth\/sign-in\/email:[\w-]{43}$/);
		expect(key.toLowerCase()).not.toContain("camille");
		expect(key).toBe(
			emailRateLimitKey("auth/sign-in/email", "camille.exemple@example.test", {
				RATE_LIMIT_KEY: "test-key",
			}),
		);
	});
});

describe("authRateLimitKey", () => {
	const keyed = { RATE_LIMIT_KEY: "test-key" };

	it("hashes the address of a Better Auth key and keeps its path", () => {
		const key = authRateLimitKey("203.0.113.7|/sign-in/email", keyed);
		expect(key).toMatch(/^auth:[\w-]{43}\|\/sign-in\/email$/);
		expect(key).not.toContain("203.0.113");
		const v6 = authRateLimitKey("2001:0db8:0001:0002:0000:0000:0000:0000|/sign-in/email", keyed);
		expect(v6).not.toMatch(/2001|0db8/);
	});

	it("keeps one bucket per address and path", () => {
		const key = (ip: string, path = "/sign-in/email") => authRateLimitKey(`${ip}|${path}`, keyed);
		expect(key("203.0.113.7")).toBe(key("203.0.113.7"));
		expect(key("203.0.113.7")).not.toBe(key("203.0.113.8"));
		expect(key("203.0.113.7")).not.toBe(key("203.0.113.7", "/sign-up/email"));
	});

	it("shares the counters across processes without RATE_LIMIT_KEY, through BETTER_AUTH_SECRET", () => {
		const secret = { BETTER_AUTH_SECRET: "synthetic-secret-0123456789abcdef0123456789" };
		const key = authRateLimitKey("203.0.113.7|/sign-in/email", secret);
		expect(key).toBe(authRateLimitKey("203.0.113.7|/sign-in/email", { ...secret }));
		expect(key).not.toBe(authRateLimitKey("203.0.113.7|/sign-in/email", keyed));
		expect(key).not.toContain("203.0.113");
	});
});
