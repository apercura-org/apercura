import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

const PAGES = [
	"/",
	"/fr",
	"/fr-en",
	"/fr/pro",
	"/fr-en/pro",
	"/fr/recherche?quoi=Exemple&ou=Lyon",
	"/fr-en/search",
];

for (const path of PAGES) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the home search submits Qui and Où to /fr/recherche", async ({ page }) => {
		await page.goto("/fr");
		await page.getByLabel("Qui ?").fill("Exemple");
		await page.getByLabel("Où ?").fill("Lyon");
		await page.getByRole("button", { name: "Chercher" }).click();
		await expect(page).toHaveURL(/\/fr\/recherche\?quoi=Exemple&ou=Lyon&pays=fr$/);
	});
});

test("the English home page searches under /fr-en", async ({ page }) => {
	await page.goto("/fr-en");
	await page.getByLabel("Who?").fill("Exemple");
	// The open suggestion slip hides the rest of the page from assistive tech (React Aria).
	await page.getByRole("button", { name: "Search", includeHidden: true }).click();
	await expect(page).toHaveURL(/\/fr-en\/search\?quoi=Exemple&ou=&pays=fr$/);
});

test("the skip link moves focus to the main content", async ({ page }) => {
	await page.goto("/fr");
	await page.keyboard.press("Tab");
	const skip = page.getByRole("link", { name: "Aller au contenu" });
	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/#main$/);
});

test("without PUBLIC_HDS_HOST the home page claims encryption, not HDS hosting", async ({
	page,
}) => {
	await page.goto("/fr");
	await expect(page.getByText("Données chiffrées", { exact: true })).toBeVisible();
	await expect(page.getByText(/sont chiffrés au niveau applicatif\./)).toBeVisible();
	await expect(page.getByText(/HDS/)).toHaveCount(0);
	await expect(page.getByText(/hébergées en France/)).toHaveCount(0);
	await page.goto("/fr-en");
	await expect(page.getByText("Encrypted data", { exact: true })).toBeVisible();
});

test("without PUBLIC_HDS_HOST the privacy policy keeps data in the EEA, not in France", async ({
	page,
}) => {
	await page.goto("/fr/confidentialite");
	await expect(
		page.locator("#transferts").getByText(/dans l’Espace économique européen et n’en sortent pas/),
	).toBeVisible();
	await expect(page.getByText(/données de santé en France|Hébergé en France/)).toHaveCount(0);
	await page.goto("/fr-en/privacy");
	await expect(
		page.locator("#transferts").getByText(/in the European Economic Area and is not transferred/),
	).toBeVisible();
	await expect(page.getByText(/health data in France|Hosted in France/)).toHaveCount(0);
});

test("the component gallery is not served in production", async ({ request }) => {
	expect((await request.get("/fr/_ui")).status()).toBe(404);
	expect((await request.get("/fr-en/_ui")).status()).toBe(404);
});
