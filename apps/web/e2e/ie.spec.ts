import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Irish market (/ie, in English) against the SYNTHETIC database seeded from
 * packages/etl/fixtures/ie (`bun run etl:ie --source-dir packages/etl/fixtures/ie --offline`):
 * fictitious pharmacies of the PSI's register, nursing homes of HIQA's register, hospitals and
 * health centres of the HSE's Health Atlas, placed in Tailte Éireann's counties and the CSO's
 * towns, never real data. A facility's page is found from its listing, so the spec reads
 * whatever the fixtures name it.
 */

/** Listing pages: Ireland, a county, a town. */
const LISTINGS = [
	"/ie/pharmacy",
	"/ie/pharmacy/cork",
	"/ie/pharmacy/cork/cork",
	"/ie/nursing-homes",
	"/ie/hospitals",
	"/ie/health-centres",
];

/** Other markets' facts, which an Irish page never prints. */
const FOREIGN = ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "ODS code"];

/** Words of the people the lists name and the pages never print. */
const PEOPLE = ["Superintendent", "superintendent pharmacist", "Person in charge"];

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The first facility page a town's listing links to. */
async function firstFacility(page: Page, listing: string): Promise<string> {
	await page.goto(listing);
	const href = await page.locator('main a[href^="/ie/facility/"]').first().getAttribute("href");
	expect(href, listing).toBeTruthy();
	return href ?? "";
}

