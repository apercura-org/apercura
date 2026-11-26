import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The German market (/de) against the SYNTHETIC database seeded from packages/etl/fixtures/de
 * (`bun run etl:places --country de --source-dir packages/etl/fixtures/de`, then
 * `bun run etl:de --source-dir packages/etl/fixtures/de --offline`): fictitious hospitals,
 * clinics and pharmacies placed in Destatis's Länder, Kreise and Gemeinden, never real data.
 * Their keys are derived from the fixtures, so the slugs below are stable.
 */

const HOSPITAL = "/de/einrichtung/universitaetsklinikum-beispielstadt-campus-nord-k7f80f63906";
const PSYCHIATRIC =
	"/de/einrichtung/muster-tagesklinik-fuer-psychiatrie-und-psychotherapie-k221594b0e5";
const CHILDRENS = "/de/einrichtung/kinderkrankenhaus-musterhafen-k1b699ea40e";
const REHAB = "/de/einrichtung/rehaklinik-fiktivia-r161d4b92c2";
const PHARMACY_TH = "/de/einrichtung/beispiel-apotheke-th9001";
const PHARMACY_TH_BRANCH = "/de/einrichtung/probe-apotheke-im-zentrum-th9003";
const PHARMACY_BB = "/de/einrichtung/fiktiv-apotheke-am-park-bbef2771a4ae";
const BERLIN_HOSPITALS = "/de/krankenhaeuser/berlin";

test.use({ locale: "de-DE" });

const PAGES = [
	"/de",
	"/de/krankenhaeuser",
	BERLIN_HOSPITALS,
	"/de/krankenhaeuser/landkreis-muenchen",
	"/de/krankenhaeuser/landkreis-muenchen/unterhaching",
	"/de/apotheken",
	"/de/apotheken/erfurt",
	"/de/reha-kliniken",
	HOSPITAL,
	PSYCHIATRIC,
	CHILDRENS,
	REHAB,
	PHARMACY_TH,
	PHARMACY_TH_BRANCH,
	PHARMACY_BB,
	"/de/verzeichnis",
	"/de/verzeichnis/landkreis-muenchen",
	"/de/verzeichnis/landkreis-muenchen/unterhaching",
];

