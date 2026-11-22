import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/** The institutional pages in every locale: French (no prefix), then English, German, Spanish, Italian. */
const PAGES = [
	["/a-propos", "/en/about", "/de/ueber-uns", "/es/acerca-de", "/it/chi-siamo"],
	["/open-source", "/en/open-source", "/de/open-source", "/es/open-source", "/it/open-source"],
	["/donnees", "/en/data", "/de/daten", "/es/datos", "/it/dati"],
	[
		"/accessibilite",
		"/en/accessibility",
		"/de/barrierefreiheit",
		"/es/accesibilidad",
		"/it/accessibilita",
	],
	["/confidentialite", "/en/privacy", "/de/datenschutz", "/es/privacidad", "/it/privacy"],
	["/mentions-legales", "/en/legal-notice", "/de/impressum", "/es/aviso-legal", "/it/note-legali"],
	["/conditions", "/en/terms", "/de/nutzungsbedingungen", "/es/condiciones", "/it/condizioni"],
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

test("legal pages print the unknown publisher and host as visible placeholders", async ({
	page,
}) => {
	// The e2e server sets no LEGAL_* variable: every fact is still a placeholder, never invented.
	await page.goto("/mentions-legales");
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
	await page.goto("/en/legal-notice");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true })).toBeVisible();
	await page.goto("/confidentialite");
	for (const placeholder of ["{{DPO_CONTACT}}", "{{SMTP_PROVIDER}}", "{{CONTACT_EMAIL}}"]) {
		await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
	}
	// The regulatory conventionnement notice waits for the legal review.
	await page.goto("/conditions");
	await expect(page.getByText("{{CONVENTIONNEMENT_WORDING}}", { exact: true })).toBeVisible();
});

test("the accessibility statement is honest about its status and gives the recourse", async ({
	page,
}) => {
	await page.goto("/accessibilite");
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
	await page.goto("/");
	const footer = page.getByRole("navigation", { name: "À propos d’Apercura" });
	for (const [path] of PAGES) {
		await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
	}
	await expect(footer.locator('a[href="/annuaire"]')).toHaveCount(1);
});
