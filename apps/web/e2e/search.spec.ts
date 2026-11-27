import { expect, type Locator, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * Search over the SYNTHETIC directory imported from packages/etl/fixtures
 * (fictitious people such as Dr Jean-Pierre Fictif, RPPS 19999990021, a GP in
 * Paris 15e, and generated ESSAI* practitioners in every Paris arrondissement).
 */

const FICTIF_RPPS = "19999990021";
const FICTIF_PAGE = new RegExp(`/fr/praticien/jean-pierre-fictif-${FICTIF_RPPS}$`);

/**
 * Types `text` in a suggestion box until `option` is suggested. The box is printed before React
 * hydrates it, and text typed before then never opens the suggestions: under a loaded CI runner
 * the page's `load` can come first (#157, reproduced with the CPU slowed four times). A visitor
 * would type again; so does the test.
 */
async function typeUntilSuggested(box: Locator, text: string, option: Locator) {
	await expect(async () => {
		await box.fill("");
		await box.pressSequentially(text);
		await expect(option).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 15_000 });
}

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("a name search lists the practitioner with a link to the page", async ({ page }) => {
		await page.goto("/fr/recherche?quoi=Fictif");
		const results = page.getByRole("table", { name: "Résultats" });
		await expect(results).toBeVisible();
		const link = results.getByRole("link", { name: /Jean-Pierre Fictif/ });
		await expect(link).toHaveAttribute("href", FICTIF_PAGE);
		await link.click();
		await expect(page).toHaveURL(FICTIF_PAGE);
	});

	test("the home form submits Qui and Où and lands on results", async ({ page }) => {
		await page.goto("/fr");
		await page.getByLabel("Qui ?").fill("Essai");
		await page.getByLabel("Où ?").fill("75015");
		await page.getByRole("button", { name: "Chercher" }).click();
		await expect(page).toHaveURL(/\/recherche\?quoi=Essai&ou=75015&pays=fr$/);
		await expect(page.getByRole("table", { name: "Résultats" })).toBeVisible();
	});
});

test("a specialty and a place redirect (307) to the listing page", async ({ request }) => {
	const response = await request.get(
		`/fr/recherche?quoi=${encodeURIComponent("Médecin généraliste")}&ou=75015`,
		{ maxRedirects: 0 },
	);
	expect(response.status()).toBe(307);
	expect(response.headers().location).toMatch(
		/\/medecin-generaliste\/75-paris\/paris-15e-arrondissement$/,
	);
});

test("everyday words redirect (307) to their listing page, in every interface language", async ({
	request,
}) => {
	for (const [path, listing] of [
		["/fr/recherche?quoi=dentiste&ou=Paris", /\/fr\/chirurgien-dentiste\/75-paris$/],
		["/fr/recherche?quoi=Dentistes&ou=Paris", /\/fr\/chirurgien-dentiste\/75-paris$/],
		[
			`/fr/recherche?quoi=${encodeURIComponent("généraliste")}&ou=75015`,
			/\/fr\/medecin-generaliste\/75-paris\/paris-15e-arrondissement$/,
		],
		[
			`/fr/recherche?quoi=${encodeURIComponent("médecin traitant")}&ou=75015`,
			/\/fr\/medecin-generaliste\/75-paris\/paris-15e-arrondissement$/,
		],
		["/fr-en/search?quoi=dentist&ou=Paris", /\/fr-en\/[^/]+\/75-paris$/],
	] as const) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status(), path).toBe(307);
		expect(response.headers().location, path).toMatch(listing);
	}
});

