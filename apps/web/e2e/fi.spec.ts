import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Finnish market (/fi) against the SYNTHETIC database seeded from packages/etl/fixtures/fi
 * (`bun run etl:fi --source-dir packages/etl/fixtures/fi --offline`, which imports the places of
 * the same directory first): fictitious public service locations placed in Statistics Finland's
 * municipalities and wellbeing services counties, never real data. A location's key is its
 * fixture channel id, so the slugs below are stable.
 */

const key = (index: number) => `e5e00003000040008000${String(index).padStart(12, "0")}`;
const HOSPITAL = `/fi/toimipiste/esimerkkilan-keskussairaala-${key(1)}`;
const EMERGENCY = `/fi/toimipiste/esimerkkilan-yhteispaivystys-${key(2)}`;
const MENTAL_HEALTH = `/fi/toimipiste/esimerkkilan-mielenterveyskeskus-${key(3)}`;
const HEALTH_CENTRE = `/fi/toimipiste/esimerkkilan-terveysasema-1-${key(100)}`;
const DENTAL = `/fi/toimipiste/esimerkkilan-hammashoitola-1-${key(200)}`;
const CHILD_HEALTH = `/fi/toimipiste/esimerkkipolun-neuvola-1-${key(300)}`;
const TAMPERE_HEALTH_CENTRES = "/fi/terveysasemat/pirkanmaan-hyvinvointialue/tampere";

test.use({ locale: "fi-FI" });

const PAGES = [
	"/fi",
	"/fi/terveysasemat",
	"/fi/terveysasemat/pirkanmaan-hyvinvointialue",
	TAMPERE_HEALTH_CENTRES,
	"/fi/terveysasemat/helsinki",
	"/fi/hammashoitolat/varsinais-suomen-hyvinvointialue/turku",
	"/fi/neuvolat",
	HOSPITAL,
	EMERGENCY,
	MENTAL_HEALTH,
	HEALTH_CENTRE,
	DENTAL,
	CHILD_HEALTH,
	"/fi/hakemisto",
	"/fi/hakemisto/pirkanmaan-hyvinvointialue",
	"/fi/haku?quoi=neuvola",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Finnish with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "fi-FI");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The Finnish Service Catalogue's credit (adapter `finland.registries`), word for word. */
const PTV = "Lähde: Suomi.fi-palvelutietovaranto, Digi- ja väestötietovirasto (CC0 1.0)";
const STATISTICS_FINLAND = /Lähde: Tilastokeskus, kuntapohjaiset tilastointialueet \d{4}/;

test("a hospital's page: its services, its organiser, its sources, no booking", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Esimerkkilän keskussairaala/);
	await expect(page.getByText("Sairaala", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/Erikoissairaanhoidon poliklinikka/).first()).toBeVisible();
	await expect(page.getByText("Esimerkkilän sairaanhoitopiiri").first()).toBeVisible();
	await expect(page.getByText(PTV).first()).toBeVisible();
	await expect(page.getByText(STATISTICS_FINLAND).first()).toBeVisible();
	// The catalogue's e-mail address is never read.
	await expect(page.getByText(/example\.test/)).toHaveCount(0);
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
	expect(hospital.name).toBe("Esimerkkilän keskussairaala");
	expect(hospital.identifier).toMatchObject({ propertyID: "FI-PTV", value: key(1) });
	expect(hospital.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("fi-FI");
});

test("a health centre, a dental clinic and a child health clinic read as their kind", async ({
	page,
}) => {
	await page.goto(HEALTH_CENTRE);
	await expect(page.getByText("Terveysasema", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Lääkärin vastaanotto").first()).toBeVisible();
	// Its number, the Finnish way.
	await expect(page.getByRole("link", { name: /03 990 1000/ }).first()).toHaveAttribute(
		"href",
		/^tel:\+35839901000/,
	);
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalClinic")).toBe(true);
	await page.goto(DENTAL);
	await expect(page.getByText("Hammashoitola", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
	await page.goto(CHILD_HEALTH);
	await expect(page.getByText("Neuvola", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Lastenneuvola").first()).toBeVisible();
});

test("a listing of a municipality lists its locations, under its wellbeing services county", async ({
	page,
}) => {
	await page.goto(TAMPERE_HEALTH_CENTRES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Tampere");
	await expect(
		page.getByRole("link", { name: /Esimerkkilän terveysasema 1\b/ }).first(),
	).toBeVisible();
	expect(await robotsOf(page)).toBe("index, follow");
	await page.goto("/fi/terveysasemat/pirkanmaan-hyvinvointialue");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Pirkanmaan hyvinvointialue");
});

test("Helsinki, which organises its own care, has its department's page only", async ({ page }) => {
	const response = await page.goto("/fi/terveysasemat/helsinki/helsinki");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/fi\/terveysasemat\/helsinki$/);
});

test("the home is Finland's, in Finnish, with Finnish samples", async ({ page }) => {
	await page.goto("/fi");
	await expect(page.locator("html")).toHaveAttribute("lang", "fi-FI");
	await expect(page.locator("main h1")).toContainText("Suomessa");
	await expect(page.getByText(/Esimerkki/).first()).toBeVisible();
	await expect(page.getByText(/Suomi\.fi-palvelutietovaranto/).first()).toBeVisible();
	// One language: no language menu, the country menu stays.
	await expect(page.getByRole("navigation", { name: "Kieli" })).toHaveCount(0);
	await expect(page.getByRole("navigation", { name: "Maa" })).toBeVisible();
});

test("a search for a Finnish place and kind lands on its listing", async ({ request }) => {
	for (const [from, to] of [
		["/fi/haku?quoi=terveyskeskus&ou=Tampere", TAMPERE_HEALTH_CENTRES],
		[
			"/fi/haku?quoi=hammaslääkäri&ou=Turku",
			"/fi/hammashoitolat/varsinais-suomen-hyvinvointialue/turku",
		],
		// From another market, in that market's words.
		[
			"/fr/recherche?quoi=dentiste&ou=Turku",
			"/fi/hammashoitolat/varsinais-suomen-hyvinvointialue/turku",
		],
	] as const) {
		const response = await request.get(from, { maxRedirects: 0 });
		expect(response.status(), from).toBe(307);
		const location = new URL(response.headers().location ?? "", "http://localhost");
		expect(decodeURI(location.pathname) + location.search, from).toBe(to);
	}
});

test("the sitemaps list Finland's pages under /sitemaps/fi", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/fi/");
	const pages = await (await request.get("/sitemaps/fi/praticiens-0.xml")).text();
	expect(pages).toContain(`${HOSPITAL}<`);
	expect(pages).toContain(`${DENTAL}<`);
	const listings = await (await request.get("/sitemaps/fi/listes-0.xml")).text();
	expect(listings).toContain(`${TAMPERE_HEALTH_CENTRES}<`);
	// Helsinki has no city URL of its own.
	expect(listings).not.toContain("/helsinki/helsinki<");
});
