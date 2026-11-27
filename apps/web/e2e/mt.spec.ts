import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Maltese market (/mt, in English) against the SYNTHETIC database seeded from
 * packages/etl/fixtures/mt (`bun run etl:places --country mt --source-dir packages/etl/fixtures/mt`,
 * then `bun run etl:mt --source-dir packages/etl/fixtures/mt --offline`): fictitious community
 * pharmacies of the Medicines Authority's register (`Example Valletta Pharmacy`, licence
 * `DL 901`), placed in the NSO's localities by made-up rectangular boundaries, never real data.
 */

/** Listing pages: Malta, a district, a locality. */
const LISTINGS = [
	"/mt/community-pharmacies",
	"/mt/community-pharmacies/southern-harbour",
	"/mt/community-pharmacies/southern-harbour/valletta",
	"/mt/community-pharmacies/gozo-and-comino",
];

/** Other markets' facts, which a Maltese page never prints. */
const FOREIGN = ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "ODS code", "HSE"];

/** Words of the people a register could name and the pages never print. */
const PEOPLE = ["Pharmacist in charge", "Superintendent"];

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** A synthetic pharmacy in Valletta (fixtures: `DL 901`). */
const VALLETTA = "/mt/facility/example-valletta-pharmacy-dl901";

for (const path of [
	"/mt",
	"/mt/directory",
	"/mt/directory/southern-harbour",
	...LISTINGS,
	"/mt/search?quoi=Example",
]) {
	test(`${path} answers 200 in English with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en-MT");
		await expect(page.locator("main h1")).toBeVisible();
		const text = (await page.locator("main").textContent()) ?? "";
		for (const foreign of FOREIGN) expect(text, foreign).not.toContain(foreign);
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the Maltese home lists the pharmacies and the districts, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/mt");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Malta");
	await expect(page.getByRole("link", { name: /^Community pharmacies/ }).first()).toBeVisible();
	// The specimen and the stamps are obviously fictional.
	await expect(page.getByText("Example Pharmacy", { exact: true }).first()).toBeVisible();
	const hreflangs = await page
		.locator('link[rel="alternate"][hreflang]')
		.evaluateAll((links) => links.map((link) => link.getAttribute("hreflang")));
	expect(hreflangs).toContain("en-MT");
	expect(hreflangs).toContain("en-IE");
	expect(hreflangs).toContain("x-default");
	// One language: no language menu.
	await expect(page.getByRole("navigation", { name: "Language" })).toHaveCount(0);
});

test("Malta lists by district and by locality, under a slug no other English market uses", async ({
	page,
}) => {
	await page.goto("/mt/community-pharmacies");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Malta");
	await page.goto("/mt/community-pharmacies/southern-harbour");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Southern Harbour");
	await page.goto("/mt/community-pharmacies/southern-harbour/valletta");
	await expect(page.locator('main a[href^="/mt/facility/"]').first()).toBeVisible();
	expect(await robotsOf(page)).toMatch(/follow$/);
	// No region listing, and the UK's and Ireland's slugs are theirs.
	expect((await page.goto("/mt/community-pharmacies/malta"))?.status()).toBe(404);
	expect((await page.goto("/mt/pharmacies"))?.status()).toBe(404);
	expect((await page.goto("/mt/pharmacy"))?.status()).toBe(404);
	expect((await page.goto("/ie/community-pharmacies"))?.status()).toBe(404);
});

test("a pharmacy's page: its licence, its credits, its point, no person, no booking, as a Pharmacy", async ({
	page,
}) => {
	const response = await page.goto(VALLETTA);
	expect(response?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Example Valletta Pharmacy");
	await expect(page.getByText("DL 901", { exact: false }).first()).toBeVisible();
	await expect(
		page
			.getByText(
				"Source: Medicines Authority, Licensed Pharmacies in Malta and Gozo (data.gov.mt), CC BY 4.0.",
				{ exact: false },
			)
			.first(),
	).toBeVisible();
	await expect(
		page.getByText(/Planning Authority, Local Councils Units and Boundaries/).first(),
	).toBeVisible();
	const text = (await page.locator("body").textContent()) ?? "";
	for (const word of [...FOREIGN, ...PEOPLE]) expect(text, word).not.toContain(word);
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
	const data = await graphOf(page);
	const pharmacy = data.find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "MT-MA" });
	expect(pharmacy.address).toMatchObject({ addressCountry: "MT" });
	// Address precision: the register's point is the pharmacy's.
	expect(pharmacy.geo).toBeTruthy();
	expect(pharmacy.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	expect(data.find((item) => item["@type"] === "WebPage")?.inLanguage).toBe("en-MT");
	expect(await axeViolations(page)).toEqual([]);
});

test("a wrong name part redirects to the canonical slug; another market's key is no page", async ({
	page,
}) => {
	const response = await page.goto("/mt/facility/wrong-name-dl901");
	expect(new URL(response?.url() ?? "").pathname).toBe(VALLETTA);
	expect((await page.goto("/mt/facility/nothing-dl1"))?.status()).toBe(404);
	expect((await page.goto("/mt/facility/example-pharmacy-p10000612"))?.status()).toBe(404);
	expect((await page.goto("/ie/facility/example-valletta-pharmacy-dl901"))?.status()).toBe(404);
});

test("a search names Maltese pages: pharmacy in Valletta, Sliema, Malta, and no doctor", async ({
	page,
}) => {
	await page.goto("/mt/search?quoi=pharmacy&ou=Valletta");
	await expect(page).toHaveURL(/\/mt\/community-pharmacies\/southern-harbour\/valletta$/);
	await page.goto("/gb/search?quoi=chemist&ou=Sliema");
	await expect(page).toHaveURL(/\/mt\/community-pharmacies\/northern-harbour\/sliema$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en-MT");
	await page.goto("/fr/recherche?quoi=pharmacie&ou=Valletta");
	await expect(page).toHaveURL(/\/mt\//);
	await page.goto("/fr/recherche?ou=Malte");
	await expect(page).toHaveURL(/\/mt$/);
	// Malta is open: never "not covered".
	await expect(page.getByText(/does not cover Malta|ne couvre pas encore Malte/)).toHaveCount(0);
});