for (const path of PAGES) {
	test(`${path} answers 200 in German with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The statistical offices' source note (adapter `germany.registries`), word for word. */
const DESTATIS = /© Statistisches Bundesamt \(Destatis\), \d{4}/;

test("a hospital's page: the facility, its departments, German formats, no booking", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Universitätsklinikum Beispielstadt – Campus Nord/,
	);
	await expect(page.getByText("k7f80f63906", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Fachabteilungen", { exact: true })).toBeVisible();
	await expect(page.getByText(/Innere Medizin/).first()).toBeVisible();
	await expect(page.getByText(/Umfassende Notfallversorgung/).first()).toBeVisible();
	await expect(page.getByText("Hochschulklinik", { exact: true })).toBeVisible();
	await expect(page.getByText("Öffentlicher Träger", { exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: /030 / }).first()).toHaveAttribute(
		"href",
		/^tel:\+4930/,
	);
	await expect(page.getByText(/keine Online-Terminbuchung/).first()).toBeVisible();
	await expect(page.getByText(DESTATIS).first()).toBeVisible();
	// City precision: the hospital directory publishes no coordinates, so no map pin.
	await expect(page.locator(".maplibregl-map")).toHaveCount(0);
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "Arzt"]) {
		await expect(page.getByText(foreign, { exact: true })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		new RegExp(`${HOSPITAL}$`),
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const hospital = data.find((item) => item["@type"] === "Hospital");
	expect(hospital.name).toBe("Universitätsklinikum Beispielstadt – Campus Nord");
	expect(hospital.identifier).toMatchObject({ propertyID: "DE-KHV", value: "7f80f63906" });
	expect(hospital.address).toMatchObject({ addressCountry: "DE", addressLocality: "Berlin" });
	expect(hospital.geo).toBeUndefined();
	expect(hospital.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("de-DE");
});

test("hospitals are Hospital entities, clinics MedicalClinic, pharmacies Pharmacy", async ({
	page,
}) => {
	await page.goto(PSYCHIATRIC);
	await expect(page.getByText("Psychiatrische Klinik", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);
	await page.goto(CHILDRENS);
	await expect(page.getByText("Kinderklinik", { exact: true }).first()).toBeVisible();
	await page.goto(REHAB);
	await expect(page.getByText("Reha-Klinik", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalClinic")).toBe(true);
	await page.goto(PHARMACY_BB);
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("a Thuringian pharmacy: its kind, its accessibility, its own source", async ({ page }) => {
	await page.goto(PHARMACY_TH_BRANCH);
	await expect(page.getByText("Filialapotheke", { exact: true })).toBeVisible();
	await page.goto("/de/einrichtung/muster-apotheke-am-markt-th9002");
	await expect(page.getByText(/Barrierefrei mit Einschränkung/).first()).toBeVisible();
	await expect(page.getByText("© GDI-Th", { exact: false }).first()).toBeVisible();
	// A pharmacy has no departments.
	await expect(page.getByText("Fachabteilungen", { exact: true })).toHaveCount(0);
});

test("the pharmacies say they cover Thüringen and Brandenburg only", async ({ page }) => {
	for (const path of ["/de/apotheken", "/de/apotheken/erfurt"]) {
		await page.goto(path);
		await expect(
			page.getByText(/Apotheken werden nur für Thüringen und Brandenburg aufgeführt/).first(),
		).toBeVisible();
	}
	await page.goto(BERLIN_HOSPITALS);
	await expect(page.getByText(/nur für Thüringen und Brandenburg/)).toHaveCount(0);
});

test("a kreisfreie Stadt's city page is its Kreis's page", async ({ page }) => {
	const response = await page.goto("/de/krankenhaeuser/berlin/berlin");
	expect(response?.url()).toMatch(/\/de\/krankenhaeuser\/berlin$/);
	await expect(page.getByRole("link", { name: /Campus Süd/ }).first()).toBeVisible();
});

test("a wrong name part redirects to the canonical German slug", async ({ page }) => {
	const response = await page.goto("/de/einrichtung/falscher-name-k7f80f63906");
	expect(response?.url()).toMatch(new RegExp(`${HOSPITAL}$`));
	expect((await page.goto("/de/einrichtung/nichts-x0a1b2c3d4e"))?.status()).toBe(404);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/krankenhaeuser"))?.status()).toBe(404);
	expect((await page.goto("/at/krankenhaeuser"))?.status()).toBe(404);
	expect((await page.goto("/fr-de/krankenhaeuser"))?.status()).toBe(404);
	expect((await page.goto("/de/allgemeinmedizin"))?.status()).toBe(404);
	expect((await page.goto("/de/chirurgien-dentiste"))?.status()).toBe(404);
	expect((await page.goto("/de/hospitales"))?.status()).toBe(404);
	expect(
		(
			await page.goto("/at/arzt/universitaetsklinikum-beispielstadt-campus-nord-k7f80f63906")
		)?.status(),
	).toBe(404);
	expect((await page.goto("/de/einrichtung/camille-exemple-19999990013"))?.status()).toBe(404);
	await page.goto("/de/suche?quoi=Universit%C3%A4tsklinikum%20Beispielstadt");
	await expect(page.getByRole("link", { name: /Campus Nord/ }).first()).toBeVisible();
	await page.goto("/at/suche?quoi=Universit%C3%A4tsklinikum%20Beispielstadt");
	await expect(page.getByRole("link", { name: /Campus Nord/ })).toHaveCount(0);
});

test("everyday words go straight to their German listing", async ({ page }) => {
	await page.goto("/de/suche?quoi=Krankenhaus");
	await expect(page).toHaveURL(/\/de\/krankenhaeuser$/);
	await page.goto("/de/suche?quoi=Notaufnahme&ou=Berlin");
	await expect(page).toHaveURL(/\/de\/krankenhaeuser\/berlin$/);
	await page.goto("/de/suche?quoi=Apotheke&ou=Erfurt");
	await expect(page).toHaveURL(/\/de\/apotheken\/erfurt$/);
	await page.goto("/de/suche?quoi=Hausarzt");
	await expect(
		page.getByRole("heading", { name: "„Hausarzt“ ist noch nicht im Verzeichnis" }),
	).toBeVisible();
	await expect(page.getByText(/keine Ärztinnen und Ärzte/).first()).toBeVisible();
});

test("the German home lists kinds and Kreise, and joins the homes' hreflang", async ({ page }) => {
	await page.goto("/de");
	await expect(page.getByRole("link", { name: /Krankenhäuser/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Landkreis München/ }).first()).toBeVisible();
	await expect(page.getByText(/nur für Thüringen und Brandenburg/).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="de-DE"]')).toHaveAttribute(
		"href",
		/\/de$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="de-AT"]')).toHaveAttribute(
		"href",
		/\/at$/,
	);
});

test("France in German stays at /fr-de, Austria at /at", async ({ page }) => {
	const response = await page.goto("/fr-de");
	expect(response?.status()).toBe(200);
	// France's German interface: the language alone, Germany's pages are `de-DE`.
	await expect(page.locator("html")).toHaveAttribute("lang", "de");
	expect(await robotsOf(page)).toBe("noindex, follow");
	await page.goto("/at");
	await expect(page.locator("html")).toHaveAttribute("lang", "de-AT");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Österreich/);
});

test("Germany's sitemaps list its pages at their German paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/de/pages-0.xml");
	expect(index).toContain("/sitemaps/de/praticiens-0.xml");
	const facilities = await (await request.get("/sitemaps/de/praticiens-0.xml")).text();
	expect(facilities).toContain(`${HOSPITAL}</loc>`);
	expect(facilities).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/de/listes-0.xml")).text();
	// Potsdam, a kreisfreie Stadt: its Kreis's listing, never a city listing of its own.
	expect(listings).toContain("/de/krankenhaeuser/potsdam</loc>");
	expect(listings).not.toContain("/de/krankenhaeuser/potsdam/potsdam</loc>");
	expect(listings).toContain("/de/krankenhaeuser/landkreis-muenchen/garching-b-muenchen</loc>");
	const pages = await (await request.get("/sitemaps/de/pages-0.xml")).text();
	expect(pages).toContain("/de/impressum</loc>");
	expect(pages).toContain("/de/datenschutz</loc>");
	expect(pages).toContain("/de/barrierefreiheit</loc>");
	expect(pages).toContain("/de/daten</loc>");
	expect(pages).not.toContain("/de/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/de/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /de/suche");
});

test("a German facility's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get("/og/praticien/de.beispiel-apotheke-th9001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get("/og/praticien/beispiel-apotheke-th9001.png")).status()).toBe(404);
});
