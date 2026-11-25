import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * Public directory pages against the SYNTHETIC database seeded from
 * packages/etl/fixtures (fictitious people, RPPS in the 1999999xxxx range).
 */

const OFFICE = "/fr/praticien/camille-exemple-19999990013";
const HOSPITAL = "/fr/praticien/fanny-placebo-19999990088";
const ESTABLISHMENT = "/fr/etablissement/centre-hospitalier-fictif-2a9999001";
const LANDING = "/fr/medecin-generaliste/75-paris";
const SMALL_LANDING = "/fr/cardiologue/75-paris";
/** A self-employed nurse (fixture 18), contracted according to Ameli. */
const NURSE = "/fr/praticien/pauline-soignante-19999990187";
const NURSE_LANDING = "/fr/infirmier/75-paris/paris-15e-arrondissement";

const PAGES = [
	OFFICE,
	HOSPITAL,
	"/fr-en/practitioner/camille-exemple-19999990013",
	ESTABLISHMENT,
	LANDING,
	`${LANDING}/2`,
	"/fr/medecin-generaliste",
	"/fr/orthodontiste/69-rhone/lyon-3e-arrondissement",
	"/fr/annuaire",
	"/fr/annuaire/75-paris",
	"/fr/annuaire/69-rhone/lyon",
	NURSE,
	NURSE_LANDING,
];

