import { pagerDepthBound } from "@apercura/core";
import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The pager of the listings (#112): every page of a listing, and so every
 * practitioner it lists, a few clicks from its first page, through indexable
 * pages only, with plain links. Against the SYNTHETIC fixtures, where the Paris
 * generalists fill 9 pages; the jumps of longer listings are checked on the
 * component gallery (gallery.spec.ts) and the depth bound for every size in
 * packages/core/src/pagination.test.ts.
 */

const LANDING = "/fr/medecin-generaliste/75-paris";
const PRACTITIONER_LINK = /^\/fr\/praticien\/[a-z0-9-]+-\d{11}$/;

const pagerOf = (page: Page) => page.getByRole("navigation", { name: "Pages de la liste" });

/** Number of pages, from the pager's "Page 1 sur 9". */
async function pageCountOf(page: Page): Promise<number> {
	const status = await pagerOf(page)
		.getByText(/^Page \d+ sur \d+$/)
		.textContent();
	return Number(/sur (\d+)$/.exec(status ?? "")?.[1]);
}

test("the pager names the current page and every page of its block of ten", async ({ page }) => {
	await page.goto(`${LANDING}/2`);
	const pager = pagerOf(page);
	const pages = await pageCountOf(page);
	expect(pages).toBeGreaterThan(2);
	const current = pager.locator('[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toHaveText("Page 2");
	await expect(pager.getByRole("link", { name: "Page 1", exact: true })).toHaveAttribute(
		"href",
		LANDING,
	);
	await expect(pager.getByRole("link", { name: `Page ${pages}`, exact: true })).toHaveAttribute(
		"href",
		`${LANDING}/${pages}`,
	);
	await expect(pager.getByRole("link", { name: "Page 2", exact: true })).toHaveCount(0);
	await expect(pager.getByRole("link", { name: "Page précédente" })).toHaveAttribute("rel", "prev");
	await expect(pager.getByRole("link", { name: "Page suivante" })).toHaveAttribute("rel", "next");

	// 44 px targets (WCAG 2.5.8 asks 24; the design system 44).
	for (const link of await pager.getByRole("link").all()) {
		const box = await link.boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(44);
		expect(box?.height).toBeGreaterThanOrEqual(44);
	}
	expect(await axeViolations(page)).toEqual([]);
});

test("pages 2+ are indexable, each its own canonical, with its own description", async ({
	page,
}) => {
	await page.goto(`${LANDING}/2`);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		new RegExp(`${LANDING}/2$`),
	);
	const description = await page.locator('meta[name="description"]').getAttribute("content");
	expect(description).toMatch(/^Page 2 sur \d+/);
	await page.goto(`${LANDING}/3`);
	expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toBe(
		description,
	);
});

test("every page and every practitioner of a listing is a few clicks from its first page, through indexable pages", async ({
	page,
}) => {
	await page.goto(LANDING);
	const pages = await pageCountOf(page);
	const bound = pagerDepthBound(pages);

	const depth = new Map<string, number>([[LANDING, 0]]);
	const practitioners = new Map<string, number>();
	const queue = [LANDING];
	for (let head = 0; head < queue.length; head++) {
		const path = queue[head] as string;
		const clicks = depth.get(path) as number;
		await page.goto(path);
		// A crawler that stops following the links of noindex pages still gets here.
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
		for (const href of await page
			.locator("main table a[href]")
			.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
			if (PRACTITIONER_LINK.test(href) && !practitioners.has(href)) {
				practitioners.set(href, clicks + 1);
			}
		}
		for (const href of await pagerOf(page)
			.getByRole("link")
			.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
			if (!depth.has(href)) {
				depth.set(href, clicks + 1);
				queue.push(href);
			}
		}
	}

	const expected = [LANDING, ...Array.from({ length: pages - 1 }, (_, i) => `${LANDING}/${i + 2}`)];
	expect([...depth.keys()].sort()).toEqual(expected.sort());
	expect(Math.max(...depth.values())).toBeLessThanOrEqual(bound);
	// Twenty per page, each practitioner on one page only.
	expect(practitioners.size).toBeGreaterThan(20 * (pages - 1));
	expect(Math.max(...practitioners.values())).toBeLessThanOrEqual(bound + 1);
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the pager's links still lead to their page", async ({ page }) => {
		await page.goto(LANDING);
		const pages = await pageCountOf(page);
		await pagerOf(page)
			.getByRole("link", { name: `Page ${pages}`, exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`${LANDING}/${pages}$`));
		await expect(pagerOf(page).locator('[aria-current="page"]')).toHaveText(`Page ${pages}`);
		await pagerOf(page).getByRole("link", { name: "Page précédente" }).click();
		await expect(page).toHaveURL(new RegExp(`${LANDING}/${pages - 1}$`));
	});
});
