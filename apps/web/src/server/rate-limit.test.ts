import { describe, expect, it } from "vitest";
import { clientIp, windowStart } from "./rate-limit-core";

describe("windowStart", () => {
	it("floors to the start of the fixed window", () => {
		const at = Date.UTC(2026, 10, 21, 10, 15, 42, 123);
		expect(windowStart(at, 60).toISOString()).toBe("2026-11-21T10:15:00.000Z");
		expect(windowStart(at, 3600).toISOString()).toBe("2026-11-21T10:00:00.000Z");
	});
});

describe("clientIp", () => {
	const headers = (forwarded?: string) =>
		new Headers(forwarded ? { "x-forwarded-for": forwarded } : {});

	it("ignores X-Forwarded-For without a trusted proxy", () => {
		expect(clientIp(headers("203.0.113.7"), 0)).toBe("direct");
	});

	it("reads the entry added by the outermost trusted proxy", () => {
		expect(clientIp(headers("198.51.100.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
		expect(clientIp(headers("198.51.100.1, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
	});

	it("falls back when the chain is shorter than the proxy count", () => {
		expect(clientIp(headers("203.0.113.7"), 2)).toBe("direct");
		expect(clientIp(headers(), 1)).toBe("direct");
	});
});
