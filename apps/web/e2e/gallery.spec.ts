import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

test.describe.configure({ timeout: 180_000 });

for (const path of ["/fr/_ui", "/fr-en/_ui"]) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("slot picker: arrows move, Enter stamps the slot and announces it", async ({ page }) => {
	await page.goto("/fr-en/_ui");
	const grid = page.getByRole("grid", { name: "Available times" }).first();
	await grid.locator('[role="gridcell"][tabindex="0"]').focus();
	const focused = grid.locator('[role="gridcell"]:focus');
	// Move down to the last day, then right until the focused slot can be booked.
	await page.keyboard.press("PageDown");
	for (let step = 0; step < 6 && (await focused.getAttribute("aria-disabled")) === "true"; step++) {
		await page.keyboard.press("ArrowRight");
	}
	await expect(focused).not.toHaveAttribute("aria-disabled", "true");
	await expect(focused).toHaveAttribute("aria-selected", "false");
	const label = await focused.getAttribute("aria-label");
	await page.keyboard.press("Enter");
	await expect(focused).toHaveAttribute("aria-selected", "true");
	await expect(grid.locator('[aria-selected="true"]')).toHaveCount(1);
	await expect(page.getByText(`Selected: ${label}`)).toBeAttached();
});

test("slot picker: past and closed slots cannot be stamped", async ({ page }) => {
	await page.goto("/fr-en/_ui");
	const grid = page.getByRole("grid", { name: "Available times" }).first();
	const closed = grid.locator('[role="gridcell"][aria-disabled="true"]').first();
	// Playwright waits for aria-disabled elements to become enabled; force the click through.
	await closed.click({ force: true });
	await expect(closed).toHaveAttribute("aria-selected", "false");
});

test("listing pager: the jumps of a long listing reach any page in three clicks", async ({
	page,
}) => {
	await page.goto("/fr/_ui");
	const pager = page.getByRole("navigation", { name: "Pages de la liste" });
	await expect(pager.locator('[aria-current="page"]')).toHaveText("Page 187");
	const jumps = pager.getByRole("list", { name: "Aller à la page" });
	const names = await jumps.getByRole("link").allTextContents();
	expect(names).toEqual([
		"Page 1",
		...[100, 110, 120, 130, 140, 150, 160, 170, 190, 200].map((n) => `Page ${n}`),
		"Page 219",
	]);
	await expect(jumps.getByRole("link", { name: "Page 1", exact: true })).toHaveAttribute(
		"href",
		"/fr/medecin-generaliste/75-paris",
	);
	await expect(jumps.getByRole("link", { name: "Page 219" })).toHaveAttribute(
		"href",
		"/fr/medecin-generaliste/75-paris/219",
	);
	// The block of ten around the current page, before the jumps.
	await expect(pager.getByRole("link", { name: /^Page 18\d$/ })).toHaveCount(9);
});
