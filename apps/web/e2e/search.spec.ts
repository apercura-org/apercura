import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * Search over the SYNTHETIC directory imported from packages/etl/fixtures
 * (fictitious people such as Dr Jean-Pierre Fictif, RPPS 19999990021, a GP in
 * Paris 15e, and generated ESSAI* practitioners in every Paris arrondissement).
 */

const FICTIF_RPPS = "19999990021";
const FICTIF_PAGE = new RegExp(`/praticien/jean-pierre-fictif-${FICTIF_RPPS}$`);

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("a name search lists the practitioner with a link to the page", async ({ page }) => {
		await page.goto("/recherche?quoi=Fictif");
		const results = page.getByRole("table", { name: "Résultats" });
		await expect(results).toBeVisible();
		const link = results.getByRole("link", { name: /Jean-Pierre Fictif/ });
		await expect(link).toHaveAttribute("href", FICTIF_PAGE);
		await link.click();
		await expect(page).toHaveURL(FICTIF_PAGE);
	});

	test("the home form submits Qui and Où and lands on results", async ({ page }) => {
		await page.goto("/");
		await page.getByLabel("Qui ?").fill("Essai");
		await page.getByLabel("Où ?").fill("75015");
		await page.getByRole("button", { name: "Chercher" }).click();
		await expect(page).toHaveURL(/\/recherche\?quoi=Essai&ou=75015$/);
		await expect(page.getByRole("table", { name: "Résultats" })).toBeVisible();
	});
});

test("a specialty and a place redirect (307) to the listing page", async ({ request }) => {
	const response = await request.get(
		`/recherche?quoi=${encodeURIComponent("Médecin généraliste")}&ou=75015`,
		{ maxRedirects: 0 },
	);
	expect(response.status()).toBe(307);
	expect(response.headers().location).toMatch(
		/\/medecin-generaliste\/75-paris\/paris-15e-arrondissement$/,
	);
});

test("an RPPS number redirects (307) to the practitioner page", async ({ request }) => {
	const response = await request.get(`/recherche?quoi=${FICTIF_RPPS}`, { maxRedirects: 0 });
	expect(response.status()).toBe(307);
	expect(response.headers().location).toMatch(FICTIF_PAGE);
});

test("an unknown RPPS number says honestly that there is no page", async ({ page }) => {
	await page.goto("/recherche?quoi=19999990022");
	await expect(page.getByRole("heading", { name: /Aucune page publique/ })).toBeVisible();
});

test("“Qui ?” suggests practitioners and opens the chosen page", async ({ page }) => {
	await page.goto("/recherche");
	await page.getByRole("combobox", { name: "Qui ?" }).pressSequentially("Fict");
	const option = page.getByRole("option", { name: /Jean-Pierre Fictif/ });
	await expect(option).toBeVisible();
	await option.click();
	await expect(page).toHaveURL(FICTIF_PAGE);
});

test("“Où ?” suggests places with their department", async ({ page }) => {
	await page.goto("/en/search");
	await page.getByRole("combobox", { name: "Where?" }).pressSequentially("Paris 15");
	const option = page.getByRole("option", { name: /Paris 15e Arrondissement/ });
	await expect(option).toBeVisible();
	await option.click();
	await expect(page.getByRole("combobox", { name: "Where?" })).toHaveValue(
		"Paris 15e Arrondissement (75)",
	);
});

test("the home search gets its suggestions on first use, keeping the text and the focus", async ({
	page,
}) => {
	await page.goto("/");
	// The plain GET form until the visitor reaches it: no combo box code at load.
	await expect(page.getByLabel("Qui ?")).toHaveAttribute("type", "search");
	await expect(page.getByRole("combobox")).toHaveCount(0);
	await page.getByLabel("Qui ?").focus();
	await page.keyboard.type("Fic");
	const who = page.getByRole("combobox", { name: "Qui ?" });
	await expect(who).toBeFocused();
	await expect(who).toHaveValue("Fic");
	await page.keyboard.type("t");
	const option = page.getByRole("option", { name: /Jean-Pierre Fictif/ });
	await expect(option).toBeVisible();
	await option.click();
	await expect(page).toHaveURL(FICTIF_PAGE);
});

for (const path of [
	"/recherche?quoi=Essai&ou=75015",
	"/recherche",
	"/recherche?quoi=Zzzzzz",
	"/recherche?ou=Nullepart",
	"/en/search?quoi=Essai",
]) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}
