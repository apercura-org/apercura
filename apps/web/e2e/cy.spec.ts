import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Cypriot market (/cy) against the SYNTHETIC database seeded from packages/etl/fixtures/cy
 * (`bun run etl:cy --source-dir packages/etl/fixtures/cy --offline`, which imports the places of
 * the same directory first): fictitious facilities of the Ministry of Health's lists placed in
 * the districts and the municipalities and communities of the 2021 census, never real data. A
 * pharmacy's key is its registration number in the list, so its slug below is stable; a state
 * hospital's or health centre's key is derived by the import, so their pages are reached through
 * their listing.
 */

const PHARMACY = "/cy/monada/farmakeio-odos-paradeigmatos-12-lefkosia-f101";
const STROVOLOS_PHARMACY = "/cy/monada/farmakeio-leof-ypodeigmatos-5-kat-2-strovolos-f102";
const MOBILE_PHARMACY = "/cy/monada/farmakeio-odos-ypodeigmatos-9-pafos-f107";
const LEFKOSIA_PHARMACIES = "/cy/farmakeia/eparchia-lefkosias";
const STROVOLOS_PHARMACIES = "/cy/farmakeia/eparchia-lefkosias/strovolos";

test.use({ locale: "el-CY" });

const PAGES = [
	"/cy",
	"/cy/farmakeia",
	LEFKOSIA_PHARMACIES,
	STROVOLOS_PHARMACIES,
	"/cy/nosokomeia",
	"/cy/kentra-ygeias",
	PHARMACY,
	STROVOLOS_PHARMACY,
	"/cy/katalogos",
	"/cy/katalogos/eparchia-lefkosias",
	`/cy/anazitisi?quoi=${encodeURIComponent("φαρμακείο")}`,
];

