import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Spanish market (/es) against the SYNTHETIC database seeded from packages/etl/fixtures/es
 * (`bun run etl:places --country es --source-dir packages/etl/fixtures/es`, then
 * `bun run etl:es --source-dir packages/etl/fixtures/es --offline`): fictitious REGCESS centres
 * placed in the IGN's communities, provinces and municipalities, never real data.
 */

const DENTAL = "/es/centro/clinica-dental-ejemplo-centro-1328900001";
const HEALTH_CENTRE = "/es/centro/centro-de-salud-ejemplo-sol-1328900002";
const PHARMACY = "/es/centro/farmacia-ejemplo-mayor-1328900003";
const HOSPITAL = "/es/centro/hospital-general-ejemplo-1328900004";
const CARDIOLOGY = "/es/centro/consulta-de-cardiologia-ejemplo-1328900005";
const PSYCHOLOGY = "/es/centro/consulta-de-psicologia-sanitaria-ejemplo-1328900006";
const LOCAL_CLINIC = "/es/centro/consultorio-local-ejemplo-norte-1328900007";
const MADRID_DENTISTS = "/es/dentistas/madrid/madrid";

test.use({ locale: "es-ES" });

const PAGES = [
	"/es",
	"/es/dentistas",
	"/es/dentistas/madrid",
	MADRID_DENTISTS,
	"/es/farmacias/madrid/madrid",
	"/es/centros-de-salud/madrid/madrid",
	"/es/cardiologos",
	DENTAL,
	HEALTH_CENTRE,
	PHARMACY,
	HOSPITAL,
	CARDIOLOGY,
	PSYCHOLOGY,
	LOCAL_CLINIC,
	"/es/directorio",
	"/es/directorio/madrid",
	"/es/directorio/madrid/madrid",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Spanish with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The Ministry of Health asks for the source and the date of its last update. */
const REGCESS = /Fuente: Ministerio de Sanidad, REGCESS, actualizado \d{1,2} de [a-z]+ de \d{4}/;
/** The IGN's attribution of a derived work (adapter `spain.registries`), word for word. */
const IGN = "Obra derivada de Líneas Límite Municipales e IGR Poblaciones 2025 CC-BY 4.0 ign.es";

test("a dental clinic's page: the centre, Spanish formats, no booking, dated source", async ({
	page,
}) => {
	await page.goto(DENTAL);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Clinica Dental Ejemplo Centro/);
	await expect(page.getByText("1328900001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Calle Alcala, 10", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("28014 Madrid", { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /910 000 001/ }).first()).toHaveAttribute(
		"href",
		"tel:+34910000001",
	);
	await expect(page.getByText(/no ofrece cita en línea/).first()).toBeVisible();
	await expect(page.getByText(REGCESS).first()).toBeVisible();
	await expect(page.getByText(IGN, { exact: false }).first()).toBeVisible();
	// City precision: the register publishes no coordinates, so no map pin.
	await expect(page.locator(".maplibregl-map")).toHaveCount(0);
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/es\/centro\/clinica-dental-ejemplo-centro-1328900001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const dentist = data.find((item) => item["@type"] === "Dentist");
	expect(dentist.name).toBe("Clinica Dental Ejemplo Centro");
	expect(dentist.identifier).toMatchObject({ propertyID: "ES-REGCESS", value: "1328900001" });
	expect(dentist.address).toMatchObject({ addressCountry: "ES", postalCode: "28014" });
	expect(dentist.geo).toBeUndefined();
	expect(dentist.potentialAction).toBeUndefined();
	expect(
		data.some((item) => ["Person", "IndividualPhysician", "Physician"].includes(item["@type"])),
	).toBe(false);
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("es-ES");
});

test("a practice names its specialty, its care units and its ownership", async ({ page }) => {
	await page.goto(CARDIOLOGY);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		/Consulta de Cardiologia Ejemplo/,
	);
	await expect(page.getByText("Oferta asistencial", { exact: true })).toBeVisible();
	await expect(page.getByText(/Cardiología/).first()).toBeVisible();
	await expect(page.getByText("Titularidad", { exact: true })).toBeVisible();
	const clinic = (await graphOf(page)).find((item) => item["@type"] === "MedicalClinic");
	expect(clinic.medicalSpecialty).toBe("https://schema.org/Cardiovascular");
});

test("a local surgery reads as such in the health centres' listing", async ({ page }) => {
	await page.goto(LOCAL_CLINIC);
	await expect(page.getByText("Consultorio local", { exact: true }).first()).toBeVisible();
	await page.goto("/es/centros-de-salud/madrid/madrid");
	await expect(page.getByRole("link", { name: /Consultorio Local Ejemplo Norte/ })).toBeVisible();
});

test("hospitals, dental clinics and pharmacies are Hospital, Dentist and Pharmacy entities", async ({
	page,
}) => {
	await page.goto(HOSPITAL);
	expect((await graphOf(page)).some((item) => item["@type"] === "Hospital")).toBe(true);
	await page.goto(PHARMACY);
	expect((await graphOf(page)).some((item) => item["@type"] === "Pharmacy")).toBe(true);
});

