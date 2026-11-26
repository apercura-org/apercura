import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * One domain for every market (docs/adr/0002-multi-country.md, section 2): the
 * international home at the root, France under `/fr`, and the former French
 * domain (apercura.fr, listed in LEGACY_HOSTS by playwright.config.ts)
 * redirecting every URL to the same page on APP_URL. Behind the trusted proxy
 * of the test server, X-Forwarded-Host names the host the visitor typed.
 */

test.describe("the international home", () => {
	test("is in English, lists the open markets and the other countries as plain text", async ({
		page,
	}) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator("main h1")).toHaveCount(1);

		const countries = page.getByRole("region", { name: "Choose a country" });
		const france = countries.getByRole("link", { name: "Apercura France" });
		await expect(france).toHaveAttribute("href", "/fr");
		await expect(france).toHaveAttribute("hreflang", "fr-FR");
		const uk = countries.getByRole("link", { name: "Apercura United Kingdom" });
		await expect(uk).toHaveAttribute("href", "/gb");
		await expect(uk).toHaveAttribute("hreflang", "en-GB");
		const czechia = countries.getByRole("link", { name: "Apercura Czechia" });
		await expect(czechia).toHaveAttribute("href", "/cz");
		await expect(czechia).toHaveAttribute("hreflang", "cs-CZ");
		const spain = countries.getByRole("link", { name: "Apercura Spain" });
		await expect(spain).toHaveAttribute("href", "/es");
		await expect(spain).toHaveAttribute("hreflang", "es-ES");
		for (const [name, href] of [
			["English", "/fr-en"],
			["Deutsch", "/fr-de"],
			["Español", "/fr-es"],
			["Italiano", "/fr-it"],
		] as const) {
			await expect(countries.getByRole("link", { name, exact: true })).toHaveAttribute(
				"href",
				href,
			);
		}
		// Planned countries are text: no page exists for them, so none can be thin.
		for (const country of ["Belgium", "Germany", "Italy", "Switzerland"]) {
			await expect(countries.getByText(country, { exact: true })).toBeVisible();
			await expect(countries.getByRole("link", { name: country })).toHaveCount(0);
		}
		await expect(countries.getByText("Coming soon")).toHaveCount(4);

		// The pages about Apercura, in English.
		const more = page.getByRole("region", { name: "Learn more" });
		for (const [name, href] of [
			["About", "/fr-en/about"],
			["Open source", "/fr-en/open-source"],
			["Data and sources", "/fr-en/data"],
			["Legal notice", "/fr-en/legal-notice"],
		] as const) {
			await expect(more.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
		}
		expect(await axeViolations(page)).toEqual([]);
	});

	test("an English browser gets no language suggestion", async ({ browser }) => {
		const context = await browser.newContext({ locale: "en-GB" });
		const page = await context.newPage();
		await page.goto("/");
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.getByRole("banner").getByRole("link")).toHaveCount(1);
		await context.close();
	});

	for (const [locale, label, href] of [
		["fr-FR", "En français : Apercura France", "/fr"],
		["de-DE", "Auf Deutsch: Apercura Frankreich", "/fr-de"],
	] as const) {
		test(`a ${locale} browser is offered the France pages in its language, never redirected`, async ({
			browser,
		}) => {
			const context = await browser.newContext({ locale });
			const page = await context.newPage();
			const response = await page.goto("/");
			expect(response?.status()).toBe(200);
			expect(new URL(page.url()).pathname).toBe("/");
			const suggestion = page.getByRole("banner").getByRole("link", { name: label });
			await expect(suggestion).toHaveAttribute("href", href);
			await expect(suggestion).toHaveAttribute("lang", locale.slice(0, 2));
			expect(await axeViolations(page)).toEqual([]);
			await context.close();
		});
	}

	test("France's footer links back to it", async ({ page }) => {
		await page.goto("/fr");
		await page
			.getByRole("navigation", { name: "À propos d’Apercura" })
			.getByRole("link", { name: "Apercura dans d’autres pays" })
			.click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
	});
});

