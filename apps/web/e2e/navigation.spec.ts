import { expect, type Page, test } from "@playwright/test";

/**
 * State that must survive client-side navigation: the skip link target once
 * the previous route stays mounted (hidden) by Cache Components, and the query
 * and fragment of a page across a language switch.
 */

const languages = (page: Page, label: "Langue" | "Language") =>
	page.getByRole("navigation", { name: label });

test("after a client-side navigation, the skip link focuses the visible main region", async ({
	page,
}) => {
	await page.goto("/fr");
	// Marks the document: a full page load would drop it.
	await page.evaluate(() => {
		(window as Window & { softNavigation?: boolean }).softNavigation = true;
	});
	await page
		.getByRole("navigation", { name: "À propos d’Apercura" })
		.locator('a[href="/fr/a-propos"]')
		.click();
	await expect(page).toHaveURL(/\/fr\/a-propos$/);
	await expect(page.locator("main h1").filter({ visible: true })).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as Window & { softNavigation?: boolean }).softNavigation === true,
		),
	).toBe(true);

	// Only one main region is rendered, whatever the hidden previous route keeps.
	await expect(page.locator("main").filter({ visible: true })).toHaveCount(1);

	const skip = page.getByRole("link", { name: "Aller au contenu" });
	await skip.focus();
	await page.keyboard.press("Enter");
	const focused = await page.evaluate(() => {
		const active = document.activeElement as HTMLElement | null;
		return {
			tag: active?.tagName,
			visible: active?.checkVisibility() ?? false,
			heading: active?.querySelector("h1")?.textContent ?? null,
		};
	});
	expect(focused.tag).toBe("MAIN");
	expect(focused.visible).toBe(true);
	expect(focused.heading).toBe(
		await page.locator("main h1").filter({ visible: true }).textContent(),
	);
});

for (const path of ["/pro/connexion", "/pro/inscription"]) {
	test(`the language switch on ${path} keeps where to go back to`, async ({ page }) => {
		// `suite` names an internal pathname, the same in every locale.
		const suite = encodeURIComponent("/pro/revendiquer?rpps=19999990013");
		// `psc` (a sign-in error flag) is not part of the page's state: it is dropped.
		await page.goto(`/fr${path}?suite=${suite}&psc=erreur`);
		const english = languages(page, "Langue").getByRole("link", { name: "English" });
		await expect(english).toHaveAttribute("href", `/fr-en${path}?suite=${suite}`);
		await english.click();
		await expect(page).toHaveURL(new RegExp(`/fr-en${path}\\?suite=${suite}$`));

		const french = languages(page, "Language").getByRole("link", { name: "Français" });
		await expect(french).toHaveAttribute("href", `/fr${path}?suite=${suite}`);
		await french.click();
		await expect(page).toHaveURL(new RegExp(`/fr${path}\\?suite=${suite}$`));
	});
}

test("the language switch on /rdv keeps the token of the fragment", async ({ page }) => {
	const token = "A".repeat(43);
	await page.goto(`/fr/rdv#t=${token}`);
	await expect(page.getByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeVisible();
	const english = languages(page, "Langue").getByRole("link", { name: "English" });
	await expect(english).toHaveAttribute("href", `/fr-en/rdv#t=${token}`);
	await english.click();
	await expect(page).toHaveURL(new RegExp(`/fr-en/rdv#t=${token}$`));
	// The English page read the same token: an unknown one, not a missing one.
	await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});

test("the language switch drops the fragment of other pages", async ({ page }) => {
	await page.goto("/fr/donnees#corriger");
	await expect(languages(page, "Langue").getByRole("link", { name: "English" })).toHaveAttribute(
		"href",
		"/fr-en/data",
	);
});
