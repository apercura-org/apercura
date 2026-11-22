import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./same-origin";

const APP = ["https://annuaire.example.org"];

function request(method: string, headers: Record<string, string>) {
	return { method, headers: new Headers(headers), url: "http://10.0.0.5:3000/api/trpc/x" };
}

describe("isCrossSiteWrite", () => {
	it("lets our own pages and typed navigations write", () => {
		expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "same-origin" }), APP)).toBe(false);
		expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "none" }), APP)).toBe(false);
	});

	it("refuses writes from other sites, sibling subdomains included", () => {
		expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "cross-site" }), APP)).toBe(true);
		expect(isCrossSiteWrite(request("POST", { "sec-fetch-site": "same-site" }), APP)).toBe(true);
	});

	it("falls back to Origin for browsers without Fetch Metadata", () => {
		expect(isCrossSiteWrite(request("POST", { origin: "https://annuaire.example.org" }), APP)).toBe(
			false,
		);
		expect(isCrossSiteWrite(request("POST", { origin: "https://evil.example" }), APP)).toBe(true);
		expect(isCrossSiteWrite(request("POST", { origin: "null" }), APP)).toBe(true);
	});

	it("never blocks reads, nor server-to-server calls without browser headers", () => {
		expect(isCrossSiteWrite(request("GET", { "sec-fetch-site": "cross-site" }), APP)).toBe(false);
		expect(isCrossSiteWrite(request("POST", {}), APP)).toBe(false);
	});
});
