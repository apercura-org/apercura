import { expect, test } from "@playwright/test";

/*
 * What shared caches and social networks get: the public pages' Cache-Control (never on the
 * practitioner space, appointments, search or forms) and each practitioner page's own Open
 * Graph image. Against the SYNTHETIC fixtures (fictitious people, RPPS 1999999xxxx).
 */

const PUBLIC = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const PRACTITIONER = "camille-exemple-19999990013";

test.describe("Cache-Control", () => {
	for (const path of [
		"/",
		"/fr",
		`/fr/praticien/${PRACTITIONER}`,
		"/fr/medecin-generaliste",
		"/fr/annuaire",
		"/fr/annuaire/75-paris",
		"/fr/a-propos",
		`/fr-en/practitioner/${PRACTITIONER}`,
	]) {
		test(`${path} may be kept briefly by a shared cache`, async ({ request }) => {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBe(200);
			expect(response.headers()["cache-control"]).toBe(PUBLIC);
		});
	}

	test("a missing page is kept as briefly, never for a year", async ({ request }) => {
		const response = await request.get("/fr/praticien/inconnu-19999990997", { maxRedirects: 0 });
		expect(response.status()).toBe(404);
		expect(response.headers()["cache-control"]).toBe(PUBLIC);
	});

	for (const path of [
		"/fr/pro/connexion",
		"/fr/rdv",
		"/fr/recherche?quoi=Essai",
		`/fr/praticien/${PRACTITIONER}/signaler`,
		`/fr/praticien/${PRACTITIONER}/retrait`,
		"/fr-en/search",
		"/api/health",
	]) {
		test(`${path} is never stored by a shared cache`, async ({ request }) => {
			const response = await request.get(path, { maxRedirects: 0 });
			const value = response.headers()["cache-control"] ?? "";
			expect(value).not.toContain("public");
			expect(value).not.toContain("s-maxage");
		});
	}
});

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(body: Buffer): { width: number; height: number } {
	expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	expect(body.subarray(12, 16).toString("ascii")).toBe("IHDR");
	return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

test.describe("practitioner Open Graph image", () => {
	test("is a 1200 × 630 PNG, cached like the page", async ({ request }) => {
		const response = await request.get(`/og/praticien/${PRACTITIONER}.png`);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");
		expect(response.headers()["cache-control"]).toBe(PUBLIC);
		const body = await response.body();
		expect(pngSize(body)).toEqual({ width: 1200, height: 630 });
		// A rendered card, not an empty canvas, and light enough for every network.
		expect(body.length).toBeGreaterThan(10_000);
		expect(body.length).toBeLessThan(300_000);
	});

	test("is the page's first og:image, with its text alternative", async ({ page, baseURL }) => {
		const response = await page.request.get(`/fr/praticien/${PRACTITIONER}`);
		const html = await response.text();
		const origin = new URL(baseURL ?? "").origin;
		const images = [...html.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map(
			(match) => match[1],
		);
		expect(images[0]).toBe(`${origin}/og/praticien/${PRACTITIONER}.png`);
		// The profession's image stays as the fallback.
		expect(images[1]).toMatch(/\/og\/[a-z-]+\.png$/);
		expect(html).toMatch(/<meta property="og:image:alt" content="[^"]*Camille Exemple[^"]*"/);
		expect(html).toContain(
			`<meta name="twitter:image" content="${origin}/og/praticien/${PRACTITIONER}.png"`,
		);
	});

	test("answers 404 for an unknown or malformed number, without rendering", async ({ request }) => {
		for (const file of ["inconnu-19999990997.png", "exemple-10000000008.png", "nope.png", "x"]) {
			const response = await request.get(`/og/praticien/${file}`);
			expect(response.status(), file).toBe(404);
		}
	});
});