test("a wrong name part redirects to the canonical Spanish slug", async ({ page }) => {
	const response = await page.goto("/es/centro/nombre-erroneo-1328900001");
	expect(response?.url()).toMatch(/\/es\/centro\/clinica-dental-ejemplo-centro-1328900001$/);
	expect((await page.goto("/es/centro/nada-2328900001"))?.status()).toBe(404);
});

test("each market lists only its own pages and slugs", async ({ page }) => {
	expect((await page.goto("/fr/dentistas"))?.status()).toBe(404);
	expect((await page.goto("/fr-es/dentistas"))?.status()).toBe(404);
	expect((await page.goto("/es/chirurgien-dentiste"))?.status()).toBe(404);
	expect((await page.goto("/es/zubni-lekar"))?.status()).toBe(404);
	expect((await page.goto("/es/gp-practices"))?.status()).toBe(404);
	expect(
		(await page.goto("/fr/praticien/clinica-dental-ejemplo-centro-1328900001"))?.status(),
	).toBe(404);
	expect((await page.goto("/es/centro/camille-exemple-19999990013"))?.status()).toBe(404);
	expect((await page.goto("/es/centro/mudr-jana-ukazkova-900001"))?.status()).toBe(404);
	await page.goto("/es/buscar?quoi=Clinica%20Dental%20Ejemplo");
	await expect(
		page.getByRole("link", { name: /Clinica Dental Ejemplo Centro/ }).first(),
	).toBeVisible();
	await page.goto("/fr/recherche?quoi=Clinica%20Dental%20Ejemplo");
	await expect(page.getByRole("link", { name: /Clinica Dental Ejemplo Centro/ })).toHaveCount(0);
});

test("everyday words go straight to their Spanish listing", async ({ page }) => {
	await page.goto("/es/buscar?quoi=dentista");
	await expect(page).toHaveURL(/\/es\/dentistas$/);
	await page.goto(`/es/buscar?quoi=${encodeURIComponent("médico de cabecera")}&ou=Madrid`);
	await expect(page).toHaveURL(/\/es\/centros-de-salud\/madrid\/madrid$/);
	await page.goto("/es/buscar?quoi=farmacia&ou=Madrid");
	await expect(page).toHaveURL(/\/es\/farmacias\/madrid\/madrid$/);
	await page.goto(`/es/buscar?quoi=${encodeURIComponent("óptica")}`);
	await expect(
		page.getByRole("heading", { name: "«óptica» todavía no figura en el directorio" }),
	).toBeVisible();
});

test("the Spanish home lists kinds and provinces, and joins the homes' hreflang", async ({
	page,
}) => {
	await page.goto("/es");
	await expect(page.getByRole("link", { name: /Dentistas/ }).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Madrid/ }).first()).toBeVisible();
	await expect(page.locator('link[rel="alternate"][hreflang="es-ES"]')).toHaveAttribute(
		"href",
		/\/es$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang="fr-FR"]')).toHaveAttribute(
		"href",
		/\/fr$/,
	);
});

test("France in Spanish stays at /fr-es and is never indexed", async ({ page }) => {
	const response = await page.goto("/fr-es");
	expect(response?.status()).toBe(200);
	// France's Spanish interface: the language alone, Spain's pages are `es-ES`.
	await expect(page.locator("html")).toHaveAttribute("lang", "es");
	expect(await robotsOf(page)).toBe("noindex, follow");
});

test("Spain's sitemaps list its pages at their Spanish paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/es/pages-0.xml");
	expect(index).toContain("/sitemaps/es/praticiens-0.xml");
	const centres = await (await request.get("/sitemaps/es/praticiens-0.xml")).text();
	expect(centres).toContain(`${DENTAL}</loc>`);
	expect(centres).not.toContain("/praticien/");
	const listings = await (await request.get("/sitemaps/es/listes-0.xml")).text();
	expect(listings).toContain(`${MADRID_DENTISTS}</loc>`);
	const places = await (await request.get("/sitemaps/es/lieux-0.xml")).text();
	expect(places).toContain("/es/directorio/madrid</loc>");
	const pages = await (await request.get("/sitemaps/es/pages-0.xml")).text();
	expect(pages).toContain("/es/privacidad</loc>");
	expect(pages).toContain("/es/accesibilidad</loc>");
	expect(pages).toContain("/es/datos</loc>");
	expect(pages).not.toContain("/es/pro</loc>");
	const french = await (await request.get("/sitemaps/fr/praticiens-0.xml")).text();
	expect(french).not.toContain("/es/");
	const robots = await (await request.get("/robots.txt")).text();
	expect(robots).toContain("Disallow: /es/buscar");
});

test("a Spanish centre's Open Graph image is found by its marked segment", async ({ request }) => {
	const response = await request.get(
		"/og/praticien/es.clinica-dental-ejemplo-centro-1328900001.png",
	);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect(
		(await request.get("/og/praticien/clinica-dental-ejemplo-centro-1328900001.png")).status(),
	).toBe(404);
});