for (const path of PAGES) {
	test(`${path} answers 200 in Greek with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "el-CY");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The pharmacies' list's credit (adapter `cyprus.registries`), word for word, as CC BY 4.0 asks. */
const PHARMACIES_CREDIT =
	"Κατάλογος Ιδιωτικών Φαρμακείων: Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura";
const HOSPITALS_CREDIT =
	"Κατάλογος Κρατικών Νοσοκομείων Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura";
const HEALTH_CENTRES_CREDIT =
	"Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura";

/** What the pharmacy list's fixture writes in its pharmacist and home telephone columns. */
const NEVER_READ = ["Δοκιμαστής", "Δοκιμή", "99000001"];

test("a pharmacy's page: named after its address, its registration number, its phone, no booking", async ({
	page,
}) => {
	await page.goto(PHARMACY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Φαρμακείο, Οδός Παραδείγματος 12, Λευκωσία/,
	);
	await expect(page.getByText("Φαρμακείο", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Αριθμός μητρώου (ΑΜ)", { exact: true })).toBeVisible();
	await expect(page.getByText("101", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/1010 Λευκωσία/).first()).toBeVisible();
	// Its number, the Cypriot way.
	await expect(page.getByRole("link", { name: /22 000101/ }).first()).toHaveAttribute(
		"href",
		/^tel:\+35722000101/,
	);
	await expect(page.getByText(PHARMACIES_CREDIT).first()).toBeVisible();
	await expect(page.getByText(/Τμήμα Ταχυδρομικών Υπηρεσιών/).first()).toBeVisible();
	await expect(page.getByText(/Στατιστική Υπηρεσία Κύπρου/).first()).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
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
	expect(pharmacy.name).toBe("Φαρμακείο, Οδός Παραδείγματος 12, Λευκωσία");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "CY-FARM", value: "101" });
	expect(pharmacy.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("el-CY");
});

test("the pharmacist each pharmacy is listed under, and their home number, never reach a page", async ({
	request,
}) => {
	for (const path of [
		PHARMACY,
		STROVOLOS_PHARMACY,
		MOBILE_PHARMACY,
		LEFKOSIA_PHARMACIES,
		"/cy/farmakeia",
	]) {
		const html = await (await request.get(path)).text();
		for (const word of NEVER_READ) expect(html, `${path} ${word}`).not.toContain(word);
	}
});

test("a mobile number in the pharmacies' list is never shown", async ({ page }) => {
	const response = await page.goto(MOBILE_PHARMACY);
	expect(response?.status()).toBe(200);
	await expect(page.getByText(/8010 Πάφος/).first()).toBeVisible();
	await expect(page.locator('main a[href^="tel:"]')).toHaveCount(0);
});

test("a pharmacy listed twice at one address is one page, an unplaced one none", async ({
	request,
}) => {
	// f106 shares f101's address; f108 names a place no census counted.
	for (const path of ["/cy/monada/farmakeio-f106", "/cy/monada/farmakeio-f108"]) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
	// A key without its publisher's letter never reaches the database.
	expect((await request.get("/cy/monada/farmakeio-101")).status()).toBe(404);
});

test("a state hospital and a health centre read as their kind, run by the state", async ({
	page,
}) => {
	await page.goto("/cy/nosokomeia/eparchia-lefkosias");
	await page
		.getByRole("link", { name: /Γενικό Νοσοκομείο Παραδείγματος/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/cy\/monada\/geniko-nosokomeio-paradeigmatos-m[0-9a-f]{10}$/);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Γενικό Νοσοκομείο Παραδείγματος/,
	);
	await expect(page.getByText("Νοσοκομείο", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Φορέας", { exact: true })).toBeVisible();
	await expect(page.getByText(/2029 Στρόβολος/).first()).toBeVisible();
	await expect(page.getByText(HOSPITALS_CREDIT).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);

	await page.goto("/cy/kentra-ygeias/eparchia-lefkosias");
	await page
		.getByRole("link", { name: /Κέντρο Υγείας Παραδείγματος Στροβόλου/ })
		.first()
		.click();
	await expect(page).toHaveURL(
		/\/cy\/monada\/kentro-ygeias-paradeigmatos-strovolou-m[0-9a-f]{10}$/,
	);
	await expect(page.getByText("Κέντρο Υγείας", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(HEALTH_CENTRES_CREDIT).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /22 000301/ }).first()).toHaveAttribute(
		"href",
		/^tel:\+35722000301/,
	);
	expect((await graphOf(page)).some((item) => item["@type"] === "MedicalClinic")).toBe(true);
});

test("a district's listing lists its pharmacies, and a community's its own", async ({ page }) => {
	await page.goto(LEFKOSIA_PHARMACIES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Λευκωσίας");
	await expect(page.getByRole("link", { name: /Οδός Παραδείγματος 12/ }).first()).toBeVisible();
	await page.goto(STROVOLOS_PHARMACIES);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Στρόβολος");
	await expect(page.getByRole("link", { name: /Λεωφ\. Υποδείγματος 5/ }).first()).toBeVisible();
});

test("the home is Cyprus's, in Greek, with Greek samples", async ({ page }) => {
	await page.goto("/cy");
	await expect(page.locator("html")).toHaveAttribute("lang", "el-CY");
	await expect(page.getByText(/Παραδείγματος/).first()).toBeVisible();
	await expect(page.getByText(/Φαρμακευτικές Υπηρεσίες/).first()).toBeVisible();
});

test("a search for a Cypriot place and kind lands on its listing", async ({ request }) => {
	for (const [from, to] of [
		[
			`/cy/anazitisi?quoi=${encodeURIComponent("φαρμακείο")}&ou=${encodeURIComponent("Στρόβολος")}`,
			STROVOLOS_PHARMACIES,
		],
		// A place typed in Latin letters, as many keyboards do.
		[
			`/cy/anazitisi?quoi=${encodeURIComponent("νοσοκομείο")}&ou=Lemesos`,
			"/cy/nosokomeia/eparchia-lemesou/lemesos",
		],
		// From another market, in that market's words.
		["/fr/recherche?quoi=pharmacie&ou=Limassol", "/cy/farmakeia/eparchia-lemesou/lemesos"],
	] as const) {
		const response = await request.get(from, { maxRedirects: 0 });
		expect(response.status(), from).toBe(307);
		const location = new URL(response.headers().location ?? "", "http://localhost");
		expect(decodeURIComponent(location.pathname + location.search), from).toBe(to);
	}
});

test("the sitemaps list Cyprus's pages under /sitemaps/cy", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/cy/");
	const pages = await (await request.get("/sitemaps/cy/praticiens-0.xml")).text();
	expect(pages).toContain(`${PHARMACY}<`);
});
