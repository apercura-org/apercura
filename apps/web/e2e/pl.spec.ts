import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Polish market (/pl) against the SYNTHETIC database seeded from packages/etl/fixtures/pl
 * (`bun run etl:pl --source-dir packages/etl/fixtures/pl --offline --as-of 2026-11-27`):
 * fictitious RPWDL establishments placed in TERYT's voivodeships, powiats and gminas, never real
 * data.
 */

const HOSPITAL = "/pl/placowka/szpital-przykladowy-900001";
const DENTAL = "/pl/placowka/gabinet-stomatologiczny-900002";
const CARDIOLOGY = "/pl/placowka/poradnia-kardiologiczna-wzorzec-900003";
const CLINIC = "/pl/placowka/przychodnia-rodzinna-wzorzec-900004";

test.use({ locale: "pl-PL" });

const PAGES = [
	"/pl",
	"/pl/szpitale",
	"/pl/szpitale/warszawa",
	"/pl/szpitale/mazowieckie",
	"/pl/stomatologia",
	"/pl/stomatologia/legnica",
	"/pl/stomatologia/dolnoslaskie",
	"/pl/przychodnie-poz/powiat-boleslawiecki",
	"/pl/przychodnie-poz/powiat-boleslawiecki/boleslawiec-gmina-wiejska",
	"/pl/poradnie-kardiologiczne",
	HOSPITAL,
	DENTAL,
	CARDIOLOGY,
	CLINIC,
	"/pl/katalog",
	"/pl/katalog/powiat-boleslawiecki",
	"/pl/katalog/powiat-boleslawiecki/boleslawiec-gmina-wiejska",
	"/pl/katalog/legnica",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Polish with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "pl-PL");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The attribution RPWDL's reuse conditions ask for (adapter `poland.registries`), with its dates. */
const RPWDL =
	"Źródło: Centrum e-Zdrowia, Rejestr Podmiotów Wykonujących Działalność Leczniczą (dane.gov.pl), licencja CC BY 4.0. Czas wytworzenia: 27 listopada 2026";

test("a hospital's page: the establishment, Polish formats, no booking, the sources with their dates", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Szpital Przykładowy/);
	await expect(page.getByText("900001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Przykładowa 1", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("00-950 Warszawa", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /22 123 45 67/ }).first()).toHaveAttribute(
		"href",
		"tel:+48221234567",
	);
	await expect(page.getByText(/Szpitalny oddział ratunkowy/).first()).toBeVisible();
	await expect(
		page.getByText(/Stacjonarne i całodobowe świadczenia zdrowotne – szpitalne/),
	).toBeVisible();
	await expect(page.getByText(RPWDL, { exact: false }).first()).toBeVisible();
	await expect(page.getByText(/czas pozyskania/).first()).toBeVisible();
	await expect(page.getByText(/Główny Urząd Statystyczny, rejestr TERYT/).first()).toBeVisible();
	await expect(
		page.getByText(/Opracowano na podstawie materiałów państwowego zasobu geodezyjnego/).first(),
	).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "NRPZS"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/pl\/placowka\/szpital-przykladowy-900001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
	const data = await graphOf(page);
	const hospital = data.find((item) => item["@type"] === "Hospital");
	expect(hospital.name).toBe("Szpital Przykładowy");
	expect(hospital.identifier).toMatchObject({ propertyID: "PL-RPWDL", value: "900001" });
	expect(hospital.address).toMatchObject({ addressCountry: "PL", postalCode: "00-950" });
	expect(hospital.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
});

test("a sole trader's establishment never prints her name", async ({ page }) => {
	await page.goto(DENTAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Gabinet Stomatologiczny/);
	await expect(page.getByText(/Przykładowa/)).toHaveCount(0);
	await expect(page.getByText("Podmiot leczniczy", { exact: true })).toHaveCount(0);
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
});

test("a specialist clinic names its field and its cells", async ({ page }) => {
	await page.goto(CARDIOLOGY);
	await expect(page.getByText(/Poradnia kardiologiczna/).first()).toBeVisible();
	const clinic = (await graphOf(page)).find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.medicalSpecialty).toBe("https://schema.org/Cardiovascular");
});

test("a wrong name part redirects to the canonical Polish slug", async ({ page }) => {
	const response = await page.goto("/pl/placowka/zla-nazwa-900001");
	expect(response?.url()).toMatch(/\/pl\/placowka\/szpital-przykladowy-900001$/);
	expect((await page.goto("/pl/placowka/nic-0900001"))?.status()).toBe(404);
});

test("a city with powiat rights is its powiat's page", async ({ page }) => {
	await page.goto("/pl/stomatologia/legnica");
	await expect(page.getByRole("link", { name: /Przykład Dental/ }).first()).toBeVisible();
	await page.goto("/pl/szpitale/mazowieckie");
	await expect(page.getByRole("link", { name: /Szpital Przykładowy/ }).first()).toBeVisible();
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/szpitale"))?.status()).toBe(404);
	expect((await page.goto("/pl/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/pl/prakticky-lekar"))?.status()).toBe(404);
	expect((await page.goto("/pl/placowka/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/pl/placowka/the-example-surgery-a99001"))?.status()).toBe(404);
	await page.goto("/pl/szukaj?quoi=Szpital%20Przyk%C5%82adowy");
	await expect(page.getByRole("link", { name: /Szpital Przykładowy/ }).first()).toBeVisible();
});

test("everyday words go straight to their Polish listing", async ({ page }) => {
	await page.goto(`/pl/szukaj?quoi=${encodeURIComponent("dentysta")}`);
	await expect(page).toHaveURL(/\/pl\/stomatologia$/);
	await page.goto(`/pl/szukaj?quoi=${encodeURIComponent("szpital")}&ou=Warszawa`);
	await expect(page).toHaveURL(/\/pl\/szpitale\/warszawa$/);
});

test("a search for a Polish place from another market moves to /pl", async ({ page }) => {
	await page.goto(`/fr/recherche?quoi=dentiste&ou=${encodeURIComponent("Legnica")}`);
	await expect(page).toHaveURL(/\/pl\/stomatologia\/legnica$/);
});

test("the Polish home lists voivodeships and joins the homes' hreflang", async ({ page }) => {
	await page.goto("/pl");
	await expect(page.getByRole("link", { name: /województwo dolnośląskie/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="pl-PL"]')).toHaveAttribute(
		"href",
		/\/pl$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
});

test("the international home lists Poland as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura Poland/ })).toHaveAttribute("href", "/pl");
});

test("Poland's sitemaps list its pages at their Polish paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/pl/pages-0.xml");
	expect(index).toContain("/sitemaps/pl/praticiens-0.xml");
	const establishments = await (await request.get("/sitemaps/pl/praticiens-0.xml")).text();
	expect(establishments).toContain("/pl/placowka/szpital-przykladowy-900001</loc>");
	expect(establishments).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/pl/listes-0.xml")).text();
	expect(listings).toContain("/pl/stomatologia/legnica</loc>");
	expect(listings).not.toContain("/pl/stomatologia/legnica/legnica</loc>");
	const pages = await (await request.get("/sitemaps/pl/pages-0.xml")).text();
	expect(pages).toContain("/pl/prywatnosc</loc>");
	expect(pages).toContain("/pl/dostepnosc</loc>");
	expect(pages).not.toContain("/pl/pro</loc>");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /pl/szukaj");
});

test("a Polish establishment's Open Graph image is found by its marked segment", async ({
	request,
}) => {
	const response = await request.get("/og/praticien/pl.szpital-przykladowy-900001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
});
