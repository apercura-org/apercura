import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Czech market (/cz) against the SYNTHETIC database seeded from packages/etl/fixtures/cz
 * (`bun run etl:cz --source-dir packages/etl/fixtures/cz --offline`): fictitious NRPZS
 * facilities placed in RÚIAN's regions, districts and municipalities, never real data.
 */

const GP = "/cz/zarizeni/mudr-jana-ukazkova-900001";
const PHARMACY = "/cz/zarizeni/lekarna-u-zlateho-prikladu-900002";
const CARDIOLOGY = "/cz/zarizeni/kardiologie-priklad-s-r-o-900003";
const DENTIST = "/cz/zarizeni/zubni-ordinace-ukazkov-s-r-o-900004";
const PRAGUE_DISTRICT = "/cz/prakticky-lekar/praha/praha-2";

test.use({ locale: "cs-CZ" });

const PAGES = [
	"/cz",
	"/cz/prakticky-lekar",
	"/cz/prakticky-lekar/praha",
	PRAGUE_DISTRICT,
	"/cz/lekarna/brno-mesto",
	"/cz/lekarna/brno-mesto/brno",
	"/cz/kardiolog",
	GP,
	PHARMACY,
	CARDIOLOGY,
	DENTIST,
	"/cz/adresar",
	"/cz/adresar/praha",
	"/cz/adresar/praha/praha-2",
	"/cz/adresar/brno-mesto",
	"/cz/adresar/brno-mesto/brno",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Czech with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "cs-CZ");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The attributions CC BY 4.0 requires, word for word (adapter `czechia.registries`). */
const NRPZS =
	"Zdroj: Ministerstvo zdravotnictví ČR a Ústav zdravotnických informací a statistiky ČR, Národní registr poskytovatelů zdravotních služeb (nzip.cz)";

test("a GP's facility page: the facility, Czech formats, no booking, CC BY 4.0 credits", async ({
	page,
}) => {
	await page.goto(GP);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/MUDr\. Jana Ukázková/);
	await expect(page.getByText("900001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Ukázková 1234/12", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("120 00 Praha 2", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /222 333 444/ }).first()).toHaveAttribute(
		"href",
		"tel:+420222333444",
	);
	await expect(page.getByText(/nenabízí online objednávání/).first()).toBeVisible();
	await expect(page.getByText(NRPZS, { exact: false }).first()).toBeVisible();
	await expect(page.getByText(/ČÚZK, 2026/).first()).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/cz\/zarizeni\/mudr-jana-ukazkova-900001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const clinic = data.find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.name).toBe("MUDr. Jana Ukázková");
	expect(clinic.identifier).toMatchObject({ propertyID: "CZ-NRPZS", value: "900001" });
	expect(clinic.address).toMatchObject({ addressCountry: "CZ", postalCode: "120 00" });
	expect(clinic.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("cs-CZ");
});

test("a specialist's page names its field and its fields of care", async ({ page }) => {
	await page.goto(CARDIOLOGY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Kardiologie Příklad s\.r\.o\./);
	await expect(page.getByText("Obory péče", { exact: true })).toBeVisible();
	await expect(page.getByText(/kardiologie, vnitřní lékařství/).first()).toBeVisible();
	const clinic = (await graphOf(page)).find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.medicalSpecialty).toBe("https://schema.org/Cardiovascular");
});

test("dental practices and pharmacies are Dentist and Pharmacy entities", async ({ page }) => {
	await page.goto(DENTIST);
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
	await page.goto(PHARMACY);
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("a wrong name part redirects to the canonical Czech slug", async ({ page }) => {
	const response = await page.goto("/cz/zarizeni/spatne-jmeno-900001");
	expect(response?.url()).toMatch(/\/cz\/zarizeni\/mudr-jana-ukazkova-900001$/);
	expect((await page.goto("/cz/zarizeni/nic-0900001"))?.status()).toBe(404);
});

test("Prague lists by administrative district, its city page being its district's", async ({
	page,
}) => {
	await page.goto("/cz/prakticky-lekar/praha");
	await expect(page.getByRole("link", { name: /^Praha 2/ }).first()).toHaveAttribute(
		"href",
		PRAGUE_DISTRICT,
	);
	await page.goto(PRAGUE_DISTRICT);
	await expect(page.getByRole("link", { name: /MUDr\. Jana Ukázková/ }).first()).toBeVisible();
	await expect(page.getByText("Carte Vitale", { exact: false })).toHaveCount(0);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/prakticky-lekar"))?.status()).toBe(404);
	expect((await page.goto("/cz/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/cz/allgemeinmedizin"))?.status()).toBe(404);
	expect((await page.goto("/cz/gp-practices"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/mudr-jana-ukazkova-900001"))?.status()).toBe(404);
	expect((await page.goto("/cz/zarizeni/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/cz/zarizeni/the-example-surgery-a99001"))?.status()).toBe(404);
	await page.goto("/cz/hledat?quoi=Jana%20Ukázková");
	await expect(page.getByRole("link", { name: /MUDr\. Jana Ukázková/ }).first()).toBeVisible();
	await page.goto("/fr/recherche?quoi=Jana%20Ukázková");
	await expect(page.getByRole("link", { name: /MUDr\. Jana Ukázková/ })).toHaveCount(0);
});

test("a field of care in a place goes straight to its Czech listing", async ({ page }) => {
	await page.goto("/cz/hledat?quoi=Praktick%C3%BD%20l%C3%A9ka%C5%99&ou=Praha%202");
	await expect(page).toHaveURL(/\/cz\/prakticky-lekar\/praha\/praha-2$/);
});

test("the Czech home lists fields and districts, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/cz");
	await expect(page.getByRole("link", { name: /Praktičtí lékaři/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Brno-město/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="cs-CZ"]')).toHaveAttribute(
		"href",
		/\/cz$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
});

test("the international home lists Czechia as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura Czechia/ })).toHaveAttribute("href", "/cz");
});

test("Czechia's sitemaps list its pages at their Czech paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/cz/pages-0.xml");
	expect(index).toContain("/sitemaps/cz/praticiens-0.xml");
	const facilities = await (await request.get("/sitemaps/cz/praticiens-0.xml")).text();
	expect(facilities).toContain("/cz/zarizeni/mudr-jana-ukazkova-900001</loc>");
	expect(facilities).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/cz/listes-0.xml")).text();
	expect(listings).toContain(`${PRAGUE_DISTRICT}</loc>`);
	expect(listings).not.toContain("/cz/prakticky-lekar/praha/praha</loc>");
	const places = await (await request.get("/sitemaps/cz/lieux-0.xml")).text();
	expect(places).toContain("/cz/adresar/praha</loc>");
	const pages = await (await request.get("/sitemaps/cz/pages-0.xml")).text();
	expect(pages).toContain("/cz/ochrana-osobnich-udaju</loc>");
	expect(pages).toContain("/cz/pristupnost</loc>");
	expect(pages).not.toContain("/cz/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/cz/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /cz/hledat");
});

test("a Czech facility's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get("/og/praticien/cz.mudr-jana-ukazkova-900001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get("/og/praticien/mudr-jana-ukazkova-900001.png")).status()).toBe(404);
});
