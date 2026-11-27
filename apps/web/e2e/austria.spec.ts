import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Austrian market (/at) against the SYNTHETIC database seeded from
 * packages/etl/fixtures/at (`bun run etl:at --source-dir packages/etl/fixtures/at --offline`):
 * fictitious doctors of the Vienna, Styria and Salzburg lists, never real data.
 */

const DOCTOR = "/at/arzt/anna-beispiel-w900001";
const LISTING = "/at/allgemeinmedizin/wien";
const DISTRICT = "/at/allgemeinmedizin/wien/alsergrund";

test.use({ locale: "de-AT" });

const PAGES = [
	"/at",
	"/at/allgemeinmedizin",
	LISTING,
	DISTRICT,
	"/at/frauenheilkunde/steiermark/graz",
	"/at/zahnaerzte/salzburg",
	DOCTOR,
	"/at/verzeichnis",
	"/at/verzeichnis/wien",
	"/at/verzeichnis/steiermark/graz",
];

for (const path of PAGES) {
	test(`${path} answers 200 in German with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "de-AT");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

test("a Vienna doctor's page: German facts, Austrian formats, no booking, CC BY credit", async ({
	page,
}) => {
	await page.goto(DOCTOR);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Anna Beispiel/);
	await expect(page.getByText("Kennung", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("1090 Wien", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /01 0000101/ }).first()).toHaveAttribute(
		"href",
		"tel:+4310000101",
	);
	await expect(page.getByText(/keine Online-Terminbuchung/).first()).toBeVisible();
	await expect(
		page.getByText("Datenquelle: Stadt Wien – data.wien.gv.at", { exact: false }),
	).toBeVisible();
	for (const french of ["Carte Vitale", "RPPS", "ameli", "Termin buchen"]) {
		await expect(page.getByText(french, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/at\/arzt\/anna-beispiel-w900001$/,
	);
	// hreflang only links the homes, never a practitioner page to another market.
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
	const data = jsonLd.flatMap((text) => JSON.parse(text)["@graph"]);
	const person = data.find((item) => item["@type"] === "IndividualPhysician");
	expect(person.identifier).toMatchObject({ propertyID: "AT-WIEN", value: "900001" });
	expect(person.address).toMatchObject({ addressCountry: "AT", postalCode: "1090" });
	expect(person.potentialAction).toBeUndefined();
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("de-AT");
});

test("a wrong name part redirects to the canonical Austrian slug", async ({ page }) => {
	const response = await page.goto("/at/arzt/falscher-name-w900001");
	expect(response?.url()).toMatch(/\/at\/arzt\/anna-beispiel-w900001$/);
});

test("a listing of a Vienna district and the Wien city page", async ({ page }) => {
	await page.goto(DISTRICT);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Allgemeinmedizin in Wien-Alsergrund",
	);
	await expect(page.getByRole("link", { name: /Anna Beispiel/ })).toBeVisible();
	await expect(page.getByText("Carte Vitale", { exact: false })).toHaveCount(0);
	// Wien is its Bundesland's page, like Paris.
	const city = await page.goto("/at/allgemeinmedizin/wien/wien");
	expect(city?.url()).toMatch(/\/at\/allgemeinmedizin\/wien$/);
});

test("each market lists only its own practitioners and slugs", async ({ page }) => {
	expect((await page.goto("/fr/allgemeinmedizin"))?.status()).toBe(404);
	expect((await page.goto("/at/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/anna-beispiel-w900001"))?.status()).toBe(404);
	expect((await page.goto("/at/arzt/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/at/einrichtung/centre-hospitalier-fictif-2a9999001"))?.status()).toBe(
		404,
	);
	await page.goto("/fr/recherche?quoi=Beispiel");
	await expect(page.getByRole("link", { name: /Anna Beispiel/ })).toHaveCount(0);
	await page.goto("/at/suche?quoi=Beispiel");
	await expect(page.getByRole("link", { name: /Anna Beispiel/ }).first()).toBeVisible();
});

test("a specialty in a place goes straight to its Austrian listing", async ({ page }) => {
	await page.goto("/at/suche?quoi=Allgemeinmedizin&ou=Graz");
	await expect(page).toHaveURL(/\/at\/allgemeinmedizin\/steiermark\/graz$/);
});

test("the Austrian home lists specialties and Bundesländer, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/at");
	await expect(page.getByRole("link", { name: /Allgemeinmedizin/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Wien/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="de-AT"]')).toHaveAttribute(
		"href",
		/\/at$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	// No language switcher to France's interface translations: an Austrian page has none.
	await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
});

test("the international home lists Austria as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura (Austria|Österreich)/ })).toHaveAttribute(
		"href",
		"/at",
	);
});

test("Austria's sitemaps list its pages at their German paths, and robots.txt covers /at", async ({
	request,
}) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/at/pages-0.xml");
	expect(index).toContain("/sitemaps/at/praticiens-0.xml");
	const doctors = await (await request.get("/sitemaps/at/praticiens-0.xml")).text();
	expect(doctors).toContain("/at/arzt/anna-beispiel-w900001</loc>");
	expect(doctors).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/at/listes-0.xml")).text();
	expect(listings).toContain("/at/allgemeinmedizin/wien</loc>");
	expect(listings).not.toContain("/at/allgemeinmedizin/wien/wien</loc>");
	const places = await (await request.get("/sitemaps/at/lieux-0.xml")).text();
	expect(places).toContain("/at/verzeichnis/wien</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/at/");
	expect((await request.get("/sitemaps/be/pages-0.xml")).status()).toBe(404);
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /at/suche");
});
