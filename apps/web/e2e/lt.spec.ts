import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Lithuanian market (/lt) against the SYNTHETIC database seeded from packages/etl/fixtures/lt
 * (`bun run etl:places --country lt --source-dir packages/etl/fixtures/lt --offline`, then
 * `bun run etl:lt --source-dir packages/etl/fixtures/lt --offline`): fictitious VASPVT
 * institutions placed in the Address Register's counties, municipalities and settlements, never
 * real data.
 */

const CLINIC = "/lt/istaiga/uab-pavyzdine-klinika-9000-90000001";
const HOSPITAL = "/lt/istaiga/vsi-pavyzdzio-ligonine-9002-90000003";
const DENTAL = "/lt/istaiga/mb-pavyzdzio-odontologija-9003-90000004";
const NURSING = "/lt/istaiga/vardenes-pavardenes-ii-9001-90000002";

test.use({ locale: "lt-LT" });

const PAGES = [
	"/lt",
	"/lt/medicinos-centrai",
	"/lt/medicinos-centrai/vilniaus-apskritis",
	"/lt/medicinos-centrai/vilniaus-miesto-savivaldybe",
	"/lt/odontologijos-klinikos/vilniaus-rajono-savivaldybe",
	"/lt/odontologijos-klinikos/vilniaus-rajono-savivaldybe/pavyzdziai-bandymu-sen",
	"/lt/ligonines",
	CLINIC,
	HOSPITAL,
	DENTAL,
	NURSING,
	"/lt/katalogas",
	"/lt/katalogas/vilniaus-miesto-savivaldybe",
	"/lt/katalogas/vilniaus-rajono-savivaldybe/pavyzdziai-bandymu-sen",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Lithuanian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "lt-LT");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The attributions CC BY 4.0 requires, word for word (adapter `lithuania.registries`). */
const VASPVT =
	"Šaltinis: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM, „Sveikatos priežiūros įstaigų licencijų duomenys“ (data.gov.lt), CC BY 4.0";
const ADDRESS_REGISTER =
	"Šaltinis: VĮ Registrų centras, Lietuvos Respublikos adresų registras (data.gov.lt), CC BY 4.0 (gyvenamųjų vietovių taškus apskaičiavo Apercura)";

