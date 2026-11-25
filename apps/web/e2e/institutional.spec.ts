import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/** The institutional pages in every locale: French (`/fr`), then English, German, Spanish, Italian (`/fr-en`…). */
const PAGES = [
	["/fr/a-propos", "/fr-en/about", "/fr-de/ueber-uns", "/fr-es/acerca-de", "/fr-it/chi-siamo"],
	[
		"/fr/open-source",
		"/fr-en/open-source",
		"/fr-de/open-source",
		"/fr-es/open-source",
		"/fr-it/open-source",
	],
	["/fr/donnees", "/fr-en/data", "/fr-de/daten", "/fr-es/datos", "/fr-it/dati"],
	[
		"/fr/accessibilite",
		"/fr-en/accessibility",
		"/fr-de/barrierefreiheit",
		"/fr-es/accesibilidad",
		"/fr-it/accessibilita",
	],
	[
		"/fr/confidentialite",
		"/fr-en/privacy",
		"/fr-de/datenschutz",
		"/fr-es/privacidad",
		"/fr-it/privacy",
	],
	[
		"/fr/mentions-legales",
		"/fr-en/legal-notice",
		"/fr-de/impressum",
		"/fr-es/aviso-legal",
		"/fr-it/note-legali",
	],
	[
		"/fr/conditions",
		"/fr-en/terms",
		"/fr-de/nutzungsbedingungen",
		"/fr-es/condiciones",
		"/fr-it/condizioni",
	],
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
	await page.goto("/fr-en/about");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	// No locale cookie: every locale has its own prefix, nothing depends on the last one visited.
	const cookies = await page.context().cookies();
	expect(cookies.filter((cookie) => cookie.name === "NEXT_LOCALE")).toEqual([]);
	await page.goto("/fr/a-propos");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index/);
});

test("/fr/donnees explains how to correct and how to object to a page", async ({ page }) => {
	await page.goto("/fr/donnees");
	await expect(page.locator("#corriger")).toBeVisible();
	await expect(page.locator("#retrait")).toBeVisible();
	await page.goto("/fr/donnees#corriger");
	await expect(page.locator("#corriger h2")).toBeInViewport();
});

test("legal pages print the unknown publisher and host as visible placeholders", async ({
	page,
}) => {
	// The e2e server sets no LEGAL_* variable: every fact is still a placeholder, never invented.
	await page.goto("/fr/mentions-legales");
	await expect(
		page.getByText("Brouillon : à faire relire par un juriste avant le lancement"),
	).toBeVisible();
	for (const placeholder of [
		"{{PUBLISHER_NAME}}",
		"{{PUBLISHER_REGISTRATION}}",
		"{{PUBLICATION_DIRECTOR}}",
		"{{HOST_NAME}}",
		"{{HOST_ADDRESS}}",
	]) {
		await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
	}
	await page.goto("/fr-en/legal-notice");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true })).toBeVisible();
	await page.goto("/fr/confidentialite");
	for (const placeholder of ["{{DPO_CONTACT}}", "{{SMTP_PROVIDER}}", "{{CONTACT_EMAIL}}"]) {
		await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
	}
	// The regulatory conventionnement notice waits for the legal review.
	await page.goto("/fr/conditions");
	await expect(page.getByText("{{CONVENTIONNEMENT_WORDING}}", { exact: true })).toBeVisible();
});

test("the accessibility statement is honest about its status and gives the recourse", async ({
	page,
}) => {
	await page.goto("/fr/accessibilite");
	await expect(
		page.getByText("Partiellement conforme (auto-évaluation, audit en cours)"),
	).toBeVisible();
	await expect(page.locator("time[datetime='2026-11-22']")).toHaveText("22 novembre 2026");
	await expect(page.getByText("{{CONTACT_EMAIL}}", { exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: /Saisir le Défenseur des droits/ })).toHaveAttribute(
		"href",
		"https://formulaire.defenseurdesdroits.fr/",
	);
});

test("the footer links to every institutional page", async ({ page }) => {
	await page.goto("/fr");
	const footer = page.getByRole("navigation", { name: "À propos d’Apercura" });
	for (const [path] of PAGES) {
		await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
	}
	await expect(footer.locator('a[href="/fr/annuaire"]')).toHaveCount(1);
	// The international home, outside the locales.
	await expect(footer.locator('a[href="/"]')).toHaveCount(1);
});
