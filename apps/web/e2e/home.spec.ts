import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/**
 * One home for every market (#163): France and its interface translations, then each market in
 * each of its languages print the same sections, in the same order, from the synthetic fixtures.
 */
const HOMES = [
	"/fr",
	"/fr-en",
	"/fr-de",
	"/fr-es",
	"/fr-it",
	"/at",
	"/gb",
	"/cz",
	"/es",
	"/it",
	"/de",
	"/ch",
	"/ch-fr",
	"/ch-it",
	"/ee",
	"/pl",
	"/no",
];

/** The opening's title, then the sections' headings in order. */
const SECTIONS = [
	"specimen-heading",
	"listings-heading",
	"places-heading",
	"pillars-heading",
	"registry-heading",
	"pro-heading",
];

for (const path of HOMES) {
	test(`${path} prints the home's sections in order, with no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("main h2")).toHaveCount(SECTIONS.length);
		expect(
			await page.locator("main h2").evaluateAll((items) => items.map((item) => item.id)),
		).toEqual(SECTIONS);
		// The opening's sample stamps, one per state of a page, and the specimen page below.
		await expect(page.locator('ul[aria-labelledby="sample-stamps"] > li')).toHaveCount(3);
		await expect(page.locator('section[aria-labelledby="specimen-heading"] article')).toHaveCount(
			1,
		);
		// Four commitments everywhere, none naming a hosting regime or place.
		await expect(page.locator('section[aria-labelledby="pillars-heading"] li')).toHaveCount(4);
		await expect(page.locator('section[aria-labelledby="pillars-heading"]')).not.toContainText(
			"HDS",
		);
		// Live figures with their source and date.
		await expect(page.locator('section[aria-labelledby="registry-heading"] time')).toHaveCount(1);
		expect(await axeViolations(page)).toEqual([]);
	});
}
