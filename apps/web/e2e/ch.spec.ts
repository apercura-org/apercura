import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Swiss market (/ch in German, /ch-fr in French, /ch-it in Italian) against the SYNTHETIC
 * database seeded from packages/etl/fixtures/ch (`bun run etl:ch --source-dir
 * packages/etl/fixtures/ch --offline`): fictitious hospitals, clinics, birth centres, nursing
 * homes and pharmacies of the FOPH's figures and the cantons' lists, placed in the Federal
 * Statistical Office's cantons, districts and communes, never real data.
 */

const LANGUAGES = ["de-CH", "fr-CH", "it-CH"] as const;
type SwissLocale = (typeof LANGUAGES)[number];

/** The prefix and the facility segment of each language. */
const PREFIX = { "de-CH": "/ch", "fr-CH": "/ch-fr", "it-CH": "/ch-it" } as const;
const FACILITY = {
	"de-CH": "einrichtung",
	"fr-CH": "etablissement",
	"it-CH": "struttura",
} as const;
const DIRECTORY = { "de-CH": "verzeichnis", "fr-CH": "annuaire", "it-CH": "elenco" } as const;
const SEARCH = { "de-CH": "suche", "fr-CH": "recherche", "it-CH": "cerca" } as const;

/** A facility's page in a language. */
const facility = (locale: SwissLocale, slug: string) =>
	`${PREFIX[locale]}/${FACILITY[locale]}/${slug}`;
/** Any other page (a listing, a hub) in a language: listing and place slugs never change. */
const page_ = (locale: SwissLocale, path: string) => `${PREFIX[locale]}${path}`;

const HOSPITAL = "stadtspital-musterberg-nord-h367757611";
const BASEL = "universitaetsspital-muster-basel-h225608997";
const CLINIC_GE = "clinique-exemple-sa-h767365986";
const LUGANO = "ospedale-esempio-h988571188";
const CLINIC_LUGANO = "clinica-esempio-h364086243";
const BIRTH = "geburtshaus-muster-h758508702";
const PSYCHIATRY = "psychiatrische-klinik-beispielhof-h708694888";
const GERIATRICS = "geriatriespital-fiktiv-bsh677392925";
const HOME_BE = "alterszentrum-beispiel-bee701093780";
const EMS_GE = "residence-les-exemples-gee990000000001";
const PHARMACY_BL = "apotheke-beispiel-liestal-blp7699999000001";
const PHARMACY_GE = "pharmacie-de-l-exemple-gep876101869";

/** What the raw lists name and the pages must never print (people, companies, e-mails). */
const FORBIDDEN = ["Fittizio", "Fiduciaria", "Fiktiva", "Erika", "example.ch", "fixture_user"];

/** Listing pages, the same slugs in every language. */
const LISTINGS = [
	"",
	"/spital",
	"/spital/zuerich",
	"/spital/bezirk-zuerich/zuerich",
	"/pflegeheim/zuerich",
	"/apotheke/geneve",
	"/apotheke/canton-de-geneve/geneve",
];

for (const locale of LANGUAGES) {
	const pages = [
		...LISTINGS.map((path) => page_(locale, path)),
		page_(locale, `/${DIRECTORY[locale]}`),
		page_(locale, `/${DIRECTORY[locale]}/zuerich`),
		facility(locale, HOSPITAL),
		facility(locale, EMS_GE),
		facility(locale, PHARMACY_BL),
		`${page_(locale, `/${SEARCH[locale]}`)}?quoi=Beispiel`,
	];
	for (const path of pages) {
		test(`${path} answers 200 in ${locale} with no axe violations`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
			await expect(page.locator("html")).toHaveAttribute("lang", locale);
			await expect(page.locator("main h1")).toBeVisible();
			const text = (await page.locator("body").textContent()) ?? "";
			for (const forbidden of FORBIDDEN) expect(text, forbidden).not.toContain(forbidden);
			// Swiss Standard German never writes "ß".
			if (locale === "de-CH") expect(text).not.toContain("ß");
			expect(await axeViolations(page)).toEqual([]);
		});
	}
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The hreflang alternates of a page, paths by hreflang. */
async function alternatesOf(page: Page): Promise<Record<string, string>> {
	const links = await page.locator('link[rel="alternate"][hreflang]').all();
	return Object.fromEntries(
		await Promise.all(
			links.map(async (link) => [
				(await link.getAttribute("hreflang")) ?? "",
				new URL((await link.getAttribute("href")) ?? "", "http://x").pathname,
			]),
		),
	);
}

