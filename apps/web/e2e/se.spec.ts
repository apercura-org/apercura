import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Swedish market (/se) against the SYNTHETIC database seeded from packages/etl/fixtures/se
 * (`bun run etl:se --source-dir packages/etl/fixtures/se --offline`, which imports the places of
 * the same directory first): fictitious pharmacies of the Swedish Medical Products Agency's
 * register and health centres of Västra Götalandsregionen's list, placed in Statistics Sweden's
 * counties and municipalities, never real data. A pharmacy's key is its GLN and a health centre's
 * its HSA-id, so the slugs below are stable.
 */

const PHARMACY = "/se/verksamhet/exempelapoteket-centrum-a7359999000014";
const SOLE_TRADER_PHARMACY = "/se/verksamhet/exempels-apotek-a7359999000052";
const GOTLAND_PHARMACY = "/se/verksamhet/exempelapoteket-visby-a7359999000106";
const HEALTH_CENTRE = "/se/verksamhet/exempel-vardcentral-centrum-v2321000131fx0001";
const REGION_HEALTH_CENTRE = "/se/verksamhet/narhalsan-exempel-vardcentral-v2321000131fx0002";
const STOCKHOLM_PHARMACIES = "/se/apoteken/stockholms-lan/stockholm";
const GOTEBORG_HEALTH_CENTRES = "/se/vardcentraler/vastra-gotalands-lan/goteborg";

test.use({ locale: "sv-SE" });

const PAGES = [
	"/se",
	"/se/apoteken",
	"/se/apoteken/stockholms-lan",
	STOCKHOLM_PHARMACIES,
	"/se/apoteken/gotlands-lan",
	"/se/vardcentraler",
	GOTEBORG_HEALTH_CENTRES,
	PHARMACY,
	GOTLAND_PHARMACY,
	HEALTH_CENTRE,
	REGION_HEALTH_CENTRE,
	"/se/katalog",
	"/se/katalog/stockholms-lan",
	"/se/katalog/vastra-gotalands-lan/goteborg",
	"/se/sok?quoi=apotek",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Swedish with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "sv-SE");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The register's credit (adapter `sweden.registries`), word for word, as CC BY 4.0 asks. */
const REGISTER = "Apotek med tillstånd: © Läkemedelsverket, CC BY 4.0; bearbetat av Apercura";
const HEALTH_CENTRES = "Vårdcentraler: Västra Götalandsregionen, CC0 1.0";
const PLACES = "Län och kommuner: Källa: SCB, CC0 1.0";

test("a pharmacy's page: its GLN, its licence, its holder, its credits, no booking", async ({
	page,
}) => {
	await page.goto(PHARMACY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Exempelapoteket Centrum/);
	await expect(page.getByText("Öppenvårdsapotek", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("GLN", { exact: true })).toBeVisible();
	await expect(page.getByText("7359999000014", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Tillstånd", { exact: true })).toBeVisible();
	await expect(page.getByText(/^5\.9\.3-2020-/).first()).toBeVisible();
	await expect(page.getByText("Giltigt från 1 september 2015")).toBeVisible();
	await expect(page.getByText("Tillståndshavare", { exact: true })).toBeVisible();
	// The register writes the holder with a double space: the page does not.
	await expect(page.getByText("Exempel Apotek AB", { exact: true })).toBeVisible();
	await expect(page.getByText(/^Organisationsnummer 559999-/)).toBeVisible();
	await expect(page.getByText(REGISTER).first()).toBeVisible();
	await expect(page.getByText(PLACES).first()).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "NLOD"]) {
		await expect(page.getByText(foreign, { exact: true })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		new RegExp(`${PHARMACY}$`),
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const pharmacy = data.find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.name).toBe("Exempelapoteket Centrum");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "SE-GLN", value: "7359999000014" });
	expect(pharmacy.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("sv-SE");
});

test("a pharmacy is shown at its municipality, without a map pin", async ({ page }) => {
	await page.goto(PHARMACY);
	await expect(page.getByText("Exempelgatan 1").first()).toBeVisible();
	await expect(page.getByText(/111 22 Stockholm/).first()).toBeVisible();
	// City precision: the register publishes no coordinates, so no map pin.
	await expect(page.locator(".maplibregl-map")).toHaveCount(0);
});

test("a holder who is a person is never shown, and a pharmacy closed to the public is not listed", async ({
	page,
	request,
}) => {
	const response = await page.goto(SOLE_TRADER_PHARMACY);
	expect(response?.status()).toBe(200);
	await expect(page.getByText("Tillstånd", { exact: true })).toBeVisible();
	await expect(page.getByText("Tillståndshavare", { exact: true })).toHaveCount(0);
	await expect(page.getByText(/Fixture Person/)).toHaveCount(0);
	await expect(page.getByText(/811218/)).toHaveCount(0);
	// "Stängt för allmänheten": no page.
	expect((await request.get("/se/verksamhet/exempelapoteket-dos-a7359999000045")).status()).toBe(
		404,
	);
	// A wrong check digit never reaches the database.
	expect((await request.get("/se/verksamhet/exempelapoteket-a7359999000015")).status()).toBe(404);
});

test("a health centre's page: its HSA-id, its care provider, the region's credit", async ({
	page,
}) => {
	await page.goto(HEALTH_CENTRE);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Exempel Vårdcentral Centrum/);
	await expect(page.getByText("Vårdcentral", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("HSA-id", { exact: true })).toBeVisible();
	await expect(page.getByText("SE2321000131-FX0001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Vårdgivare", { exact: true })).toBeVisible();
	await expect(page.getByText("Exempel Vård AB", { exact: true })).toBeVisible();
	await expect(page.getByText(HEALTH_CENTRES).first()).toBeVisible();
	await expect(page.getByText(PLACES).first()).toBeVisible();
	await expect(page.getByText(REGISTER)).toHaveCount(0);
	const data = await graphOf(page);
	const clinic = data.find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.identifier).toMatchObject({ propertyID: "SE-HSA", value: "SE2321000131-FX0001" });
	await page.goto(REGION_HEALTH_CENTRE);
	await expect(page.getByText("Närhälsan", { exact: true }).first()).toBeVisible();
});

