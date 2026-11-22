import { expect, type Page, test } from "@playwright/test";
import { REACT_TIMING_SCRIPT } from "../src/lib/security-headers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";

/*
 * Security headers and the Content-Security-Policy on the built app: every
 * page answers with its policy (a fresh nonce in the practitioner space and on
 * the appointment page, the static policy on cached pages), loads without a
 * single CSP violation, and the API refuses cross-site writes and oversized
 * bodies. Against the SYNTHETIC fixtures.
 */

const NONCE_PAGES = [
	"/pro/connexion",
	"/pro/inscription",
	"/pro/revendication-email",
	"/pro/securite",
	"/pro/tableau-de-bord",
	"/rdv",
	"/en/rdv",
];
const STATIC_PAGES = [
	"/",
	"/pro",
	"/annuaire",
	"/medecin-generaliste/75-paris",
	`/praticien/${BOOKING_PRACTITIONERS.direct.slug}`,
	"/a-propos",
];

/** Records CSP violations from the first script on, before the page's own code runs. */
async function watchViolations(page: Page) {
	await page.addInitScript(() => {
		const seen: string[] = [];
		(window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
		document.addEventListener("securitypolicyviolation", (event) => {
			seen.push(`${event.violatedDirective} ${event.blockedURI}`);
		});
	});
	const console: string[] = [];
	page.on("console", (message) => {
		if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
			console.push(message.text());
		}
	});
	return async () => [
		...(await page.evaluate(
			() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
		)),
		...console,
	];
}

function scriptSources(policy: string) {
	return policy
		.split("; ")
		.find((directive) => directive.startsWith("script-src "))
		?.split(" ")
		.slice(1);
}

for (const path of NONCE_PAGES) {
	test(`${path}: a fresh nonce on every request, and no CSP violation`, async ({
		page,
		request,
	}) => {
		const first = await request.get(path, { maxRedirects: 0 });
		const second = await request.get(path, { maxRedirects: 0 });
		const policies = [first, second].map(
			(response) => response.headers()["content-security-policy"],
		);
		for (const policy of policies) {
			expect(policy).toBeTruthy();
			expect(scriptSources(policy ?? "")).not.toContain("'unsafe-inline'");
			expect(policy).toMatch(/'nonce-[A-Za-z0-9+/]{22}=='/);
		}
		expect(policies[0]).not.toBe(policies[1]);
		// Every inline script of the HTML carries this response's nonce (data blocks aside), but
		// React's timing script of the prerendered shell, allowed by its hash instead.
		const nonce = /'nonce-([^']+)'/.exec(policies[0] ?? "")?.[1];
		const html = await first.text();
		const unsigned = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
			.filter(
				([, attributes = ""]) =>
					!attributes.includes(`nonce="${nonce}"`) && !attributes.includes("application/ld+json"),
			)
			.map(([, , content]) => content);
		expect(unsigned.filter((content) => content !== REACT_TIMING_SCRIPT)).toEqual([]);

		const violations = await watchViolations(page);
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		expect(await violations()).toEqual([]);
	});
}

for (const path of STATIC_PAGES) {
	test(`${path}: the static policy, the security headers, and no CSP violation`, async ({
		page,
		request,
	}) => {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(200);
		const headers = response.headers();
		const policy = headers["content-security-policy"] ?? "";
		expect(scriptSources(policy)).toEqual(["'self'", "'unsafe-inline'"]);
		expect(policy).toContain("object-src 'none'");
		expect(policy).toContain("frame-ancestors 'none'");
		expect(policy).not.toContain("unsafe-eval");
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["x-frame-options"]).toBe("DENY");
		expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["permissions-policy"]).toContain("camera=()");
		expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

		const violations = await watchViolations(page);
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		expect(await violations()).toEqual([]);
	});
}

test("the appointment page sends no referrer at all", async ({ request }) => {
	const response = await request.get("/rdv");
	expect(response.headers()["referrer-policy"]).toBe("no-referrer");
	expect(response.headers()["cache-control"]).toContain("no-store");
});

test("API answers can neither run nor be framed nor be read cross-origin", async ({ request }) => {
	const response = await request.get("/api/health");
	const headers = response.headers();
	expect(headers["content-security-policy"]).toContain("default-src 'none'");
	expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
	expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("tRPC refuses writes from another site", async ({ request }) => {
	const body = {
		json: { rpps: null, kind: "wrong_info", message: "Erreur fictive", contact: null },
	};
	const attempts: Record<string, string>[] = [
		{ "sec-fetch-site": "cross-site" },
		{ origin: "https://evil.example" },
	];
	for (const headers of attempts) {
		const response = await request.post("/api/trpc/gdpr.report", {
			data: body,
			headers: { "content-type": "application/json", ...headers },
		});
		expect(response.status()).toBe(403);
	}
});

test("auth and tRPC refuse oversized bodies before reading them", async ({ request }) => {
	const huge = "x".repeat(600 * 1024);
	const auth = await request.post("/api/auth/sign-in/email", {
		data: huge,
		headers: { "content-type": "application/json" },
	});
	expect(auth.status()).toBe(413);
	const trpc = await request.post("/api/trpc/gdpr.report", {
		data: huge,
		headers: { "content-type": "application/json" },
	});
	expect(trpc.status()).toBe(413);
});

test("security.txt says where to report a vulnerability, until when (RFC 9116)", async ({
	request,
	baseURL,
}) => {
	const response = await request.get("/.well-known/security.txt");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
	const fields = Object.fromEntries(
		(await response.text())
			.trim()
			.split("\n")
			.map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)]),
	);
	// No contact configured on the e2e server: the repository's private advisories.
	expect(fields.Contact).toBe("https://github.com/maxgfr/apercura/security/advisories/new");
	expect(fields.Policy).toBe("https://github.com/maxgfr/apercura/security/policy");
	expect(fields.Canonical).toBe(`${baseURL}/.well-known/security.txt`);
	const expires = Date.parse(fields.Expires ?? "");
	expect(expires).toBeGreaterThan(Date.now());
	expect(expires - Date.now()).toBeLessThan(365 * 86_400_000);
});
