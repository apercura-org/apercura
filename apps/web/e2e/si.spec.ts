import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The Slovenian market (/si) against the SYNTHETIC database seeded from packages/etl/fixtures/si
 * (`bun run etl:si --source-dir packages/etl/fixtures/si --offline`): fictitious personal doctors
 * of the health insurer's lists, placed in the register's statistical regions and municipalities,
 * never real data.
 */

/** A family doctor taking new patients, at a health centre in Ljubljana. */
const FAMILY_DOCTOR = "/si/zdravnik/ana-primer-si90001";
/** A dentist taking adults but not young people, in Vojnik. */
const DENTIST = "/si/zdravnik/ana-primernik-si90008";
/** A family doctor in a village of Celje, under Škofja vas's post office. */
const VILLAGE = "/si/zdravnik/nina-vzorec-kos-si90003";

test.use({ locale: "sl-SI" });

const PAGES = [
	"/si",
	"/si/druzinski-zdravnik",
	"/si/druzinski-zdravnik/osrednjeslovenska",
	"/si/druzinski-zdravnik/osrednjeslovenska/ljubljana",
	"/si/zobozdravnik",
	"/si/ginekolog",
	"/si/otroski-zdravnik",
	FAMILY_DOCTOR,
	DENTIST,
	VILLAGE,
	"/si/imenik",
	"/si/imenik/osrednjeslovenska",
	"/si/imenik/osrednjeslovenska/ljubljana",
	"/si/iskanje?quoi=zobar&ou=Ljubljana",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Slovenian with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("html")).toHaveAttribute("lang", "sl-SI");
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

const robotsOf = (page: Page) => page.locator('meta[name="robots"]').getAttribute("content");

const graphOf = async (page: Page) =>
	(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(
		(text) => JSON.parse(text)["@graph"],
	);

/** The credit CC BY 4.0 asks for, word for word (adapter `slovenia.registries`). */
const ZZZS =
	"Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0";

test("a family doctor's page: named as the list names them, whether they take new patients, the credits", async ({
	page,
}) => {
	await page.goto(FAMILY_DOCTOR);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Ana Primer/);
	await expect(page.getByText("90001", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Zdravstveni dom Primer Ljubljana").first()).toBeVisible();
	await expect(page.getByText("Primerna ulica 12", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("1000 Ljubljana", { exact: true }).first()).toBeVisible();
	// Whether the doctor takes new patients, as the insurer's list of that day says.
	await expect(page.getByText("Splošna ambulanta", { exact: true })).toBeVisible();
	await expect(page.getByText("Sprejema nove paciente", { exact: true })).toBeVisible();
	await expect(
		page.getByText(/Seznam ZZZS na dan 26\. november 2026 · Vir: ZZZS, CC BY 4\.0/),
	).toBeVisible();
	await expect(
		page.getByText(`${ZZZS}, stanje 26. 11. 2026`, { exact: false }).first(),
	).toBeVisible();
	await expect(
		page
			.getByText(
				"Vir: Geodetska uprava Republike Slovenije, Register prostorskih enot, stanje 20. 11. 2026",
				{
					exact: false,
				},
			)
			.first(),
	).toBeVisible();
	for (const foreign of ["Carte Vitale", "RPPS", "ameli", "NHS", "Assurance Maladie", "NRPZS"]) {
		await expect(page.getByText(foreign, { exact: false })).toHaveCount(0);
	}
	expect(await robotsOf(page)).toBe("index, follow");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		/\/si\/zdravnik\/ana-primer-si90001$/,
	);
	await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

	const data = await graphOf(page);
	const physician = data.find((item) => item["@type"] === "IndividualPhysician");
	expect(physician.name).toBe("Ana Primer");
	expect(physician.identifier).toMatchObject({ propertyID: "SI-ZZZS", value: "90001" });
	expect(physician.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
	expect(physician.potentialAction).toBeUndefined();
	const pageNode = data.find(
		(item) => item["@type"] === "ProfilePage" || item["@type"] === "WebPage",
	);
	expect(pageNode?.inLanguage).toBe("sl-SI");
});

test("a dentist's page says, per activity, whom the dentist still takes on", async ({ page }) => {
	await page.goto(DENTIST);
	await expect(page.getByText("Zobozdravstvo za odrasle", { exact: true })).toBeVisible();
	await expect(page.getByText("Zobozdravstvo za otroke in mladino", { exact: true })).toBeVisible();
	await expect(page.getByText("Sprejema nove paciente", { exact: true })).toHaveCount(1);
	await expect(page.getByText("Ne sprejema novih pacientov", { exact: true })).toHaveCount(1);
	await expect(page.getByText("Celjska cesta 24 b", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("3212 Vojnik", { exact: true }).first()).toBeVisible();
	expect((await graphOf(page)).some((item) => item["@type"] === "Dentist")).toBe(true);
});

test("a village's practice is written with its post office, not its municipality", async ({
	page,
}) => {
	await page.goto(VILLAGE);
	await expect(page.getByText("Zadobrova 49 b", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("3211 Škofja vas", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("3211 Celje", { exact: true })).toHaveCount(0);
});

test("a wrong name part redirects to the canonical Slovenian slug, a malformed key is a 404", async ({
	page,
}) => {
	const response = await page.goto("/si/zdravnik/napacno-ime-si90001");
	expect(response?.url()).toMatch(/\/si\/zdravnik\/ana-primer-si90001$/);
	expect((await page.goto("/si/zdravnik/ana-primer-90001"))?.status()).toBe(404);
	expect((await page.goto("/si/zdravnik/nihce-si99999999"))?.status()).toBe(404);
});

test("a listing names its doctors with whether each takes new patients", async ({ page }) => {
	await page.goto("/si/druzinski-zdravnik/osrednjeslovenska/ljubljana");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Ljubljana");
	const row = page.locator("tr", { has: page.locator('a[href$="/ana-primer-si90001"]') });
	await expect(row).toContainText("Sprejema nove paciente");
	await expect(row).toContainText("Primerna ulica 12, 1000 Ljubljana");
	expect(await robotsOf(page)).toBe("index, follow");
});

test("the Slovenian search reads Slovenian words, and a place of Slovenia from another market", async ({
	page,
}) => {
	await page.goto("/si/iskanje?quoi=zobar&ou=Ljubljana");
	await expect(page).toHaveURL(/\/si\/zobozdravnik\/osrednjeslovenska\/ljubljana$/);
	await page.goto("/fr/recherche?quoi=dentiste&ou=Ljubljana");
	await expect(page).toHaveURL(/\/si\/zobozdravnik\/osrednjeslovenska\/ljubljana$/);
	await page.goto("/fr/recherche?ou=Slov%C3%A9nie");
	await expect(page).toHaveURL(/\/si$/);
});

test("Slovenia's sitemaps list its pages at their Slovenian paths", async ({ request }) => {
	const index = await (await request.get("/sitemap.xml")).text();
	expect(index).toContain("/sitemaps/si/pages-0.xml");
	const pages = await (await request.get("/sitemaps/si/pages-0.xml")).text();
	expect(pages).toContain("/si/pravno-obvestilo");
	expect(pages).toContain("/si/dostopnost");
	const doctors = await (await request.get("/sitemaps/si/praticiens-0.xml")).text();
	expect(doctors).toContain("/si/zdravnik/ana-primer-si90001");
	expect(doctors).not.toContain("/praticien/");
});
