import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Latvian market (/lv) against the SYNTHETIC database seeded from packages/etl/fixtures/lv
 * (`bun run etl:lv --source-dir packages/etl/fixtures/lv --offline`, from
 * packages/etl/fixtures/generate-lv.ts): fictitious GP practices of the NVD's list, hospitals of
 * the Ministry of the Interior's list of medical institutions and pharmacies of the State Agency
 * of Medicines' register, placed in the State Address Register's state cities, municipalities,
 * towns and parishes, never real data.
 */

/** A GP practice in Rīga, one GP, no phone. */
const GP = "/lv/iestade/ilzes-paraugas-gimenes-arsta-prakse-g010000006";
/** Three GPs at two sites: Sigulda and More (Mores pagasts). */
const CENTRE = "/lv/iestade/paraugu-veselibas-centrs-g900000014";
const PHARMACY = "/lv/iestade/paraugu-aptieka-1-a900001";
const PHARMACY_BRANCH = "/lv/iestade/paraugu-aptiekas-1-aptiekas-filiale-ance-a900002";
/** A sole trader's pharmacy: its legal name names a person, never printed. */
const SOLE_TRADER = "/lv/iestade/izdomata-aptieka-a900004";
const HOSPITAL = "/lv/iestade/paraugu-regionala-slimnica-s9004";
const HOSPITAL_BRANCH = "/lv/iestade/paraugu-regionala-slimnica-filiale-mazsalaca-s9005";

const GP_LISTING = "/lv/gimenes-arstu-prakses";
const RIGA_GPS = "/lv/gimenes-arstu-prakses/riga";
const SIGULDA_GPS = "/lv/gimenes-arstu-prakses/siguldas-novads/sigulda";
const MORE_GPS = "/lv/gimenes-arstu-prakses/siguldas-novads/mores-pagasts";

test.use({ locale: "lv-LV" });

const PAGES = [
	"/lv",
	GP_LISTING,
	RIGA_GPS,
	"/lv/gimenes-arstu-prakses/siguldas-novads",
	SIGULDA_GPS,
	MORE_GPS,
	"/lv/slimnicas",
	"/lv/slimnicas/valmieras-novads",
	"/lv/aptiekas",
	"/lv/aptiekas/riga",
	"/lv/aptiekas/ventspils-novads/ances-pagasts",
	GP,
	CENTRE,
	PHARMACY,
	PHARMACY_BRANCH,
	SOLE_TRADER,
	HOSPITAL,
	HOSPITAL_BRANCH,
	"/lv/katalogs",
	"/lv/katalogs/riga",
	"/lv/katalogs/siguldas-novads",
	"/lv/katalogs/siguldas-novads/sigulda",
	"/lv/meklet?quoi=Paraugu",
];

/** What the raw lists hold and the pages must never print (people behind a company, e-mails). */
const FORBIDDEN = [
	"Annas Paraugas",
	"individuālais uzņēmums",
	"Sabiedrība ar ierobežotu atbildību",
	"example.test",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Latvian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "lv-LV");
		await expect(page.locator("main h1")).toBeVisible();
		const text = (await page.locator("body").textContent()) ?? "";
		for (const forbidden of FORBIDDEN) expect(text, forbidden).not.toContain(forbidden);
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The attributions the sources ask for, word for word (adapter `latvia.registries`). */
const NVD = "Avots: Nacionālais veselības dienests, data.gov.lv (CC0 1.0)";
const IEM_IC = "Avots: Iekšlietu ministrijas Informācijas centrs, data.gov.lv (CC0 1.0)";
const ZVA = "Avots: Zāļu valsts aģentūra, data.gov.lv (CC0 1.0)";
const VZD =
	"Izmantoti Valsts adrešu reģistra informācijas sistēmas dati (Valsts zemes dienests, CC BY 4.0), apvienoti ar citiem avotiem";