test("a profession France does not list yet says so instead of an empty name search", async ({
	page,
}) => {
	await page.goto(`/fr/recherche?quoi=${encodeURIComponent("kinésithérapeute")}&ou=Paris`);
	await expect(
		page.getByRole("heading", { name: "« kinésithérapeute » n’est pas encore dans l’annuaire" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Aucun professionnel ne correspond" }),
	).toHaveCount(0);
	await page.goto("/fr-en/search?quoi=pharmacy");
	await expect(
		page.getByRole("heading", { name: "“pharmacy” is not in the directory yet" }),
	).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);
});

test("an RPPS number redirects (307) to the practitioner page", async ({ request }) => {
	const response = await request.get(`/fr/recherche?quoi=${FICTIF_RPPS}`, { maxRedirects: 0 });
	expect(response.status()).toBe(307);
	expect(response.headers().location).toMatch(FICTIF_PAGE);
});

test("an unknown RPPS number says honestly that there is no page", async ({ page }) => {
	await page.goto("/fr/recherche?quoi=19999990022");
	await expect(page.getByRole("heading", { name: /Aucune page publique/ })).toBeVisible();
});

test("“Qui ?” suggests practitioners and opens the chosen page", async ({ page }) => {
	await page.goto("/fr/recherche");
	const option = page.getByRole("option", { name: /Jean-Pierre Fictif/ });
	await typeUntilSuggested(page.getByRole("combobox", { name: "Qui ?" }), "Fict", option);
	await option.click();
	await expect(page).toHaveURL(FICTIF_PAGE);
});

test("“Où ?” suggests places with their department", async ({ page }) => {
	await page.goto("/fr-en/search");
	const option = page.getByRole("option", { name: /Paris 15e Arrondissement/ });
	await typeUntilSuggested(page.getByRole("combobox", { name: "Where?" }), "Paris 15", option);
	await option.click();
	await expect(page.getByRole("combobox", { name: "Where?" })).toHaveValue(
		"Paris 15e Arrondissement (75)",
	);
});

test("the home search gets its suggestions on first use, keeping the text and the focus", async ({
	page,
}) => {
	await page.goto("/fr");
	// The plain GET form until the visitor reaches it: no combo box code at load (the country
	// is a native select, a combo box to assistive tech, in both forms).
	await expect(page.getByLabel("Qui ?")).toHaveAttribute("type", "search");
	await expect(page.getByRole("combobox", { name: /^(Qui|Où) \?$/ })).toHaveCount(0);
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

test.describe("a place of another market", () => {
	/*
	 * The synthetic places of the other markets: Glasgow (UK dental and GP practices), Salzburg
	 * (Austrian dentists), Brno and Praha (Czech dentists), Paris (French dentists), Roma and
	 * Milano (Italian pharmacies and hospitals), Genève, Zürich and Lugano (Swiss pharmacies,
	 * hospitals and nursing homes).
	 */
	for (const [from, to] of [
		["/fr/recherche?quoi=dentiste&ou=Glasgow", "/gb/dental-practices/glasgow-city/glasgow"],
		["/fr/recherche?quoi=dentiste&ou=Salzburg", "/at/zahnaerzte/salzburg/salzburg"],
		["/fr/recherche?quoi=dentiste&ou=Praha", "/cz/zubni-lekar/praha"],
		["/fr/recherche?quoi=zubar&ou=Brno", "/cz/zubni-lekar/brno-mesto/brno"],
		// Spain: "dentiste" on /fr, "zubař" on /cz, "GP" on /gb, for Madrid; France in Spanish too.
		["/fr/recherche?quoi=dentiste&ou=Madrid", "/es/dentistas/madrid/madrid"],
		[`/cz/hledat?quoi=${encodeURIComponent("zubař")}&ou=Madrid`, "/es/dentistas/madrid/madrid"],
		["/gb/search?quoi=GP&ou=Madrid", "/es/centros-de-salud/madrid/madrid"],
		["/fr-es/buscar?quoi=farmacia&ou=Madrid", "/es/farmacias/madrid/madrid"],
		["/fr/recherche?quoi=dentiste&ou=Barcelona", "/es/dentistas/barcelona/barcelona"],
		// Spain by name: its home, never "not covered yet".
		["/fr/recherche?ou=Espagne", "/es"],
		["/es/buscar?quoi=dentista&ou=Paris", "/fr-es/chirurgien-dentiste/75-paris"],
		// Germany: "hôpital" on /fr, "hospital" on /es, "Klinik" on /fr-de, for Berlin, a kreisfreie
		// Stadt whose page is its Kreis's; "pharmacie" for Erfurt.
		[`/fr/recherche?quoi=${encodeURIComponent("hôpital")}&ou=Berlin`, "/de/krankenhaeuser/berlin"],
		["/es/buscar?quoi=hospital&ou=Berlin", "/de/krankenhaeuser/berlin"],
		["/fr-de/suche?quoi=Klinik&ou=Berlin", "/de/krankenhaeuser/berlin"],
		["/fr/recherche?quoi=pharmacie&ou=Erfurt", "/de/apotheken/erfurt"],
		[
			"/de/suche?quoi=Krankenhaus&ou=Unterhaching",
			"/de/krankenhaeuser/landkreis-muenchen/unterhaching",
		],
		// Germany lists no dentists: its search, with the place set; Germany by name: its home.
		["/fr/recherche?quoi=dentiste&ou=Berlin", "/de/suche?ou=Berlin"],
		["/fr/recherche?ou=Allemagne", "/de"],
		["/de/suche?quoi=Zahnarzt&ou=Paris", "/fr-de/chirurgien-dentiste/75-paris"],
		["/fr-en/search?quoi=GP&ou=Glasgow", "/gb/gp-practices/glasgow-city/glasgow"],
		// Italy, the city typed in French or English: its Italian name.
		["/fr/recherche?quoi=pharmacie&ou=Rome", "/it/farmacie/roma/roma"],
		["/fr/recherche?quoi=h%C3%B4pital&ou=Rome", "/it/ospedali/roma/roma"],
		["/gb/search?quoi=pharmacy&ou=Milan", "/it/farmacie/milano/milano"],
		["/fr-it/cerca?quoi=farmacia&ou=Roma", "/it/farmacie/roma/roma"],
		["/fr/recherche?ou=Rome", "/it/cerca?ou=Roma"],
		// Switzerland by name: its home in the visitor's language (French, Italian, else German).
		["/fr/recherche?ou=Suisse", "/ch-fr"],
		["/gb/search?ou=Switzerland", "/ch"],
		["/it/cerca?ou=Svizzera", "/ch-it"],
		["/at/suche?ou=Schweiz", "/ch"],
		// A doctor is not listed in Switzerland: its search, without the care it does not list.
		["/fr/recherche?quoi=m%C3%A9decin&ou=Suisse", "/ch-fr"],
		// A Swiss city in any language: Switzerland's listing, in the visitor's language.
		["/fr/recherche?quoi=pharmacie&ou=Gen%C3%A8ve", "/ch-fr/apotheke/canton-de-geneve/geneve"],
		["/fr/recherche?quoi=pharmacie&ou=Genf", "/ch-fr/apotheke/canton-de-geneve/geneve"],
		["/gb/search?quoi=hospital&ou=Zurich", "/ch/spital/bezirk-zuerich/zuerich"],
		["/it/cerca?quoi=ospedale&ou=Lugano", "/ch-it/spital/distretto-di-lugano/lugano"],
		["/at/suche?quoi=Pflegeheim&ou=Z%C3%BCrich", "/ch/pflegeheim/bezirk-zuerich/zuerich"],
		// In the visitor's language when that market offers it: France in English.
		["/gb/search?quoi=dentist&ou=Paris", "/fr-en/chirurgien-dentiste/75-paris"],
		// The UK lists no cardiologists: its search, with the place set.
		["/fr/recherche?quoi=cardiologue&ou=Glasgow", "/gb/search?ou=Glasgow"],
	] as const) {
		test(`${from} redirects (307) to ${to}`, async ({ request }) => {
			const response = await request.get(from, { maxRedirects: 0 });
			expect(response.status()).toBe(307);
			const location = new URL(response.headers().location ?? "", "http://localhost");
			expect(location.pathname + location.search).toBe(to);
		});
	}

	test("a search of the page's own market stays there", async ({ request }) => {
		const response = await request.get("/fr/recherche?quoi=dentiste&ou=Paris", {
			maxRedirects: 0,
		});
		expect(response.status()).toBe(307);
		expect(response.headers().location).toMatch(/\/fr\/chirurgien-dentiste\/75-paris$/);
	});
});

test.describe("the country searched", () => {
	test("is the page's market, and another one moves the search there", async ({ page }) => {
		await page.goto("/fr/recherche");
		const country = page.getByRole("combobox", { name: "Pays" });
		await expect(country).toHaveValue("fr");
		await expect(country.getByRole("option")).toHaveText([
			"France",
			"Autriche",
			"Royaume-Uni",
			"Tchéquie",
			"Espagne",
			"Italie",
			"Allemagne",
			"Suisse",
		]);
		await country.selectOption({ label: "Royaume-Uni" });
		// The places suggested are the UK's.
		await typeUntilSuggested(
			page.getByRole("combobox", { name: "Où ?" }),
			"Glasg",
			page.getByRole("option", { name: /Glasgow/ }).first(),
		);
		await page.getByRole("combobox", { name: "Où ?" }).fill("");
		await page.getByRole("combobox", { name: "Qui ?" }).fill("dentiste");
		await page.getByRole("button", { name: "Chercher", includeHidden: true }).click();
		await expect(page).toHaveURL(/\/gb\/dental-practices$/);
	});

	test("is printed in the market's language on its pages", async ({ page }) => {
		await page.goto("/cz/hledat");
		await expect(page.getByRole("combobox", { name: "Země" })).toHaveValue("cz");
		await page.goto("/at/suche");
		await expect(page.getByRole("combobox", { name: "Land" })).toHaveValue("at");
		await page.goto("/es/buscar");
		await expect(page.getByRole("combobox", { name: "País" })).toHaveValue("es");
		await page.goto("/fr-es/buscar");
		await expect(page.getByRole("combobox", { name: "País" })).toHaveValue("fr");
		await page.goto("/de/suche");
		await expect(page.getByRole("combobox", { name: "Land" })).toHaveValue("de");
		await page.goto("/fr-de/suche");
		await expect(page.getByRole("combobox", { name: "Land" })).toHaveValue("fr");
		// Switzerland, in each of its languages: one market, `ch`.
		await page.goto("/ch/suche");
		await expect(page.getByRole("combobox", { name: "Land" })).toHaveValue("ch");
		await page.goto("/ch-fr/recherche");
		await expect(page.getByRole("combobox", { name: "Pays" })).toHaveValue("ch");
		await page.goto("/ch-it/cerca");
		await expect(page.getByRole("combobox", { name: "Paese" })).toHaveValue("ch");
	});

	test.describe("without JavaScript", () => {
		test.use({ javaScriptEnabled: false });

		test("the home form submits the country chosen", async ({ page }) => {
			await page.goto("/fr");
			await page.getByLabel("Qui ?").fill("dentiste");
			await page.getByRole("combobox", { name: "Pays" }).selectOption("cz");
			await page.getByRole("button", { name: "Chercher" }).click();
			await expect(page).toHaveURL(/\/cz\/zubni-lekar$/);
		});
	});
});

test.describe("a place in a country Apercura does not cover yet", () => {
	const OPEN_COUNTRIES = [
		["France", "/fr"],
		["Autriche", "/at"],
		["Royaume-Uni", "/gb"],
		["Tchéquie", "/cz"],
		["Espagne", "/es"],
		["Italie", "/it"],
		["Allemagne", "/de"],
		["Suisse", "/ch-fr"],
	] as const;

	test("“dentiste” in Warszawa says so, lists the open countries, and passes axe", async ({
		page,
	}) => {
		const response = await page.goto("/fr/recherche?quoi=dentiste&ou=Warszawa");
		// Rendered on the search page itself, not sent to another market.
		expect(response?.status()).toBe(200);
		await expect(page).toHaveURL(/\/fr\/recherche\?quoi=dentiste&ou=Warszawa$/);
		await expect(
			page.getByRole("heading", { name: "Apercura ne couvre pas encore la Pologne" }),
		).toBeVisible();
		const main = page.getByRole("main");
		for (const [name, href] of OPEN_COUNTRIES) {
			await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
		}
		// Not the generic answer for a place nobody knows.
		await expect(page.getByText("Nous ne connaissons pas le lieu")).toHaveCount(0);
		expect(await axeViolations(page)).toEqual([]);
	});

	test("a country typed in “Où ?” is named, in the visitor's language", async ({ page }) => {
		await page.goto("/fr-en/search?quoi=dentist&ou=Pologne");
		await expect(
			page.getByRole("heading", { name: "Apercura does not cover Poland yet" }),
		).toBeVisible();
		await expect(page.getByRole("main").getByRole("link", { name: "France" })).toHaveAttribute(
			"href",
			"/fr-en",
		);
		await expect(
			page.getByRole("main").getByRole("link", { name: "United Kingdom" }),
		).toHaveAttribute("href", "/gb");
	});

	test("an open country typed in “Où ?” moves the search to that market (307)", async ({
		request,
	}) => {
		const response = await request.get("/fr/recherche?ou=Autriche", { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(new URL(response.headers().location ?? "", "http://localhost").pathname).toBe("/at");
	});
});

for (const path of [
	"/fr/recherche?quoi=Essai&ou=75015",
	"/fr/recherche",
	"/fr/recherche?quoi=Zzzzzz",
	"/fr/recherche?ou=Nullepart",
	"/fr-en/search?quoi=Essai",
]) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}
