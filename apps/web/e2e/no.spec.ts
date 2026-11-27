import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Norwegian market (/no) against the SYNTHETIC database seeded from packages/etl/fixtures/no
 * (`bun run etl:no --source-dir packages/etl/fixtures/no --offline`, which imports the places of
 * the same directory first): fictitious establishments of the Central Coordinating Register for
 * Legal Entities placed in Kartverket's counties and municipalities, never real data. An
 * establishment's key is its own organisation number, so the slugs below are stable.
 */

const HOSPITAL = "/no/virksomhet/eksempel-universitetssykehus-hf-avd-ulleval-910000004";
const MENTAL_HEALTH = "/no/virksomhet/eksempel-dps-dognenhet-910000020";
const GP_OFFICE = "/no/virksomhet/eksempel-legesenter-910000039";
const EMERGENCY = "/no/virksomhet/eksempel-interkommunale-legevakt-910000055";
const DENTAL = "/no/virksomhet/eksempel-tannklinikk-910000101";
const PHARMACY = "/no/virksomhet/apotek-1-eksempel-910000152";
const TROMSO_PHARMACY = "/no/virksomhet/eksempel-apotek-tromso-910000179";
const BERGEN_DENTAL = "/no/virksomhet/eksempel-tannlegesenter-910000195";
const OSLO_GP_OFFICES = "/no/legekontorer/oslo";

test.use({ locale: "nb-NO" });

const PAGES = [
	"/no",
	"/no/legekontorer",
	OSLO_GP_OFFICES,
	"/no/tannklinikker/akershus/ullensaker",
	"/no/apotek",
	"/no/apotek/troms/tromso",
	"/no/sykehjem/vestland/bergen",
	HOSPITAL,
	MENTAL_HEALTH,
	GP_OFFICE,
	EMERGENCY,
	DENTAL,
	PHARMACY,
	"/no/katalog",
	"/no/katalog/vestland",
	"/no/katalog/vestland/bergen",
	"/no/sok?quoi=apotek",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Norwegian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "nb-NO");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The register's credit (adapter `norway.registries`), word for word, as NLOD 2.0 § 5 asks. */
const REGISTER =
	"Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av Apercura";

test("a hospital's page: its organisation number, its registered industry, its owner, no booking", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	// The register writes the name in capitals: the page does not.
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Eksempel Universitetssykehus HF avd\. Ullevål/,
	);
	await expect(page.getByText("Organisasjonsnummer", { exact: true })).toBeVisible();
	await expect(page.getByText("910 000 004", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("86.101", { exact: true })).toBeVisible();
	await expect(page.getByText("Drives av", { exact: true })).toBeVisible();
	await expect(page.getByText("Eksempel Universitetssykehus HF", { exact: true })).toBeVisible();
	await expect(page.getByText(REGISTER).first()).toBeVisible();
	await expect(page.getByText(/© Kartverket/).first()).toBeVisible();
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
	expect(hospital.name).toBe("Eksempel Universitetssykehus HF avd. Ullevål");
	expect(hospital.identifier).toMatchObject({ propertyID: "NO-ORGNR", value: "910000004" });
	expect(hospital.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("nb-NO");
});

test("a GP office, an emergency clinic, a dental clinic and a pharmacy read as their kind", async ({
	page,
}) => {
	await page.goto(GP_OFFICE);
	await expect(page.getByText("Legekontor", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalClinic")).toBe(true);
	await page.goto(EMERGENCY);
	await expect(page.getByText("Legevakt", { exact: true }).first()).toBeVisible();
	await page.goto(MENTAL_HEALTH);
	await expect(
		page.getByText("Psykisk helsevern og rusbehandling", { exact: true }).first(),
	).toBeVisible();
	await page.goto(DENTAL);
	await expect(page.getByText("Tannklinikk", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
	await page.goto(PHARMACY);
	await expect(page.getByText("Apotek", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(REGISTER).first()).toBeVisible();
	// Its number, the Norwegian way.
	await expect(page.getByRole("link", { name: /22 12 34 56/ }).first()).toHaveAttribute(
		"href",
		/^tel:\+4722123456/,
	);
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("an address the cadastre does not know is placed at its postcode, without a map pin", async ({
	page,
}) => {
	const response = await page.goto(TROMSO_PHARMACY);
	expect(response?.status()).toBe(200);
	await expect(page.getByText(/9008 Tromsø|Tromsø/).first()).toBeVisible();
});

test("a care-of line never reaches a page", async ({ page }) => {
	await page.goto(BERGEN_DENTAL);
	await expect(page.getByText("Eksempelveien 11").first()).toBeVisible();
	await expect(page.getByText(/c\/o/i)).toHaveCount(0);
});

test("sole proprietorships, establishments named after a doctor and holding companies are never listed", async ({
	request,
}) => {
	for (const path of [
		"/no/virksomhet/ola-eksempel-910000217",
		"/no/virksomhet/lege-kari-eksempel-910000233",
		"/no/virksomhet/eksempel-holding-910000268",
	]) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
	// A wrong check digit never reaches the database.
	expect((await request.get("/no/virksomhet/eksempel-legesenter-910000038")).status()).toBe(404);
});

test("a county's listing lists its establishments, and Oslo has the county's page only", async ({
	page,
}) => {
	await page.goto(OSLO_GP_OFFICES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Oslo");
	await expect(page.getByRole("link", { name: /Eksempel Legesenter/ }).first()).toBeVisible();
	expect(await robotsOf(page)).toBe("index, follow");
	// Oslo is a county and its only municipality: the municipality's page is the county's.
	const response = await page.goto("/no/legekontorer/oslo/oslo");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/no\/legekontorer\/oslo$/);
});

test("the home is Norway's, in Norwegian, with Norwegian samples", async ({ page }) => {
	await page.goto("/no");
	await expect(page.locator("html")).toHaveAttribute("lang", "nb-NO");
	await expect(page.locator("main h1")).toContainText("Norge");
	await expect(page.getByText(/Eksempel/).first()).toBeVisible();
	await expect(page.getByText(/Enhetsregisteret/).first()).toBeVisible();
	// One language: no language menu, the country menu stays.
	await expect(page.getByRole("navigation", { name: "Språk" })).toHaveCount(0);
	await expect(page.getByRole("navigation", { name: "Land" })).toBeVisible();
});

test("a search for a Norwegian place and kind lands on its listing", async ({ request }) => {
	for (const [from, to] of [
		["/no/sok?quoi=tannlege&ou=Ullensaker", "/no/tannklinikker/akershus/ullensaker"],
		["/no/sok?quoi=fastlege&ou=Oslo", "/no/legekontorer/oslo"],
		// From another market, in that market's words.
		["/fr/recherche?quoi=pharmacie&ou=Troms%C3%B8", "/no/apotek/troms/tromso"],
	] as const) {
		const response = await request.get(from, { maxRedirects: 0 });
		expect(response.status(), from).toBe(307);
		const location = new URL(response.headers().location ?? "", "http://localhost");
		expect(location.pathname + location.search, from).toBe(to);
	}
});

test("the sitemaps list Norway's pages under /sitemaps/no", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/no/");
	const pages = await (await request.get("/sitemaps/no/praticiens-0.xml")).text();
	expect(pages).toContain(`${HOSPITAL}<`);
	expect(pages).toContain(`${PHARMACY}<`);
	const listings = await (await request.get("/sitemaps/no/listes-0.xml")).text();
	expect(listings).toContain(`${OSLO_GP_OFFICES}<`);
	// Oslo, a municipality that is its county, has no URL of its own.
	expect(listings).not.toContain("/oslo/oslo<");
});