/** What the pages of other markets print and a Latvian page never does. */
const FOREIGN = ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "Pro Santé Connect"];

/** No page of a person, and no booking: Latvia lists places of care without online booking. */
async function expectNoPersonNorBooking(page: Page) {
	const data = await graphOf(page);
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	for (const item of data) expect(item.potentialAction, item["@type"]).toBeUndefined();
	await expect(page.getByRole("button", { name: /Pierakstīties/ })).toHaveCount(0);
	await expect(page.locator('a[href*="/rdv"], a[href*="/pieraksts"]')).toHaveCount(0);
}

test("a GP practice's page: the practice, its GP, no phone, no booking, its sources", async ({
	page,
}) => {
	await page.goto(GP);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Ilzes Paraugas ģimenes ārsta prakse/,
	);
	await expect(page.getByText("g010000006", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Parauga iela 1, Rīga", { exact: true }).first()).toBeVisible();
	// The practice names its GP as the NVD publishes them, never as a page of their own.
	await expect(page.getByText("Ģimenes ārsti", { exact: true })).toBeVisible();
	await expect(page.getByText("Ilze Parauga", { exact: true })).toBeVisible();
	await expect(page.getByText("Šai iestādei tālruņa numurs nav publicēts.")).toBeVisible();
	await expect(page.getByRole("link", { name: /^Zvanīt/ })).toHaveCount(0);
	for (const attribution of [NVD, IEM_IC, VZD]) {
		await expect(page.getByText(attribution, { exact: false }).first()).toBeVisible();
	}
	// A GP practice is not a pharmacy's register.
	await expect(page.getByText(ZVA, { exact: false })).toHaveCount(0);
	for (const foreign of FOREIGN) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${GP}$`));
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const clinic = data.find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.name).toBe("Ilzes Paraugas ģimenes ārsta prakse");
	expect(clinic.identifier).toMatchObject({ propertyID: "LV-GP", value: "010000006" });
	expect(clinic.address).toMatchObject({ addressCountry: "LV", addressLocality: "Rīga" });
	expect(clinic.telephone).toBeUndefined();
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("lv-LV");
	await expectNoPersonNorBooking(page);
});

test("a practice of three GPs at two sites: both addresses, both listings", async ({ page }) => {
	await page.goto(CENTRE);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Paraugu veselības centrs/);
	await expect(
		page.getByText("Anna Piemēre, Jānis Izdomāts, Līga Fiktīva", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("Piemēra iela 5", { exact: true }).first()).toBeVisible();
	await expect(page.getByText('"Paraugi"', { exact: true }).first()).toBeVisible();
	await expect(page.getByText("More, Mores pag., Siguldas nov.", { exact: true })).toBeVisible();
	const clinics = (await graphOf(page)).filter((item) => item["@type"] === "MedicalClinic");
	expect(clinics.map((clinic) => clinic.address.addressLocality)).toEqual([
		"Sigulda",
		"Mores pagasts",
	]);
	expect(clinics[0].identifier).toMatchObject({ propertyID: "LV-GP", value: "900000014" });
	await expectNoPersonNorBooking(page);
	// Listed in the town and the parish of each of its sites.
	for (const listing of [SIGULDA_GPS, MORE_GPS]) {
		await page.goto(listing);
		await expect(
			page.getByRole("link", { name: /Paraugu veselības centrs/ }).first(),
			listing,
		).toHaveAttribute("href", CENTRE);
	}
});

test("a pharmacy's page: Latvian phone formats, no online booking, the agency's register", async ({
	page,
}) => {
	await page.goto(PHARMACY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Paraugu aptieka 1/);
	await expect(page.getByText("a900001", { exact: true }).first()).toBeVisible();
	await expect(
		page.getByText("Parauga iela 10, Rīga, LV-1050", { exact: true }).first(),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /60 000 001/ }).first()).toHaveAttribute(
		"href",
		"tel:+37160000001",
	);
	await expect(
		page.getByText("Apercura Latvijā nepiedāvā pierakstu tiešsaistē.", { exact: false }),
	).toBeVisible();
	await expect(page.getByText("Aptieka vai filiāle", { exact: true })).toBeVisible();
	for (const attribution of [ZVA, VZD]) {
		await expect(page.getByText(attribution, { exact: false }).first()).toBeVisible();
	}
	// A pharmacy names no GP.
	await expect(page.getByText("Ģimenes ārsti", { exact: true })).toHaveCount(0);
	const pharmacy = (await graphOf(page)).find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.name).toBe("Paraugu aptieka 1");
	expect(pharmacy.identifier).toMatchObject({ propertyID: "LV-APT", value: "900001" });
	expect(pharmacy.telephone).toBe("+37160000001");
	expect(pharmacy.address).toMatchObject({
		addressCountry: "LV",
		addressLocality: "Rīga",
		postalCode: "LV-1050",
	});
	await expectNoPersonNorBooking(page);
});

test("a pharmacy's branch in a parish: its kind, its parish and municipality", async ({ page }) => {
	await page.goto(PHARMACY_BRANCH);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Paraugu aptiekas 1 aptiekas filiāle Ancē/,
	);
	await expect(page.getByText("Aptiekas filiāle", { exact: true })).toBeVisible();
	const crumbs = page.getByRole("navigation", { name: "Jūs atrodaties šeit" });
	await expect(crumbs.getByRole("link", { name: "Ventspils novads" }).first()).toHaveAttribute(
		"href",
		"/lv/aptiekas/ventspils-novads",
	);
	await expect(crumbs.getByRole("link", { name: "Ances pagasts" }).first()).toHaveAttribute(
		"href",
		"/lv/aptiekas/ventspils-novads/ances-pagasts",
	);
	const pharmacy = (await graphOf(page)).find((item) => item["@type"] === "Pharmacy");
	expect(pharmacy.address).toMatchObject({
		addressLocality: "Ances pagasts",
		postalCode: "LV-3612",
	});
	expect(pharmacy.telephone).toBe("+37160000002");
	// A sole trader's pharmacy: its trading name, never the person its legal name names.
	await page.goto(SOLE_TRADER);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Izdomātā aptieka/);
	await expect(page.getByText(/Annas Paraugas/)).toHaveCount(0);
});

test("a hospital and its branch are Hospital entities, each with its own page", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Paraugu reģionālā slimnīca/);
	await expect(page.getByText("s9004", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Slimnīca", { exact: true }).first()).toBeVisible();
	for (const attribution of [IEM_IC, VZD]) {
		await expect(page.getByText(attribution, { exact: false }).first()).toBeVisible();
	}
	await expect(page.getByText(NVD, { exact: false })).toHaveCount(0);
	await expect(page.getByText("Ģimenes ārsti", { exact: true })).toHaveCount(0);
	const hospital = (await graphOf(page)).find((item) => item["@type"] === "Hospital");
	expect(hospital.name).toBe("Paraugu reģionālā slimnīca");
	expect(hospital.identifier).toMatchObject({ propertyID: "LV-SLIM", value: "9004" });
	expect(hospital.address).toMatchObject({ addressCountry: "LV", addressLocality: "Valmiera" });
	await expectNoPersonNorBooking(page);

	await page.goto(HOSPITAL_BRANCH);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/filiāle Mazsalacā/);
	const branch = (await graphOf(page)).find((item) => item["@type"] === "Hospital");
	expect(branch.identifier).toMatchObject({ propertyID: "LV-SLIM", value: "9005" });
	expect(branch.address).toMatchObject({ addressLocality: "Mazsalaca" });
	await expectNoPersonNorBooking(page);
});

test("each kind of place has its structured type, never a person", async ({ page }) => {
	for (const [path, type] of [
		[GP, "MedicalClinic"],
		[CENTRE, "MedicalClinic"],
		[PHARMACY, "Pharmacy"],
		[PHARMACY_BRANCH, "Pharmacy"],
		[HOSPITAL, "Hospital"],
		[HOSPITAL_BRANCH, "Hospital"],
	] as const) {
		await page.goto(path);
		const data = await graphOf(page);
		expect(
			data.some((item) => item["@type"] === type),
			path,
		).toBe(true);
		expect(
			data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
			path,
		).toBe(false);
	}
});

test("the forms of a place live under its page: report, removal, this is me", async ({ page }) => {
	await page.goto(GP);
	for (const [name, form] of [
		[/Ziņot par kļūdu/, "zinot"],
		[/Sāciet šeit/, "dzesana"],
	] as const) {
		await expect(page.getByRole("link", { name }).first()).toHaveAttribute("href", `${GP}/${form}`);
	}
	await expect(page.locator(`a[href="${GP}/tas-esmu-es"]`).first()).toBeVisible();
	for (const form of ["zinot", "dzesana", "tas-esmu-es"]) {
		const response = await page.goto(`${GP}/${form}`);
		expect(response?.status(), form).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "lv-LV");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await robotsOf(page), form).toBe("noindex, nofollow");
		await expect(page.getByRole("link", { name: /Ilzes Paraugas/i }).first()).toHaveAttribute(
			"href",
			GP,
		);
		expect(await axeViolations(page), form).toEqual([]);
	}
	// Another market's form segments are not Latvia's.
	expect((await page.goto(`${GP}/signaler`))?.status()).toBe(404);
	expect((await page.goto(`${GP}/report`))?.status()).toBe(404);
});

test("the GP practice listings say only practices with a published address are listed", async ({
	page,
}) => {
	const note = page.getByText(
		/Ģimenes ārstu prakses ir iekļautas katalogā, ja to adrese ir Iekšlietu ministrijas ārstniecības iestāžu sarakstā/,
	);
	for (const path of [GP_LISTING, RIGA_GPS, MORE_GPS]) {
		await page.goto(path);
		await expect(note.first(), path).toBeVisible();
	}
	for (const path of ["/lv/aptiekas", "/lv/slimnicas/valmieras-novads"]) {
		await page.goto(path);
		await expect(note, path).toHaveCount(0);
	}
	// The listing of the country lists its state cities and municipalities.
	await page.goto(GP_LISTING);
	await expect(page.getByRole("link", { name: /^Rīga/ }).first()).toHaveAttribute("href", RIGA_GPS);
	await expect(page.getByRole("link", { name: /^Siguldas novads/ }).first()).toHaveAttribute(
		"href",
		"/lv/gimenes-arstu-prakses/siguldas-novads",
	);
	expect(await robotsOf(page)).toBe("index, follow");
	// A municipality lists its towns and parishes.
	await page.goto("/lv/gimenes-arstu-prakses/siguldas-novads");
	await expect(page.getByRole("link", { name: /^Sigulda/ }).first()).toHaveAttribute(
		"href",
		SIGULDA_GPS,
	);
	await expect(page.getByRole("link", { name: /^Mores pagasts/ }).first()).toHaveAttribute(
		"href",
		MORE_GPS,
	);
	await page.goto(RIGA_GPS);
	await expect(
		page.getByRole("link", { name: /Ilzes Paraugas ģimenes ārsta prakse/ }).first(),
	).toHaveAttribute("href", GP);
});

test("a state city is a municipality and a town at once: its town page is its own", async ({
	page,
}) => {
	for (const [from, to] of [
		["/lv/gimenes-arstu-prakses/riga/riga", RIGA_GPS],
		["/lv/aptiekas/daugavpils/daugavpils", "/lv/aptiekas/daugavpils"],
		["/lv/katalogs/riga/riga", "/lv/katalogs/riga"],
	] as const) {
		const response = await page.goto(from);
		expect(response?.url(), from).toMatch(new RegExp(`${to}$`));
		expect(response?.status(), from).toBe(200);
	}
	// Its listing lists its places, never a town below it.
	await page.goto(RIGA_GPS);
	await expect(page.locator('main a[href^="/lv/gimenes-arstu-prakses/riga/"]')).toHaveCount(0);
});

test("the directory groups the municipalities by region, then their towns and parishes", async ({
	page,
}) => {
	await page.goto("/lv/katalogs");
	for (const region of ["Kurzeme", "Latgale", "Rīgas reģions", "Vidzeme"]) {
		await expect(page.getByRole("heading", { name: region }).first()).toBeVisible();
	}
	await expect(page.getByRole("link", { name: /^Siguldas novads/ }).first()).toHaveAttribute(
		"href",
		"/lv/katalogs/siguldas-novads",
	);
	await expect(page.getByRole("link", { name: /^Rīga/ }).first()).toHaveAttribute(
		"href",
		"/lv/katalogs/riga",
	);
	await page.goto("/lv/katalogs/siguldas-novads");
	await expect(page.getByRole("link", { name: /^Mores pagasts/ }).first()).toHaveAttribute(
		"href",
		"/lv/katalogs/siguldas-novads/mores-pagasts",
	);
	await expect(page.getByRole("link", { name: /^Ģimenes ārstu prakses/ }).first()).toHaveAttribute(
		"href",
		"/lv/gimenes-arstu-prakses/siguldas-novads",
	);
	await page.goto("/lv/katalogs/siguldas-novads/sigulda");
	await expect(page.getByRole("link", { name: /^Aptiekas/ }).first()).toHaveAttribute(
		"href",
		"/lv/aptiekas/siguldas-novads/sigulda",
	);
});

test("a wrong name part redirects to the canonical Latvian slug", async ({ page }) => {
	const response = await page.goto("/lv/iestade/nepareizs-nosaukums-a900001");
	expect(response?.url()).toMatch(new RegExp(`${PHARMACY}$`));
	expect((await page.goto("/lv/iestade/nekas-a1"))?.status()).toBe(404);
	expect((await page.goto("/lv/iestade/nekas-g999999999"))?.status()).toBe(404);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/aptiekas"))?.status()).toBe(404);
	expect((await page.goto("/de/gimenes-arstu-prakses"))?.status()).toBe(404);
	expect((await page.goto("/lv/medecin-generaliste"))?.status()).toBe(404);
	expect((await page.goto("/lv/apotheken"))?.status()).toBe(404);
	expect((await page.goto("/lv/gp-practices"))?.status()).toBe(404);
	expect((await page.goto("/fr/praticien/paraugu-aptieka-1-a900001"))?.status()).toBe(404);
	expect((await page.goto("/gb/practice/paraugu-aptieka-1-a900001"))?.status()).toBe(404);
	expect((await page.goto("/lv/iestade/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/lv/iestade/the-example-surgery-a99001"))?.status()).toBe(404);
	await page.goto("/lv/meklet?quoi=Paraugu%20aptieka%201");
	await expect(page.getByRole("link", { name: /^Paraugu aptieka 1/ }).first()).toBeVisible();
	await page.goto("/fr/recherche?quoi=Paraugu%20aptieka%201");
	await expect(page.getByRole("link", { name: /^Paraugu aptieka 1/ })).toHaveCount(0);
});

test("everyday words go straight to their Latvian listing", async ({ page }) => {
	await page.goto(`/lv/meklet?quoi=${encodeURIComponent("slimnīca")}`);
	await expect(page).toHaveURL(/\/lv\/slimnicas$/);
	await page.goto(`/lv/meklet?quoi=aptieka&ou=${encodeURIComponent("Rīga")}`);
	await expect(page).toHaveURL(/\/lv\/aptiekas\/riga$/);
	await page.goto(`/lv/meklet?quoi=${encodeURIComponent("ģimenes ārsts")}&ou=Sigulda`);
	await expect(page).toHaveURL(new RegExp(`${SIGULDA_GPS}$`));
	await page.goto(`/lv/meklet?quoi=${encodeURIComponent("slimnīca")}&ou=Valmiera`);
	await expect(page).toHaveURL(/\/lv\/slimnicas\/valmieras-novads\/valmiera$/);
	// Dentists are not listed in Latvia yet: said so, with what is.
	await page.goto(`/lv/meklet?quoi=${encodeURIComponent("zobārsts")}`);
	await expect(page.getByRole("heading", { name: "„zobārsts” katalogā vēl nav" })).toBeVisible();
	await expect(
		page.getByText(/zobārstu, speciālistu un poliklīniku tajā nav/).first(),
	).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);
});

test("the Latvian home lists kinds and municipalities, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/lv");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Latvijā/);
	await expect(page.getByRole("link", { name: /^Ģimenes ārstu prakses/ }).first()).toHaveAttribute(
		"href",
		GP_LISTING,
	);
	await expect(page.getByRole("link", { name: /^Slimnīcas/ }).first()).toHaveAttribute(
		"href",
		"/lv/slimnicas",
	);
	await expect(page.getByRole("link", { name: /^Siguldas novads/ }).first()).toBeVisible();
	await expect(page.getByText(/data\.gov\.lv/).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="lv-LV"]')).toHaveAttribute(
		"href",
		/\/lv$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
	// One language: the country menu, no language menu.
	await expect(page.getByRole("navigation", { name: "Valsts" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Valoda" })).toHaveCount(0);
	// The search form chooses Latvia.
	await expect(page.getByRole("combobox", { name: "Valsts" })).toHaveValue("lv");
});

test("the international home lists Latvia as open", async ({ page }) => {
	await page.goto("/");
	const latvia = page.getByRole("link", { name: /Apercura Latvia/ });
	await expect(latvia).toHaveAttribute("href", "/lv");
	await expect(latvia).toHaveAttribute("hreflang", "lv-LV");
});

test("Latvia's sitemaps list its pages at their Latvian paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/lv/pages-0.xml");
	expect(index).toContain("/sitemaps/lv/praticiens-0.xml");
	const places = await (await request.get("/sitemaps/lv/praticiens-0.xml")).text();
	for (const path of [GP, CENTRE, PHARMACY, PHARMACY_BRANCH, HOSPITAL, HOSPITAL_BRANCH]) {
		expect(places).toContain(`${path}</loc>`);
	}
	expect(places).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/lv/listes-0.xml")).text();
	expect(listings).toContain(`${RIGA_GPS}</loc>`);
	expect(listings).toContain(`${MORE_GPS}</loc>`);
	// A state city's town page is its own: never a URL of its own.
	expect(listings).not.toContain("/lv/gimenes-arstu-prakses/riga/riga</loc>");
	const hubs = await (await request.get("/sitemaps/lv/lieux-0.xml")).text();
	expect(hubs).toContain("/lv/katalogs/riga</loc>");
	expect(hubs).toContain("/lv/katalogs/siguldas-novads/sigulda</loc>");
	expect(hubs).not.toContain("/lv/katalogs/riga/riga</loc>");
	const pages = await (await request.get("/sitemaps/lv/pages-0.xml")).text();
	for (const path of [
		"/lv",
		"/lv/katalogs",
		"/lv/par-projektu",
		"/lv/dati",
		"/lv/privatums",
		"/lv/juridiska-informacija",
		"/lv/lietosanas-noteikumi",
		"/lv/pieklustamiba",
	]) {
		expect(pages).toContain(`${path}</loc>`);
	}
	expect(pages).not.toContain("/lv/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/lv/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /lv/meklet");
});

test("a Latvian place's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get("/og/praticien/lv.paraugu-aptieka-1-a900001.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect((await request.get("/og/praticien/paraugu-aptieka-1-a900001.png")).status()).toBe(404);
});
