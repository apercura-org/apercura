import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

const PAGES = ["/", "/en", "/pro", "/en/pro", "/recherche?quoi=Exemple&ou=Lyon", "/en/recherche"];

for (const path of PAGES) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("the home search submits Qui and Où to /recherche", async ({ page }) => {
		await page.goto("/");
		await page.getByLabel("Qui ?").fill("Exemple");
		await page.getByLabel("Où ?").fill("Lyon");
		await page.getByRole("button", { name: "Chercher" }).click();
		await expect(page).toHaveURL(/\/recherche\?quoi=Exemple&ou=Lyon$/);
	});
});

test("the English home page searches under /en", async ({ page }) => {
	await page.goto("/en");
	await page.getByLabel("Who?").fill("Exemple");
	await page.getByRole("button", { name: "Search" }).click();
	await expect(page).toHaveURL(/\/en\/recherche\?quoi=Exemple&ou=$/);
});

test("the skip link moves focus to the main content", async ({ page }) => {
	await page.goto("/");
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
	await page.goto("/");
	await expect(page.getByText("Données chiffrées", { exact: true })).toBeVisible();
	await expect(
		page.getByText(/Hébergez-les chez vous ou chez un hébergeur certifié HDS\./),
	).toBeVisible();
	await expect(page.getByText(/hébergées en France/)).toHaveCount(0);
	await page.goto("/en");
	await expect(page.getByText("Encrypted data", { exact: true })).toBeVisible();
});

test("the component gallery is not served in production", async ({ request }) => {
	expect((await request.get("/_ui")).status()).toBe(404);
	expect((await request.get("/en/_ui")).status()).toBe(404);
});