const triplet = (path: (locale: SwissLocale) => string) =>
	Object.fromEntries(LANGUAGES.map((locale) => [locale, path(locale)]));

test("a hospital's page: its facts in the page's language, Swiss formats, no booking, credits", async ({
	page,
}) => {
	await page.goto(facility("de-CH", HOSPITAL));
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Stadtspital Musterberg Nord/);
	await expect(page.getByText("h367757611", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Musterbergstrasse 1", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("8050 Zürich", { exact: true }).first()).toBeVisible();
	await expect(
		page.getByText("Allgemeinspital, Zentrumsversorgung", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("Akutsomatik, Rehabilitation", { exact: true })).toBeVisible();
	await expect(page.getByText(/Das Spital hat eine Notfallstation\./)).toBeVisible();
	await expect(page.getByText("Stadtspital Musterberg AG", { exact: true })).toBeVisible();
	await expect(page.getByText("Öffentlich", { exact: true })).toBeVisible();
	// The attributions, in German: the FOPH's figures and the places.
	for (const attribution of [
		"Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler 2023",
		"Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz",
		"© swisstopo, Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter",
	]) {
		await expect(page.getByText(attribution, { exact: false }).first()).toBeVisible();
	}
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		new RegExp(`/ch/einrichtung/${HOSPITAL}$`),
	);
	// The same page in Switzerland's three languages, and nothing towards another market.
	expect(await alternatesOf(page)).toEqual(triplet((locale) => facility(locale, HOSPITAL)));

	const data = await graphOf(page);
	const hospital = data.find((item) => item["@type"] === "Hospital");
	expect(hospital.name).toBe("Stadtspital Musterberg Nord");
	expect(hospital.identifier).toMatchObject({ propertyID: "CH-BAG", value: "367757611" });
	expect(hospital.address).toMatchObject({ addressCountry: "CH", postalCode: "8050" });
	// City precision: no point is published, no pin is drawn.
	expect(hospital.geo).toBeUndefined();
	expect(hospital.potentialAction).toBeUndefined();
	expect(data.some((item) => ["Person", "IndividualPhysician"].includes(item["@type"]))).toBe(
		false,
	);
	const pageNode = data.find((item) => item["@type"] === "WebPage");
	expect(pageNode?.inLanguage).toBe("de-CH");
});

test("the same hospital in French and in Italian: the typology and the credits in that language", async ({
	page,
}) => {
	await page.goto(facility("fr-CH", HOSPITAL));
	await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
	await expect(
		page.getByText("Hôpital de soins généraux, prise en charge centralisée", { exact: true }),
	).toBeVisible();
	await expect(
		page
			.getByText(
				"Source : © Office fédéral de la santé publique (OFSP), Chiffres-clés des hôpitaux suisses 2023",
				{ exact: false },
			)
			.first(),
	).toBeVisible();
	expect((await graphOf(page)).find((item) => item["@type"] === "WebPage")?.inLanguage).toBe(
		"fr-CH",
	);
	await page.goto(facility("it-CH", HOSPITAL));
	await expect(
		page.getByText("Ospedale per cure generali, presa a carico centralizzata", { exact: true }),
	).toBeVisible();
	await expect(
		page
			.getByText("Fonte: UST – Elenco ufficiale dei Comuni della Svizzera", { exact: false })
			.first(),
	).toBeVisible();
	// The language menu leads to the same page in the other languages.
	const menu = page.getByRole("navigation", { name: "Lingua" });
	await menu.locator("summary").click();
	await expect(menu.getByRole("link", { name: "Deutsch" })).toHaveAttribute(
		"href",
		facility("de-CH", HOSPITAL),
	);
	await expect(menu.getByRole("link", { name: "Français" })).toHaveAttribute(
		"href",
		facility("fr-CH", HOSPITAL),
	);
});

test("a site completed from a canton's list credits both, with its phone and its map", async ({
	page,
}) => {
	await page.goto(facility("de-CH", BASEL));
	await expect(page.getByText("061 999 01 11", { exact: true }).first()).toBeVisible();
	await expect(
		page.getByText("Quelle: Kanton Basel-Stadt (geo.bs.ch), CC BY 4.0", { exact: false }).first(),
	).toBeVisible();
	const hospital = (await graphOf(page)).find((item) => item["@type"] === "Hospital");
	expect(hospital.telephone).toBe("+41619990111");
	// The list gave the site's coordinates: a point.
	expect(hospital.geo).toBeDefined();
	await page.goto(facility("fr-CH", CLINIC_GE));
	await expect(page.getByText("022 999 01 01", { exact: true }).first()).toBeVisible();
	await expect(
		page
			.getByText(
				/Source : Portail des données SITG \(État de Genève\), téléchargé en date du \d{1,2}/,
			)
			.first(),
	).toBeVisible();
	await expect(page.getByText("{date}", { exact: false })).toHaveCount(0);
});

test("each kind of facility has its structured type, never a person", async ({ page }) => {
	for (const [slug, type] of [
		[PSYCHIATRY, "Hospital"],
		[LUGANO, "Hospital"],
		[BIRTH, "MedicalClinic"],
		[PHARMACY_GE, "Pharmacy"],
		[HOME_BE, "MedicalOrganization"],
	] as const) {
		await page.goto(facility("de-CH", slug));
		const data = await graphOf(page);
		expect(
			data.some((item) => item["@type"] === type),
			slug,
		).toBe(true);
		expect(
			data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
			slug,
		).toBe(false);
	}
});

test("a list's own category, operator and the names it holds back", async ({ page }) => {
	await page.goto(facility("fr-CH", EMS_GE));
	await expect(page.locator('[lang="fr"]', { hasText: "EMS" }).first()).toBeVisible();
	await expect(page.getByText("022 999 10 00", { exact: true }).first()).toBeVisible();
	await page.goto(facility("de-CH", GERIATRICS));
	await expect(page.locator('[lang="de"]', { hasText: "Geriatriespital" }).first()).toBeVisible();
	await page.goto(facility("de-CH", HOME_BE));
	await expect(page.getByText("Stiftung Altersheime Muster", { exact: true })).toBeVisible();
	await page.goto(facility("it-CH", CLINIC_LUGANO));
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Clinica Esempio/);
	for (const forbidden of FORBIDDEN) {
		await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
	}
});