test("the health centres' listing says it covers Västra Götaland only", async ({ page }) => {
	for (const path of ["/se/vardcentraler", GOTEBORG_HEALTH_CENTRES]) {
		await page.goto(path);
		await expect(
			page.getByText(/Vårdcentraler finns hittills bara för Västra Götalands län/).first(),
		).toBeVisible();
	}
	await page.goto(GOTEBORG_HEALTH_CENTRES);
	await expect(
		page.getByRole("link", { name: /Exempel Vårdcentral Centrum/ }).first(),
	).toBeVisible();
	// The pharmacies cover all of Sweden: no such note.
	await page.goto("/se/apoteken");
	await expect(page.getByText(/finns hittills bara för/)).toHaveCount(0);
});

test("a county's listing lists its pharmacies, and Gotland has the county's page only", async ({
	page,
}) => {
	await page.goto(STOCKHOLM_PHARMACIES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Stockholm");
	await expect(page.getByRole("link", { name: /Exempelapoteket Centrum/ }).first()).toBeVisible();
	expect(await robotsOf(page)).toBe("index, follow");
	// Gotland is a county and its only municipality: the municipality's page is the county's.
	const response = await page.goto("/se/apoteken/gotlands-lan/gotland");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/se\/apoteken\/gotlands-lan$/);
	await expect(page.getByRole("link", { name: /Exempelapoteket Visby/ }).first()).toBeVisible();
});

test("the home is Sweden's, in Swedish, with Swedish samples and its coverage", async ({
	page,
}) => {
	await page.goto("/se");
	await expect(page.locator("html")).toHaveAttribute("lang", "sv-SE");
	await expect(page.locator("main h1")).toContainText("Sverige");
	await expect(page.getByText(/Exempelapoteket Storgatan/).first()).toBeVisible();
	await expect(page.getByText(/Läkemedelsverket/).first()).toBeVisible();
	// Pharmacies everywhere, health centres in Västra Götaland only, no hospitals.
	await expect(
		page.getByText(/Vårdcentraler finns hittills bara för Västra Götaland/).first(),
	).toBeVisible();
	// One language: no language menu, the country menu stays.
	await expect(page.getByRole("navigation", { name: "Språk" })).toHaveCount(0);
	const countries = page.getByRole("navigation", { name: "Land" });
	await expect(countries).toBeVisible();
	// Every open market, named in Swedish.
	await countries.locator("summary").click();
	await expect(countries.getByRole("link")).toHaveText([
		"Frankrike",
		"Österrike",
		"Storbritannien",
		"Tjeckien",
		"Spanien",
		"Italien",
		"Tyskland",
		"Schweiz",
		"Estland",
		"Polen",
		"Norge",
		"Irland",
		"Finland",
		"Litauen",
		"Slovenien",
		"Cypern",
		"Lettland",
		"Sverige",
		"Malta",
	]);
	await expect(countries.getByRole("link", { name: "Sverige" })).toHaveAttribute(
		"aria-current",
		"true",
	);
});

test("a search for a Swedish place and kind lands on its listing", async ({ request }) => {
	for (const [from, to] of [
		["/se/sok?quoi=apotek&ou=Stockholm", STOCKHOLM_PHARMACIES],
		["/se/sok?quoi=v%C3%A5rdcentral&ou=G%C3%B6teborg", GOTEBORG_HEALTH_CENTRES],
		// From another market, in that market's words.
		["/fr/recherche?quoi=pharmacie&ou=Stockholm", STOCKHOLM_PHARMACIES],
		["/gb/search?quoi=GP&ou=Gothenburg", GOTEBORG_HEALTH_CENTRES],
	] as const) {
		const response = await request.get(from, { maxRedirects: 0 });
		expect(response.status(), from).toBe(307);
		const location = new URL(response.headers().location ?? "", "http://localhost");
		expect(location.pathname + location.search, from).toBe(to);
	}
});

test("a kind Sweden does not list says so, in Swedish", async ({ page }) => {
	await page.goto("/se/sok?quoi=tandl%C3%A4kare");
	await expect(page.getByText(/finns inte i katalogen ännu/).first()).toBeVisible();
});

test("the sitemaps list Sweden's pages under /sitemaps/se", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/se/");
	const pages = await (await request.get("/sitemaps/se/praticiens-0.xml")).text();
	expect(pages).toContain(`${PHARMACY}<`);
	expect(pages).toContain(`${HEALTH_CENTRE}<`);
	const listings = await (await request.get("/sitemaps/se/listes-0.xml")).text();
	expect(listings).toContain(`${STOCKHOLM_PHARMACIES}<`);
	// Gotland, a municipality that is its county, has no URL of its own.
	expect(listings).not.toContain("/gotlands-lan/gotland<");
});
