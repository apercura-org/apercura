import { expect, type Page, test } from "@playwright/test";

/**
 * State that must survive client-side navigation: the skip link target once
 * the previous route stays mounted (hidden) by Cache Components, and the query
 * and fragment of a page across a language switch.
 */

/** The language picker, opened: a disclosure whose button names the current language. */
async function languages(page: Page, label: "Langue" | "Language") {
	const nav = page.getByRole("navigation", { name: label });
	await nav.locator("summary").click();
	return nav;
}

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
		const english = (await languages(page, "Langue")).getByRole("link", { name: "English" });
		await expect(english).toHaveAttribute("href", `/fr-en${path}?suite=${suite}`);
		await english.click();
		await expect(page).toHaveURL(new RegExp(`/fr-en${path}\\?suite=${suite}$`));

		const french = (await languages(page, "Language")).getByRole("link", { name: "Français" });
		await expect(french).toHaveAttribute("href", `/fr${path}?suite=${suite}`);
		await french.click();
		await expect(page).toHaveURL(new RegExp(`/fr${path}\\?suite=${suite}$`));
	});
}

test("the language switch on /rdv keeps the token of the fragment", async ({ page }) => {
	const token = "A".repeat(43);
	await page.goto(`/fr/rdv#t=${token}`);
	await expect(page.getByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeVisible();
	const english = (await languages(page, "Langue")).getByRole("link", { name: "English" });
	await expect(english).toHaveAttribute("href", `/fr-en/rdv#t=${token}`);
	await english.click();
	await expect(page).toHaveURL(new RegExp(`/fr-en/rdv#t=${token}$`));
	// The English page read the same token: an unknown one, not a missing one.
	await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});

test("the language switch drops the fragment of other pages", async ({ page }) => {
	await page.goto("/fr/donnees#corriger");
	const nav = await languages(page, "Langue");
	await expect(nav.getByRole("link", { name: "English" })).toHaveAttribute("href", "/fr-en/data");
});

test("the country menu, beside the language menu, moves to another market's home", async ({
	page,
}) => {
	await page.goto("/fr-de");
	const countries = page.getByRole("navigation", { name: "Land" });
	// Two separate choices: the market, and the language its pages are read in.
	await expect(page.getByRole("navigation", { name: "Sprache" })).toBeVisible();
	await countries.locator("summary").click();
	await expect(countries.getByRole("link")).toHaveText([
		"Frankreich",
		"Österreich",
		"Vereinigtes Königreich",
		"Tschechien",
		"Spanien",
		"Italien",
		"Deutschland",
		"Schweiz",
		"Estland",
		"Polen",
		"Norwegen",
		"Irland",
		"Finnland",
		"Litauen",
		"Slowenien",
		"Zypern",
		"Lettland",
		"Schweden",
	]);
	await expect(countries.getByRole("link", { name: "Frankreich" })).toHaveAttribute(
		"aria-current",
		"true",
	);
	// In the visitor's language where the market offers it, else in the market's own.
	await expect(countries.getByRole("link", { name: "Frankreich" })).toHaveAttribute(
		"href",
		"/fr-de",
	);
	await expect(countries.getByRole("link", { name: "Vereinigtes Königreich" })).toHaveAttribute(
		"href",
		"/gb",
	);
	await expect(countries.getByRole("link", { name: "Spanien" })).toHaveAttribute("href", "/es");
	await expect(countries.getByRole("link", { name: "Italien" })).toHaveAttribute("href", "/it");
	await expect(countries.getByRole("link", { name: "Polen" })).toHaveAttribute("href", "/pl");
	// Finland in Finnish, its only language for now.
	await expect(countries.getByRole("link", { name: "Finnland" })).toHaveAttribute("href", "/fi");
	// Germany in German: France read in German leads to Germany's own pages.
	await expect(countries.getByRole("link", { name: "Deutschland" })).toHaveAttribute("href", "/de");
	// Switzerland in German, the visitor's language.
	await expect(countries.getByRole("link", { name: "Schweiz" })).toHaveAttribute("href", "/ch");
	// Estonia in Estonian, its only language.
	await expect(countries.getByRole("link", { name: "Estland" })).toHaveAttribute("href", "/ee");
	// Norway in Norwegian, its only language here.
	await expect(countries.getByRole("link", { name: "Norwegen" })).toHaveAttribute("href", "/no");
	// Ireland in English, its only language.
	await expect(countries.getByRole("link", { name: "Irland" })).toHaveAttribute("href", "/ie");
	// Lithuania in Lithuanian, its one language.
	await expect(countries.getByRole("link", { name: "Litauen" })).toHaveAttribute("href", "/lt");
	// Slovenia in Slovenian, its only language.
	await expect(countries.getByRole("link", { name: "Slowenien" })).toHaveAttribute("href", "/si");
	// Cyprus in Greek, its only language here.
	await expect(countries.getByRole("link", { name: "Zypern" })).toHaveAttribute("href", "/cy");
	// Latvia in Latvian, its only language.
	await expect(countries.getByRole("link", { name: "Lettland" })).toHaveAttribute("href", "/lv");
	// Sweden in Swedish, its only language.
	await expect(countries.getByRole("link", { name: "Schweden" })).toHaveAttribute("href", "/se");
	await countries.getByRole("link", { name: "Österreich" }).click();
	await expect(page).toHaveURL(/\/at$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "de-AT");
	// Austria has one language: the country menu stays, the language menu goes.
	await expect(page.getByRole("navigation", { name: "Land" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Sprache" })).toHaveCount(0);
});

test("Switzerland's pages offer its three languages, each the same page", async ({ page }) => {
	await page.goto("/ch/verzeichnis");
	await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
	const languages = page.getByRole("navigation", { name: "Sprache" });
	await languages.locator("summary").click();
	await expect(languages.getByRole("link")).toHaveText(["Deutsch", "Français", "Italiano"]);
	await expect(languages.getByRole("link", { name: "Deutsch" })).toHaveAttribute(
		"aria-current",
		"true",
	);
	await expect(languages.getByRole("link", { name: "Français" })).toHaveAttribute(
		"href",
		"/ch-fr/annuaire",
	);
	await expect(languages.getByRole("link", { name: "Italiano" })).toHaveAttribute(
		"href",
		"/ch-it/elenco",
	);
	await languages.getByRole("link", { name: "Français" }).click();
	await expect(page).toHaveURL(/\/ch-fr\/annuaire$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
	// From Switzerland in French, the country menu leads to the other markets in French.
	const countries = page.getByRole("navigation", { name: "Pays" });
	await countries.locator("summary").click();
	await expect(countries.getByRole("link", { name: "France" })).toHaveAttribute("href", "/fr");
	await expect(countries.getByRole("link", { name: "Suisse" })).toHaveAttribute(
		"aria-current",
		"true",
	);
	await expect(countries.getByRole("link", { name: "Suisse" })).toHaveAttribute("href", "/ch-fr");
});

test("Latvia's pages offer the country menu in Latvian, and no language menu", async ({ page }) => {
	await page.goto("/lv/katalogs");
	await expect(page.locator("html")).toHaveAttribute("lang", "lv-LV");
	// Latvia has one language: the country menu stays, the language menu goes.
	await expect(page.getByRole("navigation", { name: "Valoda" })).toHaveCount(0);
	const countries = page.getByRole("navigation", { name: "Valsts" });
	await countries.locator("summary").click();
	await expect(countries.getByRole("link")).toHaveText([
		"Francija",
		"Austrija",
		"Lielbritānija",
		"Čehija",
		"Spānija",
		"Itālija",
		"Vācija",
		"Šveice",
		"Igaunija",
		"Polija",
		"Norvēģija",
		"Īrija",
		"Somija",
		"Lietuva",
		"Slovēnija",
		"Kipra",
		"Latvija",
		"Zviedrija",
	]);
	await expect(countries.getByRole("link", { name: "Latvija" })).toHaveAttribute(
		"aria-current",
		"true",
	);
	await expect(countries.getByRole("link", { name: "Latvija" })).toHaveAttribute("href", "/lv");
	await countries.getByRole("link", { name: "Šveice" }).click();
	await expect(page).toHaveURL(/\/ch$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
});