for (const path of PAGES) {
	test(`${path} answers 200 with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = async (page: import("@playwright/test").Page) =>
	page.locator('meta[name="robots"]').getAttribute("content");

test("an office practitioner page: header, call action, JSON-LD and indexing", async ({ page }) => {
	await page.goto(OFFICE);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Camille Exemple/);
	await expect(page.getByText("RPPS", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Appeler le / })).toHaveAttribute("href", /^tel:\+/);
	await expect(page.getByText(/pas encore ouverte/)).toBeVisible();
	await expect(page.getByRole("link", { name: "Revendiquer cette page" })).toHaveAttribute(
		"href",
		"/fr/pro/revendiquer?rpps=19999990013",
	);
	expect(await robotsOf(page)).toBe("index, follow");
	const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
	// One @graph per page (seo.spec.ts checks the server HTML in detail).
	const data = jsonLd.flatMap((text) => JSON.parse(text)["@graph"]);
	const person = data.find((item) => item["@type"] === "IndividualPhysician");
	expect(person.identifier).toEqual({
		"@type": "PropertyValue",
		propertyID: "RPPS",
		value: "19999990013",
	});
	expect(data.some((item) => item["@type"] === "BreadcrumbList")).toBe(true);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/praticien\/camille-exemple-19999990013$/,
	);
});

test("a nurse's page states the agreement without a sector or OPTAM", async ({ page }) => {
	await page.goto(OFFICE);
	await expect(page.getByText("Secteur de conventionnement", { exact: true })).toBeVisible();
	await expect(page.getByText("Conventionné secteur 1", { exact: true })).toBeVisible();

	await page.goto(NURSE);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Pauline Soignante/);
	const fees = page.getByRole("region", { name: "Honoraires et Assurance Maladie" });
	await expect(fees.getByText("Conventionnement", { exact: true })).toBeVisible();
	await expect(fees.getByText("Conventionné", { exact: true })).toBeVisible();
	await expect(fees.getByText(/secteur/i)).toHaveCount(0);
	await expect(fees.getByText(/OPTAM/)).toHaveCount(0);
	const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
	const data = jsonLd.flatMap((text) => JSON.parse(text)["@graph"]);
	const person = data.find((item) => item["@type"] === "Person");
	expect(person.hasOccupation.occupationalCategory).toMatchObject({
		"@type": "CategoryCode",
		codeValue: "2221",
	});
	// The practitioner's own card first, the profession's image as the fallback.
	const images = page.locator('meta[property="og:image"]');
	await expect(images.first()).toHaveAttribute(
		"content",
		/\/og\/praticien\/pauline-soignante-\d+\.png$/,
	);
	await expect(images.nth(1)).toHaveAttribute("content", /\/og\/infirmier\.png$/);

	await page.goto(NURSE_LANDING);
	await expect(page.getByRole("link", { name: "Pauline Soignante" })).toBeVisible();
	await expect(page.getByRole("columnheader", { name: "Conventionnement" })).toBeAttached();
	await expect(page.locator("main").getByText(/secteur/i)).toHaveCount(0);
});

test("a hospital practitioner is reached through the establishment page", async ({ page }) => {
	await page.goto(HOSPITAL);
	const link = page.getByRole("link", { name: /^Contacter / });
	await expect(link).toHaveAttribute("href", ESTABLISHMENT);
	await link.click();
	await expect(page).toHaveURL(new RegExp(`${ESTABLISHMENT}$`));
	await expect(page.getByRole("link", { name: /Fanny Placebo/ })).toBeVisible();
});

test("English pages exist but are never indexed", async ({ page }) => {
	await page.goto("/fr-en/practitioner/camille-exemple-19999990013");
	expect(await robotsOf(page)).toBe("noindex, follow");
});

test.describe("status codes", () => {
	test("a wrong name part redirects (308) to the canonical page", async ({ request }) => {
		const response = await request.get("/fr/praticien/autre-nom-19999990013", { maxRedirects: 0 });
		expect(response.status()).toBe(308);
		expect(response.headers().location).toMatch(/\/praticien\/camille-exemple-19999990013$/);
	});

	for (const [label, path] of [
		["a bad Luhn check", "/fr/praticien/camille-exemple-19999990014"],
		["an unknown RPPS", "/fr/praticien/inconnu-10000000009"],
		["a locum without a place", "/fr/praticien/gaspard-remplacant-19999990096"],
		["a reserved first segment", "/fr/praticien"],
		["an unknown listing", "/fr/inconnu/75-paris"],
		["an empty listing", "/fr/cardiologue/13-bouches-du-rhone"],
		["a page past the end", `${LANDING}/99`],
	] as const) {
		test(`${label} answers 404`, async ({ request }) => {
			expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
		});
	}

	test("page 1 and the Paris city redirect to the canonical listing", async ({ request }) => {
		for (const path of [`${LANDING}/1`, `${LANDING}/paris`]) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			expect(response.headers().location).toMatch(new RegExp(`${LANDING}$`));
		}
	});
});

test("listings below three practitioners are noindex,follow", async ({ page }) => {
	await page.goto(SMALL_LANDING);
	expect(await robotsOf(page)).toBe("noindex, follow");
	await page.goto(LANDING);
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.getByRole("navigation", { name: "Pages de la liste" })).toBeVisible();
});

test("the sitemap index lists chunks of indexable canonical URLs", async ({ request }) => {
	const index = await request.get("/sitemap.xml");
	expect(index.status()).toBe(200);
	const xml = await index.text();
	expect(xml).toContain("<sitemapindex");
	expect(xml).not.toContain("changefreq");
	const chunk = /<loc>[^<]*(\/sitemaps\/fr\/praticiens-\d+\.xml)<\/loc>/.exec(xml)?.[1];
	expect(chunk).toBeTruthy();
	const urls = await (await request.get(chunk as string)).text();
	expect(urls).toContain("/fr/praticien/camille-exemple-19999990013</loc>");
	expect(urls).not.toContain("gaspard-remplacant");
	expect(urls).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("robots.txt disallows search and the API, never directory pages", async ({ request }) => {
	const body = await (await request.get("/robots.txt")).text();
	expect(body).toContain("Disallow: /fr/recherche");
	expect(body).toContain("Disallow: /api/");
	expect(body).not.toMatch(/Disallow: \/(?:fr\/)?praticien/);
	expect(body).not.toMatch(/^Disallow: \/$/m);
	expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("one Open Graph image per profession", async ({ request }) => {
	for (const image of ["medecin", "infirmier"]) {
		const response = await request.get(`/og/${image}.png`);
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");
	}
});

test("search results offer the next step and stay in the searched place", async ({ page }) => {
	await page.goto("/fr/recherche?quoi=Essai&ou=75015");
	const results = page.getByRole("table", { name: "Résultats" });
	await expect(results).toBeVisible();
	const calls = results.getByRole("link", { name: /^Appeler le / });
	expect(await calls.count()).toBeGreaterThan(0);
	await expect(calls.first()).toHaveAttribute("href", /^tel:\+/);
	await expect(results.getByText(/^Exerce hors de/)).toHaveCount(0);
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("/fr/donnees never scrolls sideways", async ({ page }) => {
		await page.goto("/fr/donnees");
		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(width).toBeLessThanOrEqual(390);
	});
});
