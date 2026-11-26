import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Italian market (/it) against the SYNTHETIC database seeded from packages/etl/fixtures/it
 * (`bun run etl:it --source-dir packages/etl/fixtures/it --offline`): fictitious pharmacies,
 * parapharmacies, hospitals and clinics of the Ministry of Health's lists, placed in ISTAT's
 * regions, provinces and municipalities, never real data.
 */

const PHARMACY = "/it/struttura/farmacia-esempio-f9000001";
const DISPENSARY = "/it/struttura/dispensario-farmaceutico-prova-f9000003";
const PARAPHARMACY = "/it/struttura/parafarmacia-esempio-p900001";
const HOSPITAL = "/it/struttura/ospedale-esempio-s990001";
const CLINIC = "/it/struttura/casa-di-cura-villa-campione-s990003";
const ROMA = "/it/farmacie/roma/roma";

test.use({ locale: "it-IT" });

const PAGES = [
	"/it",
	"/it/farmacie",
	"/it/farmacie/lazio",
	"/it/farmacie/roma",
	ROMA,
	"/it/ospedali/roma/roma",
	"/it/case-di-cura/roma/roma",
	"/it/parafarmacie/milano/milano",
	PHARMACY,
	DISPENSARY,
	PARAPHARMACY,
	HOSPITAL,
	CLINIC,
	"/it/elenco",
	"/it/elenco/lazio",
	"/it/elenco/roma",
	"/it/elenco/roma/roma",
	"/it/cerca?quoi=Esempio",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Italian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "it-IT");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The attributions the IODL 2.0 and CC BY 4.0 ask for (adapter `italy.registries`). */
const FARMACIE =
	/Fonte: Ministero della Salute, Farmacie, IODL 2\.0(, aggiornato al \d{1,2} \S+ \d{4})?/;
const ISTAT =
	"Fonte: Istat, Confini delle unità amministrative a fini statistici al 1° gennaio 2026, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)";

test("a pharmacy's page: the place under its own name, Italian formats, no booking, credits", async ({
	page,
}) => {
	await page.goto(PHARMACY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Farmacia Esempio/);
	await expect(page.getByText("9000001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Via dell'Esempio, 1", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("00184 Roma", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(FARMACIE).first()).toBeVisible();
	await expect(page.getByText(ISTAT, { exact: false }).first()).toBeVisible();
	// The pharmacists named in the company name, and the owner's VAT number, are never shown.
	for (const hidden of [
		"FITTIZIO MARIO",
		"Fittizio Mario",
		"PROVA ANNA",
		"S.N.C.",
		"99909000001",
	]) {
		await expect(page.getByText(hidden, { exact: false })).toHaveCount(0);
	}
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/it\/struttura\/farmacia-esempio-f9000001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const pharmacy = data.find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.name).toBe("Farmacia Esempio");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "IT-FARM", value: "9000001" });
	expect(pharmacy.address).toMatchObject({ addressCountry: "IT", postalCode: "00184" });
	// City precision: no point is published for an Italian place.
	expect(pharmacy.geo).toBeUndefined();
	expect(pharmacy.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("it-IT");
});

test("a dispensary says what it is, a hospital its type and its beds", async ({ page }) => {
	await page.goto(DISPENSARY);
	await expect(page.getByText("Dispensario farmaceutico", { exact: true })).toBeVisible();
	await expect(page.getByText(/Fregene/).first()).toBeVisible();
	await page.goto(HOSPITAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Ospedale Esempio/);
	await expect(page.getByText("Ospedale a gestione diretta", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Acuti (250 posti letto), Riabilitazione (20 posti letto)", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText(/Fonte: Ministero della Salute, Posti letto per struttura ospedaliera/).first(),
	).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);
	await page.goto(CLINIC);
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);
	await page.goto(PARAPHARMACY);
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalBusiness")).toBe(true);
});

test("a wrong name part redirects to the canonical Italian slug", async ({ page }) => {
	const response = await page.goto("/it/struttura/nome-sbagliato-f9000001");
	expect(response?.url()).toMatch(/\/it\/struttura\/farmacia-esempio-f9000001$/);
	expect((await page.goto("/it/struttura/niente-f1"))?.status()).toBe(404);
	expect((await page.goto("/it/struttura/niente-9000001"))?.status()).toBe(404);
});