test.describe("the former French domain", () => {
	const LEGACY = { "x-forwarded-host": "apercura.fr" };

	for (const [from, to] of [
		["/", "/fr"],
		[
			"/praticien/camille-exemple-19999990013?rdv=1",
			"/fr/praticien/camille-exemple-19999990013?rdv=1",
		],
		["/Praticien/Camille-Exemple-19999990013", "/fr/praticien/camille-exemple-19999990013"],
		["/medecin-generaliste/75-paris/2", "/fr/medecin-generaliste/75-paris/2"],
		["/annuaire/69-rhone/lyon", "/fr/annuaire/69-rhone/lyon"],
		[
			"/etablissement/centre-hospitalier-fictif-2a9999001",
			"/fr/etablissement/centre-hospitalier-fictif-2a9999001",
		],
		["/recherche?quoi=Exemple&ou=Lyon", "/fr/recherche?quoi=Exemple&ou=Lyon"],
		["/mentions-legales", "/fr/mentions-legales"],
		["/pro/connexion?suite=%2Fpro%2Fpage", "/fr/pro/connexion?suite=%2Fpro%2Fpage"],
		["/rdv", "/fr/rdv"],
		["/en", "/fr-en"],
		[
			"/en/practitioner/camille-exemple-19999990013",
			"/fr-en/practitioner/camille-exemple-19999990013",
		],
		["/en/legal-notice", "/fr-en/legal-notice"],
		["/de/impressum", "/fr-de/impressum"],
		["/es/aviso-legal", "/fr-es/aviso-legal"],
		["/it/note-legali", "/fr-it/note-legali"],
		// Already in the current scheme: same path.
		["/fr/annuaire", "/fr/annuaire"],
		// Files crawlers and shared links reach.
		["/robots.txt", "/robots.txt"],
		["/sitemap.xml", "/sitemap.xml"],
		["/sitemaps/praticiens-0.xml", "/sitemaps/fr/praticiens-0.xml"],
		["/og/medecin.png", "/og/medecin.png"],
		["/.well-known/security.txt", "/.well-known/security.txt"],
	] as const) {
		test(`apercura.fr${from} answers 301 to ${to} on APP_URL`, async ({ request, baseURL }) => {
			const response = await request.get(from, { headers: LEGACY, maxRedirects: 0 });
			expect(response.status()).toBe(301);
			const origin = new URL(baseURL ?? "").origin;
			expect(new URL(response.headers().location ?? "", origin).href).toBe(`${origin}${to}`);
		});
	}

	test("a request with a body answers 308, which keeps its method", async ({ request }) => {
		const response = await request.post("/pro/connexion", {
			headers: LEGACY,
			form: { email: "nobody@example.test" },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(308);
		expect(new URL(response.headers().location ?? "", "http://x").pathname).toBe(
			"/fr/pro/connexion",
		);
	});

	test("www.apercura.fr, listed too, redirects the same way", async ({ request }) => {
		const response = await request.get("/", {
			headers: { "x-forwarded-host": "www.apercura.fr" },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(301);
		expect(new URL(response.headers().location ?? "", "http://x").pathname).toBe("/fr");
	});

	test("an unlisted host has its pages redirected, its home to the international one", async ({
		request,
	}) => {
		const headers = { "x-forwarded-host": "apercura.example" };
		const home = await request.get("/", { headers, maxRedirects: 0 });
		expect(home.status()).toBe(301);
		expect(new URL(home.headers().location ?? "", "http://x").pathname).toBe("/");
		const page = await request.get("/annuaire", { headers, maxRedirects: 0 });
		expect(page.status()).toBe(301);
		expect(new URL(page.headers().location ?? "", "http://x").pathname).toBe("/fr/annuaire");
		// Its files are served where they are, as before.
		expect((await request.get("/robots.txt", { headers, maxRedirects: 0 })).status()).toBe(200);
	});
});
