import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

type Catalog = { LocaleSwitcher: { label: string }; HomePage: { hook: string } } & Record<
	string,
	unknown
>;

const catalog = (locale: string): Catalog =>
	JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

const en = catalog("en");
const de = catalog("de");
const es = catalog("es");
const it = catalog("it");

/*
 * Smoke test of the German, Spanish and Italian interfaces: the home page and a
 * practitioner page render in their language, with no missing or broken
 * message, stay out of the index, and the language switch moves between all
 * five locales. Against the synthetic fixtures (fictitious practitioner).
 */

const SLUG = "camille-exemple-19999990013";

const LOCALES = [
	{ locale: "de", name: "Deutsch", messages: de, practitioner: `/de/behandler/${SLUG}` },
	{ locale: "es", name: "Español", messages: es, practitioner: `/es/profesional/${SLUG}` },
	{ locale: "it", name: "Italiano", messages: it, practitioner: `/it/professionista/${SLUG}` },
] as const;

const SWITCHER = ["Français", "English", "Deutsch", "Español", "Italiano"];

/** next-intl reports a missing or unformattable message on the console. */
function watchMessages(page: Page) {
	const problems: string[] = [];
	page.on("console", (message) => {
		if (/MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INSUFFICIENT_PATH/.test(message.text())) {
			problems.push(message.text());
		}
	});
	return problems;
}

/** A message key printed in place of its text (`Namespace.key`) means the catalog lacks it. */
const KEY = new RegExp(`\\b(?:${Object.keys(en).join("|")})\\.[A-Za-z]+`, "g");

async function printedKeys(page: Page) {
	return (await page.locator("body").allInnerTexts()).join("\n").match(KEY) ?? [];
}

for (const { locale, name, messages, practitioner } of LOCALES) {
	test.describe(`${name} interface`, () => {
		for (const path of [`/${locale}`, practitioner]) {
			test(`${path} renders in ${name}, noindex, with every message`, async ({ page }) => {
				const problems = watchMessages(page);
				const response = await page.goto(path);
				expect(response?.status()).toBe(200);
				expect(response?.headers()["x-robots-tag"]).toContain("noindex");
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
					"content",
					"noindex, follow",
				);
				await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
				await expect(page.locator("main h1")).toHaveCount(1);
				expect(await printedKeys(page)).toEqual([]);
				expect(problems).toEqual([]);
				expect(await axeViolations(page)).toEqual([]);
			});
		}

		test(`the ${name} home page is translated, not the English fallback`, async ({ page }) => {
			const description = page.locator('meta[name="description"]');
			await page.goto("/en");
			const english = await description.getAttribute("content");
			await page.goto(`/${locale}`);
			expect(await description.getAttribute("content")).not.toBe(english);
			await expect(page.getByText(en.HomePage.hook)).toHaveCount(0);
		});

		test(`the language switch lists the five languages and leaves ${name}`, async ({ page }) => {
			await page.goto(practitioner);
			const nav = page.getByRole("navigation", { name: messages.LocaleSwitcher.label });
			await expect(nav.getByRole("link")).toHaveText(SWITCHER);
			await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "true");
			await expect(nav.getByRole("link", { name })).toHaveAttribute("lang", locale);
			await nav.getByRole("link", { name: "Français" }).click();
			await expect(page).toHaveURL(new RegExp(`/praticien/${SLUG}$`));
			await expect(page.locator("html")).toHaveAttribute("lang", "fr");
		});
	});
}

test("the language switch reaches every locale from French and keeps the search", async ({
	page,
}) => {
	await page.goto("/recherche?quoi=Exemple&ou=Lyon");
	const nav = page.getByRole("navigation", { name: "Langue" });
	await expect(nav.getByRole("link")).toHaveText(SWITCHER);
	const targets = {
		Deutsch: "/de/suche",
		Español: "/es/buscar",
		Italiano: "/it/cerca",
	} as const;
	for (const [language, path] of Object.entries(targets)) {
		await expect(nav.getByRole("link", { name: language })).toHaveAttribute(
			"href",
			`${path}?quoi=Exemple&ou=Lyon`,
		);
	}
	await nav.getByRole("link", { name: "Deutsch" }).click();
	await expect(page).toHaveURL(/\/de\/suche\?quoi=Exemple&ou=Lyon$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("the language switch on /rdv keeps the token in every locale", async ({ page }) => {
	const token = "A".repeat(43);
	await page.goto(`/rdv#t=${token}`);
	const nav = page.getByRole("navigation", { name: "Langue" });
	for (const { locale, name } of LOCALES) {
		await expect(nav.getByRole("link", { name })).toHaveAttribute(
			"href",
			`/${locale}/rdv#t=${token}`,
		);
	}
});
