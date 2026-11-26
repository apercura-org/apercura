import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The United Kingdom market (/gb) against the SYNTHETIC database seeded from
 * packages/etl/fixtures/gb (`bun run etl:gb --source-dir packages/etl/fixtures/gb --offline`):
 * fictitious NHS practices of the ODS, Public Health Scotland and BSO lists, never real data.
 */

const PRACTICE = "/gb/practice/the-example-surgery-a99001";
const LISTING = "/gb/gp-practices/stockton-on-tees";
const TOWN = "/gb/gp-practices/stockton-on-tees/stockton-on-tees";
const REGION = "/gb/gp-practices/north-east";

test.use({ locale: "en-GB" });

const PAGES = [
	"/gb",
	"/gb/gp-practices",
	REGION,
	LISTING,
	TOWN,
	"/gb/dental-practices/stockton-on-tees",
	"/gb/pharmacies/stockton-on-tees",
	PRACTICE,
	"/gb/practice/example-medical-centre-sg89001",
	"/gb/practice/example-group-practice-ng901",
	"/gb/directory",
	"/gb/directory/north-east",
	"/gb/directory/stockton-on-tees",
	"/gb/directory/stockton-on-tees/stockton-on-tees",
];

for (const path of PAGES) {
	test(`${path} answers 200 in British English with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

test("a GP practice's page: the practice, UK formats, no booking, OGL credits", async ({
	page,
}) => {
	await page.goto(PRACTICE);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/The Example Surgery/);
	await expect(page.getByText("A99001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("TS18 1ZA", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Stockton-on-Tees", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /01632 960001/ }).first()).toHaveAttribute(
		"href",
		"tel:+441632960001",
	);
	// The branch surgery is a second address of the practice.
	await expect(page.getByText("Billingham Example Branch").first()).toBeVisible();
	await expect(page.getByText(/does not offer online booking in the UK/).first()).toBeVisible();
	await expect(
		page.getByText(
			/NHS England, Organisation Data Service, licensed under the Open Government Licence v3\.0/,
		),
	).toBeVisible();
	await expect(page.getByText(/Contains OS data © Crown copyright/)).toBeVisible();
	for (const french of ["Carte Vitale", "RPPS", "ameli", "Book an appointment"]) {
		await expect(page.getByText(french, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/gb\/practice\/the-example-surgery-a99001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const clinic = data.find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.name).toBe("The Example Surgery");
	expect(clinic.identifier).toMatchObject({ propertyID: "GB-ODS-GP", value: "A99001" });
	expect(clinic.address).toMatchObject({ addressCountry: "GB", postalCode: "TS18 1ZA" });
	expect(clinic.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("en-GB");
});

test("a practice named after a person is shown under its premises, never the person", async ({
	page,
}) => {
	const response = await page.goto("/gb/practice/fictional-medical-centre-a99002");
	expect(response?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Fictional Medical Centre/);
	await expect(page.getByText(/Example & Partners|Dr A Example/i)).toHaveCount(0);
	const belfast = await page.goto("/gb/practice/example-group-practice-ng901");
	expect(belfast?.status()).toBe(200);
	await expect(page.getByText(/Partners/)).toHaveCount(0);
});

test("dental practices and pharmacies are Dentist and Pharmacy entities", async ({ page }) => {
	await page.goto("/gb/practice/example-dental-practice-v99001");
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
	await page.goto("/gb/practice/example-pharmacy-fx001");
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("a wrong name part redirects to the canonical UK slug, and a Welsh code stays British", async ({
	page,
}) => {
	const response = await page.goto("/gb/practice/wrong-name-a99001");
	expect(response?.url()).toMatch(/\/gb\/practice\/the-example-surgery-a99001$/);
	const welsh = await page.goto("/gb/practice/meddygfa-enghraifft-w99007");
	expect(welsh?.status()).toBe(200);
	await expect(page.getByText("Cardiff", { exact: true }).first()).toBeVisible();
});

test("a region's listing links its local authorities, an authority its towns", async ({ page }) => {
	await page.goto(REGION);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("GP practices in North East");
	await expect(page.getByRole("link", { name: /^Stockton-on-Tees/ }).first()).toHaveAttribute(
		"href",
		LISTING,
	);
	await page.goto(LISTING);
	await expect(page.getByRole("link", { name: /^Billingham/ }).first()).toBeVisible();
	await expect(page.getByText("Carte Vitale", { exact: false })).toHaveCount(0);
	expect((await page.goto("/gb/gp-practices/north-east/billingham"))?.status()).toBe(404);
});

test("a London practice is listed in its borough, without a town", async ({ page }) => {
	await page.goto("/gb/practice/kentish-example-practice-a99005");
	await expect(page.getByText("NW5 1ZZ", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: "Camden" }).first()).toBeVisible();
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/gp-practices"))?.status()).toBe(404);
	expect((await page.goto("/gb/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/gb/allgemeinmedizin"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/the-example-surgery-a99001"))?.status()).toBe(404);
	expect((await page.goto("/gb/practice/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/gb/practice/anna-beispiel-w900001"))?.status()).toBe(404);
	// A name no filler shares (a thousand "Filler Example Surgery" tie with "Example Surgery").
	await page.goto("/gb/search?quoi=Fictional%20Medical%20Centre");
	await expect(page.getByRole("link", { name: /Fictional Medical Centre/ }).first()).toBeVisible();
	await page.goto("/fr/recherche?quoi=Fictional%20Medical%20Centre");
	await expect(page.getByRole("link", { name: /Fictional Medical Centre/ })).toHaveCount(0);
});

test("a type of practice in a place goes straight to its UK listing", async ({ page }) => {
	await page.goto("/gb/search?quoi=GP%20practices&ou=Billingham");
	await expect(page).toHaveURL(/\/gb\/gp-practices\/stockton-on-tees\/billingham$/);
});

test("everyday words go straight to their UK listing", async ({ page }) => {
	await page.goto("/gb/search?quoi=GP&ou=Billingham");
	await expect(page).toHaveURL(/\/gb\/gp-practices\/stockton-on-tees\/billingham$/);
	await page.goto("/gb/search?quoi=doctor&ou=Billingham");
	await expect(page).toHaveURL(/\/gb\/gp-practices\/stockton-on-tees\/billingham$/);
	await page.goto("/gb/search?quoi=dentist&ou=Glasgow");
	await expect(page).toHaveURL(/\/gb\/dental-practices\/glasgow-city\/glasgow$/);
	await page.goto("/gb/search?quoi=optician&ou=Billingham");
	await expect(
		page.getByRole("heading", { name: "“optician” is not in the directory yet" }),
	).toBeVisible();
});

test("the UK home lists types of practice and regions, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/gb");
	await expect(page.getByRole("link", { name: /GP practices/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^North East/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="en-GB"]')).toHaveAttribute(
		"href",
		/\/gb$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
});

test("the international home lists the United Kingdom as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura United Kingdom/ })).toHaveAttribute(
		"href",
		"/gb",
	);
});

test("the UK's sitemaps list its pages at their English paths, regions included", async ({
	request,
}) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/gb/pages-0.xml");
	expect(index).toContain("/sitemaps/gb/praticiens-0.xml");
	const practices = await (await request.get("/sitemaps/gb/praticiens-0.xml")).text();
	expect(practices).toContain("/gb/practice/the-example-surgery-a99001</loc>");
	expect(practices).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/gb/listes-0.xml")).text();
	expect(listings).toContain("/gb/gp-practices/north-east</loc>");
	expect(listings).toContain("/gb/gp-practices/stockton-on-tees/stockton-on-tees</loc>");
	const places = await (await request.get("/sitemaps/gb/lieux-0.xml")).text();
	expect(places).toContain("/gb/directory/north-east</loc>");
	expect(places).toContain("/gb/directory/stockton-on-tees</loc>");
	const pages = await (await request.get("/sitemaps/gb/pages-0.xml")).text();
	expect(pages).toContain("/gb/privacy</loc>");
	expect(pages).not.toContain("/gb/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/gb/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /gb/search");
});

test("a UK practice's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get("/og/praticien/gb.the-example-surgery-a99001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get("/og/praticien/the-example-surgery-a99001.png")).status()).toBe(404);
});