test("an institution's page: its registered name, services, no booking, CC BY 4.0 credits", async ({
	page,
}) => {
	await page.goto(CLINIC);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/UAB „Pavyzdinė klinika“/);
	await expect(page.getByText("9000-90000001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Pavyzdžio g. 12-3", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Licencijuotos paslaugos", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/Suaugusiųjų kardiologija/).first()).toBeVisible();
	await expect(page.getByText(VASPVT, { exact: false }).first()).toBeVisible();
	await expect(page.getByText(ADDRESS_REGISTER, { exact: false }).first()).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "NRPZS", "Assurance Maladie"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	// Located at its settlement's point (city precision): no map pin.
	await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/lt\/istaiga\/uab-pavyzdine-klinika-9000-90000001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const clinic = data.find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.name).toBe("UAB „Pavyzdinė klinika“");
	expect(clinic.identifier).toMatchObject({ propertyID: "LT-VASPVT", value: "9000-90000001" });
	expect(clinic.address).toMatchObject({ addressCountry: "LT", addressLocality: "Vilnius" });
	expect(clinic.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("lt-LT");
});

test("an individual enterprise's page leaves its premises number out", async ({ page }) => {
	await page.goto(NURSING);
	await expect(page.getByText("Bandymų g. 5", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Bandymų g. 5-207", { exact: false })).toHaveCount(0);
});

test("hospitals and dental clinics are Hospital and Dentist entities", async ({ page }) => {
	await page.goto(HOSPITAL);
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);
	await page.goto(DENTAL);
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
});

test("a wrong name part redirects to the canonical Lithuanian slug", async ({ page }) => {
	const response = await page.goto("/lt/istaiga/blogas-pavadinimas-9000-90000001");
	expect(response?.url()).toMatch(/\/lt\/istaiga\/uab-pavyzdine-klinika-9000-90000001$/);
	expect((await page.goto("/lt/istaiga/niekas-9999-99999999"))?.status()).toBe(404);
});

test("Vilnius is its municipality's page, and counties list their municipalities", async ({
	page,
}) => {
	const response = await page.goto("/lt/medicinos-centrai/vilniaus-miesto-savivaldybe/vilnius");
	expect(response?.url()).toMatch(/\/lt\/medicinos-centrai\/vilniaus-miesto-savivaldybe$/);
	await expect(page.getByRole("link", { name: /UAB „Pavyzdinė klinika“/ }).first()).toBeVisible();
	await page.goto("/lt/medicinos-centrai/vilniaus-apskritis");
	await expect(
		page.getByRole("link", { name: /^Vilniaus miesto savivaldybė/ }).first(),
	).toHaveAttribute("href", "/lt/medicinos-centrai/vilniaus-miesto-savivaldybe");
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/odontologijos-klinikos"))?.status()).toBe(404);
	expect((await page.goto("/lt/chirurgien-dentiste"))?.status()).toBe(404);
	expect((await page.goto("/lt/zubni-lekar"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/uab-pavyzdine-klinika-9000-90000001"))?.status()).toBe(
		404,
	);
	expect((await page.goto("/lt/istaiga/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/lt/istaiga/mudr-jana-ukazkova-900001"))?.status()).toBe(404);
	await page.goto(`/lt/paieska?quoi=${encodeURIComponent("Pavyzdinė klinika")}`);
	await expect(page.getByRole("link", { name: /UAB „Pavyzdinė klinika“/ }).first()).toBeVisible();
	await page.goto(`/fr/recherche?quoi=${encodeURIComponent("Pavyzdinė klinika")}`);
	await expect(page.getByRole("link", { name: /UAB „Pavyzdinė klinika“/ })).toHaveCount(0);
});

test("everyday words go straight to their Lithuanian listing", async ({ page }) => {
	await page.goto(`/lt/paieska?quoi=${encodeURIComponent("odontologas")}`);
	await expect(page).toHaveURL(/\/lt\/odontologijos-klinikos$/);
	await page.goto(`/lt/paieska?quoi=${encodeURIComponent("vaistinė")}`);
	await expect(
		page.getByRole("heading", { name: "„vaistinė“ kataloge kol kas nėra" }),
	).toBeVisible();
});

test("the Lithuanian home lists kinds and counties, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/lt");
	await expect(
		page.getByRole("link", { name: /Medicinos centrai ir klinikos/ }).first(),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /^Vilniaus apskritis/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="lt-LT"]')).toHaveAttribute(
		"href",
		/\/lt$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
});

test("the international home lists Lithuania as open", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Apercura Lithuania/ })).toHaveAttribute(
		"href",
		"/lt",
	);
});

test("Lithuania's sitemaps list its pages at their Lithuanian paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/lt/pages-0.xml");
	expect(index).toContain("/sitemaps/lt/praticiens-0.xml");
	const institutions = await (await request.get("/sitemaps/lt/praticiens-0.xml")).text();
	expect(institutions).toContain(`${CLINIC}</loc>`);
	expect(institutions).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/lt/listes-0.xml")).text();
	expect(listings).toContain("/lt/medicinos-centrai/vilniaus-miesto-savivaldybe</loc>");
	expect(listings).not.toContain("/lt/medicinos-centrai/vilniaus-miesto-savivaldybe/vilnius</loc>");
	const pages = await (await request.get("/sitemaps/lt/pages-0.xml")).text();
	expect(pages).toContain("/lt/privatumas</loc>");
	expect(pages).toContain("/lt/prieinamumas</loc>");
	expect(pages).not.toContain("/lt/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/lt/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /lt/paieska");
});

test("a Lithuanian institution's Open Graph image is found by its marked segment", async ({
	request,
}) => {
	const response = await request.get("/og/praticien/lt.uab-pavyzdine-klinika-9000-90000001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect(
		(await request.get("/og/praticien/uab-pavyzdine-klinika-9000-90000001.png")).status(),
	).toBe(404);
});
