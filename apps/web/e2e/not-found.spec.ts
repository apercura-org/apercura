import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * Unknown addresses answer a real 404 with the site's own page: in the locale of the URL, with
 * the header, the search and the footer, never indexed. Outside every locale, the root
 * fallback in English.
 */

const LOCALIZED = [
	{
		path: "/fr/cette-page-n-existe-pas",
		title: "Cette page n’existe pas",
		lang: "fr",
		search: "Chercher",
	},
	{
		path: "/fr-en/practitioner/nobody-00000000000",
		title: "This page does not exist",
		lang: "en",
		search: "Search",
	},
	{
		path: "/at/gibt-es-nicht",
		title: "Diese Seite gibt es nicht",
		lang: "de-AT",
		search: "Suchen",
	},
	{ path: "/cz/neexistuje", title: "Tato stránka neexistuje", lang: "cs-CZ", search: "Hledat" },
	{ path: "/es/no-existe", title: "Esta página no existe", lang: "es-ES", search: "Buscar" },
];

for (const { path, title, lang, search } of LOCALIZED) {
	test(`${path} answers 404 with the localized page`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
		await expect(page.locator("html")).toHaveAttribute("lang", lang);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
		await expect(page.getByRole("banner")).toBeVisible();
		await expect(page.getByRole("contentinfo")).toBeVisible();
		await expect(page.getByRole("search")).toBeVisible();
		await expect(page.getByRole("button", { name: search })).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the 404 search submits to the locale's search page", async ({ page }) => {
	await page.goto("/fr/cette-page-n-existe-pas");
	await page.getByLabel("Qui ?").fill("Exemple");
	await page.getByRole("button", { name: "Chercher" }).click();
	await expect(page).toHaveURL(/\/fr\/recherche\?quoi=Exemple/);
});

test("an address outside every locale gets the root 404", async ({ page }) => {
	const response = await page.goto("/missing-page.txt");
	expect(response?.status()).toBe(404);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page does not exist");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	await expect(page.getByRole("link", { name: "France" })).toHaveAttribute("href", "/fr");
	await expect(page.getByRole("link", { name: "Spain" })).toHaveAttribute("href", "/es");
	expect(await axeViolations(page)).toEqual([]);
});
