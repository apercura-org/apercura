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