test("a wrong name part redirects to the canonical slug, in the page's language", async ({
	page,
}) => {
	const response = await page.goto("/ch-fr/etablissement/mauvais-nom-h367757611");
	expect(response?.url()).toMatch(new RegExp(`/ch-fr/etablissement/${HOSPITAL}$`));
	expect((await page.goto("/ch/einrichtung/nichts-h1"))?.status()).toBe(404);
	expect((await page.goto("/ch/einrichtung/nichts-367757611"))?.status()).toBe(404);
});

/*
 * What the pages say they cover follows the published facilities (issue #161): the fixtures
 * publish every list, Geneva's three included, so every canton with a list is named, in the
 * Federal Constitution's order.
 */
const COVERAGE = {
	homes: "Zürich, Bern, Basel-Stadt, Basel-Landschaft, Genf und Jura",
	hospitalLists: "Bern, Basel-Stadt, Genf und Jura",
	pharmaciesFr:
		"de Bâle-Campagne (toutes les pharmacies) et de Genève (seulement celles qui vaccinent)",
};

test("Switzerland lists by canton, district and commune, and says which cantons it covers", async ({
	page,
}) => {
	await page.goto("/ch/pflegeheim");
	await expect(
		page.getByText(
			`Alters- und Pflegeheime sind nur für die Kantone ${COVERAGE.homes} aufgeführt: Die Heime der anderen Kantone sind noch nicht erfasst.`,
		),
	).toBeVisible();
	await page.goto("/ch/spital/zuerich");
	await expect(
		page.getByText(`und den Spitallisten der Kantone ${COVERAGE.hospitalLists}.`, {
			exact: false,
		}),
	).toBeVisible();
	await page.goto("/ch-fr/apotheke");
	await expect(
		page.getByText(
			`Les pharmacies ne sont listées que pour les cantons ${COVERAGE.pharmaciesFr} : celles des autres cantons ne le sont pas encore.`,
			{ exact: false },
		),
	).toBeVisible();
	await page.goto("/ch/spital/zuerich");
	await expect(page.getByRole("link", { name: /^Bezirk Zürich/ }).first()).toBeVisible();
	expect(await robotsOf(page)).toBe("index, follow");
	await page.goto("/ch/spital/bezirk-zuerich/zuerich");
	await expect(
		page.getByRole("link", { name: /Stadtspital Musterberg Nord/ }).first(),
	).toBeVisible();
	await expect(page.getByText("Carte Vitale", { exact: false })).toHaveCount(0);
	expect(await alternatesOf(page)).toEqual(
		triplet((locale) => page_(locale, "/spital/bezirk-zuerich/zuerich")),
	);
	// A canton without districts: its stand-in district answers, never indexed.
	expect((await page.goto("/ch/apotheke/canton-de-geneve"))?.status()).toBe(200);
	expect(await robotsOf(page)).toBe("noindex, follow");
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
});