test("Italy lists by region, province and municipality", async ({ page }) => {
	await page.goto("/it/farmacie/lazio");
	await expect(page.getByRole("link", { name: /^Roma/ }).first()).toBeVisible();
	await page.goto(ROMA);
	await expect(page.getByRole("link", { name: /Farmacia Esempio/ }).first()).toBeVisible();
	await expect(page.getByText("Carte Vitale", { exact: false })).toHaveCount(0);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/farmacie"))?.status()).toBe(404);
	expect((await page.goto("/it/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/it/lekarna"))?.status()).toBe(404);
	expect((await page.goto("/it/pharmacies"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/farmacia-esempio-f9000001"))?.status()).toBe(404);
	expect((await page.goto("/it/struttura/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/it/struttura/mudr-jana-ukazkova-900001"))?.status()).toBe(404);
	// France in Italian keeps its own pages.
	expect((await page.goto("/fr-it"))?.status()).toBe(200);
	await page.goto("/it/cerca?quoi=Farmacia%20Esempio");
	await expect(page.getByRole("link", { name: /Farmacia Esempio/ }).first()).toBeVisible();
	await page.goto("/fr/recherche?quoi=Farmacia%20Esempio");
	await expect(page.getByRole("link", { name: /^Farmacia Esempio/ })).toHaveCount(0);
});

test("a kind of place in a place goes straight to its Italian listing", async ({ page }) => {
	await page.goto("/it/cerca?quoi=farmacia&ou=Roma");
	await expect(page).toHaveURL(/\/it\/farmacie\/roma\/roma$/);
	await page.goto(`/it/cerca?quoi=${encodeURIComponent("pronto soccorso")}`);
	await expect(page).toHaveURL(/\/it\/ospedali$/);
	await page.goto("/it/cerca?quoi=farmacia&ou=Rome");
	await expect(page).toHaveURL(/\/it\/farmacie\/roma\/roma$/);
	await page.goto("/it/cerca?quoi=dentista");
	await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /Farmacia Esempio/ })).toHaveCount(0);
});

test("a pharmacy searched from France goes to Italy's pharmacies in Roma", async ({ page }) => {
	await page.goto("/fr/recherche?quoi=pharmacie&ou=Rome");
	await expect(page).toHaveURL(/\/it\/farmacie\/roma\/roma$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "it-IT");
	await page.goto("/fr/recherche?ou=Italie");
	await expect(page).toHaveURL(/\/it$/);
});

test("the Italian home lists kinds and regions, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/it");
	await expect(page.getByRole("link", { name: /^Farmacie/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Lazio/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="it-IT"]')).toHaveAttribute(
		"href",
		/\/it$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
});

test("the international home lists Italy as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura Italy/ })).toHaveAttribute("href", "/it");
});

test("Italy's sitemaps list its pages at their Italian paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/it/pages-0.xml");
	expect(index).toContain("/sitemaps/it/praticiens-0.xml");
	const places = await (await request.get("/sitemaps/it/praticiens-0.xml")).text();
	expect(places).toContain(`${PHARMACY}</loc>`);
	expect(places).toContain(`${HOSPITAL}</loc>`);
	expect(places).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/it/listes-0.xml")).text();
	expect(listings).toContain(`${ROMA}</loc>`);
	expect(listings).toContain("/it/farmacie/lazio</loc>");
	const directory = await (await request.get("/sitemaps/it/lieux-0.xml")).text();
	expect(directory).toContain("/it/elenco/roma</loc>");
	const pages = await (await request.get("/sitemaps/it/pages-0.xml")).text();
	expect(pages).toContain("/it/privacy</loc>");
	expect(pages).toContain("/it/accessibilita</loc>");
	expect(pages).not.toContain("/it/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/it/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /it/cerca");
	expect(robots).toContain("Disallow: /fr-it/cerca");
});

test("an Italian place's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get("/og/praticien/it.farmacia-esempio-f9000001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get("/og/praticien/farmacia-esempio-f9000001.png")).status()).toBe(404);
});

test("a former Italian address of France moves only on the former host", async ({ request }) => {
	// On apercura.org, `/it` is Italy's: an old link of France in Italian is not redirected.
	const response = await request.get("/it", { maxRedirects: 0 });
	expect(response.status()).toBe(200);
});
