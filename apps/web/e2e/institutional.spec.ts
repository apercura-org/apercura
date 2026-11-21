import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/** The institutional pages, in French (no prefix) and English (`/en`, localized paths). */
const PAGES = [
	["/a-propos", "/en/about"],
	["/open-source", "/en/open-source"],
	["/donnees", "/en/data"],
	["/accessibilite", "/en/accessibility"],
	["/confidentialite", "/en/privacy"],
	["/mentions-legales", "/en/legal-notice"],
	["/conditions", "/en/terms"],
] as const;

for (const path of PAGES.flat()) {
	test(`${path} answers 200 with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("English institutional pages are noindex, French ones are indexable", async ({ page }) => {
	await page.goto("/en/about");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	// Visiting /en stores the locale cookie, which would send /a-propos to /en/about.
	await page.context().clearCookies();
	await page.goto("/a-propos");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index/);
});

test("/donnees explains how to correct and how to object to a page", async ({ page }) => {
	await page.goto("/donnees");
	await expect(page.locator("#corriger")).toBeVisible();
	await expect(page.locator("#retrait")).toBeVisible();
	await page.goto("/donnees#corriger");
	await expect(page.locator("#corriger h2")).toBeInViewport();
});

test("legal pages mark what is still to be completed", async ({ page }) => {
	await page.goto("/mentions-legales");
	await expect(page.getByText("À compléter").first()).toBeVisible();
	await page.goto("/en/legal-notice");
	await expect(page.getByText("To be completed").first()).toBeVisible();
});

test("the footer links to every institutional page", async ({ page }) => {
	await page.goto("/");
	const footer = page.getByRole("navigation", { name: "À propos d’Apercura" });
	for (const [path] of PAGES) {
		await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
	}
	await expect(footer.locator('a[href="/annuaire"]')).toHaveCount(1);
});
