import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	baseSecurityHeaders,
	contentSecurityPolicy,
	newNonce,
	noncePathPattern,
	originOf,
	REACT_TIMING_SCRIPT,
	REACT_TIMING_SCRIPT_HASH,
} from "./security-headers";

const directive = (policy: string, name: string) =>
	policy
		.split("; ")
		.find((entry) => entry === name || entry.startsWith(`${name} `))
		?.split(" ")
		.slice(1);

describe("content security policy", () => {
	const map = ["https://tiles.openfreemap.org"];

	it("never allows eval, plugins, framing, <base> or foreign form posts in production", () => {
		for (const policy of [
			contentSecurityPolicy({ mapOrigins: map }),
			contentSecurityPolicy({ mapOrigins: map, nonce: newNonce() }),
		]) {
			expect(policy).not.toContain("unsafe-eval");
			expect(directive(policy, "object-src")).toEqual(["'none'"]);
			expect(directive(policy, "base-uri")).toEqual(["'none'"]);
			expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
			expect(directive(policy, "frame-src")).toEqual(["'none'"]);
			expect(directive(policy, "form-action")).toEqual(["'self'"]);
			expect(directive(policy, "default-src")).toEqual(["'self'"]);
		}
	});

	it("runs per-request scripts by nonce, never by 'unsafe-inline'", () => {
		const nonce = newNonce();
		const scripts = directive(contentSecurityPolicy({ nonce }), "script-src");
		expect(scripts).toEqual(["'self'", `'nonce-${nonce}'`, REACT_TIMING_SCRIPT_HASH]);
	});

	it("allows inline scripts on cached pages only, which cannot carry a nonce", () => {
		expect(directive(contentSecurityPolicy(), "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
	});

	it("lets MapLibre and ALTCHA start their workers and reach the map server", () => {
		const policy = contentSecurityPolicy({ mapOrigins: map });
		expect(directive(policy, "worker-src")).toEqual(["'self'", "blob:"]);
		expect(directive(policy, "connect-src")).toEqual(["'self'", ...map]);
		expect(directive(policy, "img-src")).toEqual(expect.arrayContaining(["'self'", ...map]));
	});

	it("adds eval and the hot-reload socket in development only", () => {
		const policy = contentSecurityPolicy({ development: true });
		expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
		expect(directive(policy, "connect-src")).toContain("ws:");
	});

	it("upgrades insecure requests only when asked (HTTPS deployments)", () => {
		expect(contentSecurityPolicy()).not.toContain("upgrade-insecure-requests");
		expect(contentSecurityPolicy({ upgradeInsecureRequests: true })).toContain(
			"; upgrade-insecure-requests",
		);
	});

	it("refuses a nonce that could break out of the header", () => {
		expect(() => contentSecurityPolicy({ nonce: "abc'; script-src *" })).toThrow();
		expect(newNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
		expect(newNonce()).not.toBe(newNonce());
	});

	it("pins the hash of React's timing script to the React build Next.js ships", () => {
		const hash = createHash("sha256").update(REACT_TIMING_SCRIPT).digest("base64");
		expect(REACT_TIMING_SCRIPT_HASH).toBe(`'sha256-${hash}'`);
		const require = createRequire(import.meta.url);
		const next = dirname(require.resolve("next/package.json"));
		const reactDomServer = readFileSync(
			join(next, "dist/compiled/react-dom/cjs/react-dom-server.node.production.js"),
			"utf8",
		);
		expect(reactDomServer).toContain(JSON.stringify(REACT_TIMING_SCRIPT));
	});

	it("keeps only http(s) origins", () => {
		expect(originOf("https://tiles.openfreemap.org/styles/positron")).toBe(
			"https://tiles.openfreemap.org",
		);
		expect(originOf("javascript:alert(1)")).toBeNull();
		expect(originOf("not a url")).toBeNull();
		expect(originOf(undefined)).toBeNull();
	});
});

describe("nonce routes", () => {
	const pattern = noncePathPattern(["fr", "fr-en", "fr-de"]);

	it("covers the practitioner space and the appointment page in every locale", () => {
		for (const path of [
			"/fr/pro/connexion",
			"/fr/pro/agenda/reglages",
			"/fr/pro/admin/revendications/2f0e8c4e-1111-4a4a-9b9b-123456789abc",
			"/fr-en/pro/securite",
			"/fr-de/pro/inscription",
			"/fr/rdv",
			"/fr-en/rdv",
		]) {
			expect(pattern.test(path), path).toBe(true);
		}
	});

	it("leaves cached public pages, the /pro presentation included, to the static policy", () => {
		for (const path of [
			"/",
			"/fr",
			"/fr/pro",
			"/fr-en/pro",
			"/fr/praticien/camille-exemple-1",
			"/fr/prothesiste",
			"/fr/rdvx",
			// Unprefixed paths only ever answer a redirect.
			"/pro/connexion",
		]) {
			expect(pattern.test(path), path).toBe(false);
		}
	});
});

describe("base security headers", () => {
	const keys = (headers: { key: string }[]) => headers.map((header) => header.key);

	it("adds preload to HSTS only when asked, and only where HSTS is sent", () => {
		const hsts = (options: Parameters<typeof baseSecurityHeaders>[0]) =>
			baseSecurityHeaders(options).find((header) => header.key === "Strict-Transport-Security")
				?.value;
		const https = "https://annuaire.example.org";
		expect(hsts({ production: true, appUrl: https })).toBe("max-age=63072000; includeSubDomains");
		expect(hsts({ production: true, appUrl: https, preload: true })).toBe(
			"max-age=63072000; includeSubDomains; preload",
		);
		expect(hsts({ production: false, appUrl: https, preload: true })).toBeUndefined();
		expect(
			hsts({ production: true, appUrl: "http://localhost:3000", preload: true }),
		).toBeUndefined();
	});

	it("sets HSTS only on an HTTPS production build", () => {
		expect(
			keys(baseSecurityHeaders({ production: true, appUrl: "https://annuaire.example.org" })),
		).toContain("Strict-Transport-Security");
		expect(
			keys(baseSecurityHeaders({ production: true, appUrl: "http://localhost:3000" })),
		).not.toContain("Strict-Transport-Security");
		expect(
			keys(baseSecurityHeaders({ production: false, appUrl: "https://annuaire.example.org" })),
		).not.toContain("Strict-Transport-Security");
	});

	it("always sends nosniff, a referrer policy, no framing and a permissions policy", () => {
		const headers = Object.fromEntries(
			baseSecurityHeaders({ production: false, appUrl: undefined }).map((h) => [h.key, h.value]),
		);
		expect(headers["X-Content-Type-Options"]).toBe("nosniff");
		expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["X-Frame-Options"]).toBe("DENY");
		expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
		expect(headers["Permissions-Policy"]).toContain("camera=()");
		expect(headers["Permissions-Policy"]).toContain("geolocation=(self)");
	});
});