for (const path of [
	"/ie",
	"/ie/directory",
	"/ie/directory/cork",
	...LISTINGS,
	"/ie/search?quoi=Example",
]) {
	test(`${path} answers 200 in English with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en-IE");
		await expect(page.locator("main h1")).toBeVisible();
		const text = (await page.locator("main").textContent()) ?? "";
		for (const foreign of FOREIGN) expect(text, foreign).not.toContain(foreign);
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the Irish home lists the kinds of facility and the counties, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/ie");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Ireland");
	await expect(page.getByRole("link", { name: /^Pharmacies/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^County Cork/ }).first()).toBeVisible();
	// The specimen and the stamps are obviously fictional, and carry no Eircode.
	await expect(page.getByText("Example Pharmacy", { exact: true }).first()).toBeVisible();
	const hreflangs = await page
		.locator('link[rel="alternate"][hreflang]')
		.evaluateAll((links) => links.map((link) => link.getAttribute("hreflang")));
	expect(hreflangs).toContain("en-IE");
	expect(hreflangs).toContain("en-GB");
	expect(hreflangs).toContain("x-default");
	// One language: no language menu.
	await expect(page.getByRole("navigation", { name: "Language" })).toHaveCount(0);
});

test("Ireland lists by county and by town, its pharmacies under the singular slug", async ({
	page,
}) => {
	await page.goto("/ie/pharmacy");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pharmacies in Ireland");
	await expect(page.getByRole("link", { name: /^County Cork/ }).first()).toBeVisible();
	await page.goto("/ie/pharmacy/cork");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("County Cork");
	await page.goto("/ie/pharmacy/cork/cork");
	await expect(page.locator('main a[href^="/ie/facility/"]').first()).toBeVisible();
	expect(await robotsOf(page)).toMatch(/follow$/);
	// No province listing, and the UK's slug is the UK's.
	expect((await page.goto("/ie/pharmacy/munster"))?.status()).toBe(404);
	expect((await page.goto("/ie/pharmacies"))?.status()).toBe(404);
	expect((await page.goto("/gb/pharmacy"))?.status()).toBe(404);
	expect((await page.goto("/fr/nursing-homes"))?.status()).toBe(404);
});

test("a pharmacy's page: its PSI key and credits, no person, no booking, as a Pharmacy", async ({
	page,
}) => {
	const path = await firstFacility(page, "/ie/pharmacy/cork/cork");
	expect(path).toMatch(/^\/ie\/facility\/[a-z0-9-]+-p\d+$/);
	const response = await page.goto(path);
	expect(response?.status()).toBe(200);
	const key = path.split("-").at(-1) ?? "";
	await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
	await expect(
		page
			.getByText(
				"Source: Pharmaceutical Society of Ireland, Register of Pharmacies. © Pharmaceutical Society of Ireland.",
				{ exact: false },
			)
			.first(),
	).toBeVisible();
	await expect(page.getByText(/© Tailte Éireann, Counties/).first()).toBeVisible();
	await expect(page.getByText(/Census 2022 Built Up Areas/).first()).toBeVisible();
	await expect(page.locator("[data-atlas-note]")).toHaveCount(0);
	const text = (await page.locator("body").textContent()) ?? "";
	for (const word of [...FOREIGN, ...PEOPLE]) expect(text, word).not.toContain(word);
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
	const data = await graphOf(page);
	const pharmacy = data.find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "IE-PSI" });
	expect(pharmacy.address).toMatchObject({ addressCountry: "IE" });
	// City precision: the town's point is not published as the pharmacy's.
	expect(pharmacy.geo).toBeUndefined();
	expect(pharmacy.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	expect(data.find((item) => item["@type"] === "WebPage")?.inLanguage).toBe("en-IE");
	expect(await axeViolations(page)).toEqual([]);
});

test("a nursing home's page: its places, who runs it, HIQA's reports, as a MedicalOrganization", async ({
	page,
}) => {
	// n901: a company runs it, 63 places, a page on HIQA's website (synthetic fixture).
	const response = await page.goto("/ie/facility/any-name-n901");
	expect(new URL(response?.url() ?? "").pathname).toMatch(/^\/ie\/facility\/[a-z0-9-]+-n901$/);
	await expect(
		page.getByText(/Source: Health Information and Quality Authority/).first(),
	).toBeVisible();
	await expect(page.getByText("Places for residents", { exact: true })).toBeVisible();
	await expect(page.getByText("63", { exact: true })).toBeVisible();
	await expect(page.getByText("Run by", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("link", { name: /Inspection reports on HIQA's website/ }),
	).toHaveAttribute("href", /^https:\/\/www\.hiqa\.ie\/areas-we-work\/find-a-centre\//);
	const text = (await page.locator("body").textContent()) ?? "";
	for (const word of PEOPLE) expect(text, word).not.toContain(word);
	const data = await graphOf(page);
	const home = data.find((item) => item["@type"] === "MedicalOrganization");
	expect(home.identifier).toMatchObject({ propertyID: "IE-HIQA" });
	expect(home.geo).toBeUndefined();
	expect(await axeViolations(page)).toEqual([]);
});

test("a nursing home run by an individual names no operator; one run by the HSE says so", async ({
	page,
}) => {
	await page.goto("/ie/facility/any-name-n902");
	await expect(page.getByText("Run by", { exact: true })).toHaveCount(0);
	await page.goto("/ie/facility/any-name-n907");
	await expect(page.getByText("Health Service Executive (HSE)", { exact: true })).toBeVisible();
	// A nursing home placed in its county only (n903): no town, no map.
	expect((await page.goto("/ie/facility/any-name-n903"))?.status()).toBe(200);
});

test("a hospital's page: its kind, the March 2020 note, the HSE's credit, as a Hospital", async ({
	page,
}) => {
	const path = await firstFacility(page, "/ie/hospitals/dublin/dublin");
	expect(path).toMatch(/-h\d{9}$/);
	await page.goto(path);
	await expect(page.getByText("Kind of hospital", { exact: true })).toBeVisible();
	await expect(page.locator("[data-atlas-note]")).toHaveText(
		/^As recorded by the HSE's Health Atlas in March 2020/,
	);
	await expect(
		page.getByText(/Hospitals – HSE Ireland \(March 2020\), via GeoHive, CC BY 4\.0\./).first(),
	).toBeVisible();
	const data = await graphOf(page);
	expect(data.find((item) => item["@type"] === "Hospital")?.identifier).toMatchObject({
		propertyID: "IE-HSE-HOSP",
	});
	expect(await axeViolations(page)).toEqual([]);
});

test("a health centre's page: the March 2020 note and the HSE's credit, as a MedicalClinic", async ({
	page,
}) => {
	const path = await firstFacility(page, "/ie/health-centres/dublin/dublin");
	expect(path).toMatch(/-c\d{9}$/);
	await page.goto(path);
	await expect(page.locator("[data-atlas-note]")).toContainText("March 2020");
	await expect(
		page.getByText(/Health Centres – HSE Ireland \(March 2020\), via GeoHive/).first(),
	).toBeVisible();
	const data = await graphOf(page);
	expect(data.find((item) => item["@type"] === "MedicalClinic")?.identifier).toMatchObject({
		propertyID: "IE-HSE-HC",
	});
	expect(await axeViolations(page)).toEqual([]);
});

test("a wrong name part redirects to the canonical slug; another market's key is no page", async ({
	page,
}) => {
	const path = await firstFacility(page, "/ie/pharmacy/cork/cork");
	const key = path.split("-").at(-1) ?? "";
	const response = await page.goto(`/ie/facility/wrong-name-${key}`);
	expect(new URL(response?.url() ?? "").pathname).toBe(path);
	expect((await page.goto("/ie/facility/nothing-x1"))?.status()).toBe(404);
	expect((await page.goto("/ie/facility/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto(`/gb/practice/${path.split("/").at(-1)}`))?.status()).toBe(404);
});

test("a search names Irish pages: pharmacy in Cork, Dublin, Ireland, and no GP", async ({
	page,
}) => {
	await page.goto("/ie/search?quoi=pharmacy&ou=Cork");
	await expect(page).toHaveURL(/\/ie\/pharmacy\/cork\/cork$/);
	await page.goto("/gb/search?quoi=pharmacy&ou=Cork");
	await expect(page).toHaveURL(/\/ie\/pharmacy\/cork\/cork$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en-IE");
	await page.goto("/fr/recherche?ou=Dublin");
	await expect(page).toHaveURL(/\/ie\//);
	await expect(page.locator("html")).toHaveAttribute("lang", "en-IE");
	await page.goto("/fr/recherche?ou=Irlande");
	await expect(page).toHaveURL(/\/ie$/);
	// Ireland is open: never "not covered".
	await expect(page.getByText(/does not cover Ireland|ne couvre pas encore l’Irlande/)).toHaveCount(
		0,
	);
	await page.goto("/ie/search?quoi=GP");
	await expect(page.getByText(/not doctors or other clinicians/).first()).toBeVisible();
});