test("the directory groups the districts by canton", async ({ page }) => {
	await page.goto("/ch/verzeichnis");
	await expect(page.getByRole("heading", { name: /Zürich/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Bezirk Zürich/ }).first()).toBeVisible();
	expect(await alternatesOf(page)).toEqual(
		triplet((locale) => page_(locale, `/${DIRECTORY[locale]}`)),
	);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/spital"))?.status()).toBe(404);
	expect((await page.goto("/at/spital"))?.status()).toBe(404);
	expect((await page.goto("/ch/farmacie"))?.status()).toBe(404);
	expect((await page.goto("/ch/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto(`/fr/praticien/${HOSPITAL}`))?.status()).toBe(404);
	expect((await page.goto(`/it/struttura/${HOSPITAL}`))?.status()).toBe(404);
	expect((await page.goto("/ch/einrichtung/camille-exemple-19999990013"))?.status()).toBe(404);
	await page.goto("/ch/suche?quoi=Stadtspital%20Musterberg");
	await expect(
		page.getByRole("link", { name: /Stadtspital Musterberg Nord/ }).first(),
	).toBeVisible();
	await page.goto("/fr/recherche?quoi=Stadtspital%20Musterberg");
	await expect(page.getByRole("link", { name: /^Stadtspital Musterberg/ })).toHaveCount(0);
});

test("a kind of facility in a place goes to its listing, a doctor is not listed here yet", async ({
	page,
}) => {
	await page.goto("/ch/suche?quoi=Spital&ou=Z%C3%BCrich");
	await expect(page).toHaveURL(/\/ch\/spital\/bezirk-zuerich\/zuerich$/);
	await page.goto("/ch-fr/recherche?quoi=pharmacie&ou=Gen%C3%A8ve");
	await expect(page).toHaveURL(/\/ch-fr\/apotheke\/canton-de-geneve\/geneve$/);
	await page.goto("/ch-it/cerca?quoi=casa%20per%20anziani&ou=Zurigo");
	await expect(page).toHaveURL(/\/ch-it\/pflegeheim\/bezirk-zuerich\/zuerich$/);
	await page.goto("/ch/suche?quoi=Hausarzt");
	await expect(page.getByText(/nicht aufgeführt|nicht erfasst|noch nicht/).first()).toBeVisible();
	// It says what is listed instead, from the published lists.
	await expect(
		page.getByText(`die Alters- und Pflegeheime der Kantone ${COVERAGE.homes}`, { exact: false }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /Stadtspital Musterberg/ })).toHaveCount(0);
});

test("a search from another market moves to Switzerland in the visitor's language", async ({
	page,
}) => {
	await page.goto("/fr/recherche?quoi=pharmacie&ou=Gen%C3%A8ve");
	await expect(page).toHaveURL(/\/ch-fr\/apotheke\/canton-de-geneve\/geneve$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
	await page.goto("/it/cerca?quoi=ospedale&ou=Lugano");
	await expect(page).toHaveURL(/\/ch-it\/spital\/distretto-di-lugano\/lugano$/);
	await page.goto("/gb/search?quoi=hospital&ou=Zurich");
	await expect(page).toHaveURL(/\/ch\/spital\/bezirk-zuerich\/zuerich$/);
	await page.goto("/fr/recherche?ou=Suisse");
	await expect(page).toHaveURL(/\/ch-fr$/);
});

test("the Swiss homes list kinds and cantons, say which cantons are covered, and join the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/ch");
	await expect(page.getByRole("link", { name: /^Spitäler/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Zürich/ }).first()).toBeVisible();
	// The opening line and the sources' block name the cantons of the published lists.
	await expect(
		page.getByText(
			`Jedes Spital und jede Klinik der Schweiz hat schon eine Seite, ebenso die Alters- und Pflegeheime der Kantone ${COVERAGE.homes} und die Apotheken der Kantone Basel-Landschaft und Genf.`,
		),
	).toBeVisible();
	await expect(
		page.getByText(`Alters- und Pflegeheime: nur die Kantone ${COVERAGE.homes}.`, { exact: false }),
	).toBeVisible();
	await expect(page.getByText(/République et canton de Genève/).first()).toBeVisible();
	const alternates = await alternatesOf(page);
	expect(alternates["de-CH"]).toBe("/ch");
	expect(alternates["fr-CH"]).toBe("/ch-fr");
	expect(alternates["it-CH"]).toBe("/ch-it");
	expect(alternates["fr-FR"]).toBe("/fr");
	expect(alternates["x-default"]).toBe("/");
	const menu = page.getByRole("navigation", { name: "Sprache" });
	await menu.locator("summary").click();
	await expect(menu.getByRole("link")).toHaveText(["Deutsch", "Français", "Italiano"]);
	await page.goto("/ch-it");
	await expect(page.getByRole("link", { name: /^Ospedali/ }).first()).toBeVisible();
});

test("`/ch-de` is Switzerland's German pages, for good", async ({ request }) => {
	const response = await request.get("/ch-de/spital", { maxRedirects: 0 });
	expect(response.status()).toBe(301);
	expect(new URL(response.headers().location ?? "", "http://x").pathname).toBe("/ch/spital");
});

test("Switzerland's sitemaps list its pages in each language at its paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	for (const locale of LANGUAGES) {
		const segment = PREFIX[locale].slice(1);
		expect(index).toContain(`/sitemaps/${segment}/pages-0.xml`);
		expect(index).toContain(`/sitemaps/${segment}/praticiens-0.xml`);
		const pages = await (await request.get(`/sitemaps/${segment}/praticiens-0.xml`)).text();
		expect(pages).toContain(`${facility(locale, HOSPITAL)}</loc>`);
		expect(pages).not.toContain("/praticien/");
		const listings = await (await request.get(`/sitemaps/${segment}/listes-0.xml`)).text();
		expect(listings).toContain(`${page_(locale, "/spital/zuerich")}</loc>`);
		expect(listings).toContain(`${page_(locale, "/spital/bezirk-zuerich/zuerich")}</loc>`);
		// The stand-in districts' listings are never indexed.
		expect(listings).not.toContain(`${page_(locale, "/apotheke/canton-de-geneve")}</loc>`);
		const statics = await (await request.get(`/sitemaps/${segment}/pages-0.xml`)).text();
		expect(statics).toContain(`${PREFIX[locale]}</loc>`);
		expect(statics).not.toContain(`${PREFIX[locale]}/pro</loc>`);
	}
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/ch/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /ch/suche");
	expect(robots).toContain("Disallow: /ch-fr/recherche");
	expect(robots).toContain("Disallow: /ch-it/cerca");
});

test("a Swiss facility's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get(`/og/praticien/ch.${HOSPITAL}.png`);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get(`/og/praticien/${HOSPITAL}.png`)).status()).toBe(404);
});
