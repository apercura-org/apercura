import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Estonian market (/ee) against the SYNTHETIC database seeded from packages/etl/fixtures/ee
 * (`bun run etl:ee --source-dir packages/etl/fixtures/ee --offline`, which imports the places of
 * the same directory first): fictitious providers and pharmacies placed in the Land Board's
 * counties, municipalities and settlements, never real data. A provider's key is its first
 * activity licence, a pharmacy's its place of business code, so the slugs below are stable.
 */

const HOSPITAL = "/ee/asutus/naidise-haigla-l00011";
const FAMILY_PRACTICE = "/ee/asutus/naidise-perearstikeskus-l00021";
const DENTAL = "/ee/asutus/hambakliinik-naide-l00031";
const NURSING_HOSPITAL = "/ee/asutus/naidise-oendushaigla-l00051";
const PHARMACY = "/ee/asutus/naidise-apteek-ap9001";
const TALLINN_FAMILY_PRACTICES = "/ee/perearstikeskused/tallinn";

test.use({ locale: "et-EE" });

const PAGES = [
	"/ee",
	"/ee/perearstikeskused",
	TALLINN_FAMILY_PRACTICES,
	"/ee/perearstikeskused/tallinn/lasnamae-linnaosa",
	"/ee/apteegid",
	"/ee/apteegid/tallinn",
	"/ee/hambaravi/keila-linn",
	HOSPITAL,
	FAMILY_PRACTICE,
	DENTAL,
	NURSING_HOSPITAL,
	PHARMACY,
	"/ee/kataloog",
	"/ee/kataloog/tallinn",
	"/ee/kataloog/tallinn/lasnamae-linnaosa",
	"/ee/otsing?quoi=apteek",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Estonian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "et-EE");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The Health Board's credit (adapter `estonia.registries`), word for word. */
const HEALTH_BOARD =
	"Terviseamet, tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud";

test("a hospital's page: its activity licence numbers, its kind, its services, no booking", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	// The register writes the name in capitals and with its legal form: the page does neither.
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Näidise Haigla/);
	// Every page about a provider prints its activity licence numbers (Advertising Act § 22(3)).
	await expect(page.getByText("Tegevusload", { exact: true })).toBeVisible();
	for (const licence of ["L00011", "L00012"]) {
		await expect(page.getByText(licence, { exact: true }).first()).toBeVisible();
	}
	await expect(page.getByText("Eriarstiabi", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Üldhaigla", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/Ambulatoorsed üldkirurgiateenused/).first()).toBeVisible();
	await expect(page.getByText(HEALTH_BOARD).first()).toBeVisible();
	// A school's health room is no place a patient visits: never a site of the page.
	await expect(page.getByText(/koolitervishoiu/i)).toHaveCount(0);
	// The health workers the register names with the provider are never shown.
	for (const worker of ["Mari Näidis", "Jaan Example", "MARI", "Näidis Mari"]) {
		await expect(page.getByText(worker, { exact: false })).toHaveCount(0);
	}
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
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
	expect(hospital.name).toBe("Näidise Haigla");
	expect(hospital.identifier).toMatchObject({ propertyID: "EE-TTL", value: "00011" });
	expect(hospital.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("et-EE");
});

test("a family practice, a dental clinic and a pharmacy read as their kind", async ({ page }) => {
	await page.goto(FAMILY_PRACTICE);
	await expect(page.getByText("Perearstikeskus", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("L00021", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalClinic")).toBe(true);
	await page.goto(DENTAL);
	await expect(page.getByText("Hambakliinik", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
	await page.goto(PHARMACY);
	await expect(page.getByText("Apteek", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Apteegi tegevusluba", { exact: true })).toBeVisible();
	await expect(page.getByText("Ravimiamet, tegevuslubade register").first()).toBeVisible();
	// A pharmacy is not a healthcare provider of the Health Board's register.
	await expect(page.getByText(HEALTH_BOARD)).toHaveCount(0);
	await expect(page.getByText("Tegevusload", { exact: true })).toHaveCount(0);
	// Its number, the Estonian way.
	await expect(page.getByRole("link", { name: /699 0001/ }).first()).toHaveAttribute(
		"href",
		/^tel:\+3726990001/,
	);
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("a listing of a municipality lists its providers, and Tallinn's districts below", async ({
	page,
}) => {
	await page.goto(TALLINN_FAMILY_PRACTICES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Tallinn");
	await expect(page.getByRole("link", { name: /Näidise Perearstikeskus/ }).first()).toBeVisible();
	expect(await robotsOf(page)).toBe("index, follow");
	await page.goto("/ee/perearstikeskused/tallinn/lasnamae-linnaosa");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Lasnamäe linnaosa");
});

test("a town that is its own municipality has the municipality's page only", async ({ page }) => {
	// Keila is the only settlement of the municipality Keila linn and shares its code.
	const response = await page.goto("/ee/hambaravi/keila-linn/keila-linn");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/ee\/hambaravi\/keila-linn$/);
});

test("the home is Estonia's, in Estonian, with Estonian samples", async ({ page }) => {
	await page.goto("/ee");
	await expect(page.locator("html")).toHaveAttribute("lang", "et-EE");
	await expect(page.locator("main h1")).toContainText("Eestis");
	await expect(page.getByText(/Näidis/).first()).toBeVisible();
	await expect(page.getByText(/Terviseamet/).first()).toBeVisible();
	// One language: no language menu, the country menu stays.
	await expect(page.getByRole("navigation", { name: "Keel" })).toHaveCount(0);
	await expect(page.getByRole("navigation", { name: "Riik" })).toBeVisible();
});

test("a search for an Estonian place and kind lands on its listing", async ({ request }) => {
	for (const [from, to] of [
		["/ee/otsing?quoi=perearst&ou=Tallinn", "/ee/perearstikeskused/tallinn"],
		// The settlement's name without its kind ("Tartu" for "Tartu linn").
		["/ee/otsing?quoi=apteek&ou=Tartu", "/ee/apteegid/tartu-linn/tartu-linn"],
		// From another market, in that market's words.
		["/fr/recherche?quoi=pharmacie&ou=Tallinn", "/ee/apteegid/tallinn"],
	] as const) {
		const response = await request.get(from, { maxRedirects: 0 });
		expect(response.status(), from).toBe(307);
		const location = new URL(response.headers().location ?? "", "http://localhost");
		expect(location.pathname + location.search, from).toBe(to);
	}
});

test("the sitemaps list Estonia's pages under /sitemaps/ee", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/ee/");
	const pages = await (await request.get("/sitemaps/ee/praticiens-0.xml")).text();
	expect(pages).toContain(`${HOSPITAL}<`);
	expect(pages).toContain(`${PHARMACY}<`);
	const listings = await (await request.get("/sitemaps/ee/listes-0.xml")).text();
	expect(listings).toContain(`${TALLINN_FAMILY_PRACTICES}<`);
	// The town that is its municipality has no URL of its own.
	expect(listings).not.toContain("/keila-linn/keila-linn<");
});
