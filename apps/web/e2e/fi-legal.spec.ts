import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the Finnish market (`/fi`), written for Finnish law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/fi/oikeudelliset-tiedot",
	"/fi/tietosuoja",
	"/fi/kayttoehdot",
	"/fi/saavutettavuus",
	"/fi/aineisto",
] as const;

/** The Finnish Service Catalogue's credit, word for word, and Statistics Finland's. */
const PTV = "Lähde: Suomi.fi-palvelutietovaranto, Digi- ja väestötietovirasto (CC0 1.0)";
const STATISTICS_FINLAND = /Lähde: Tilastokeskus, kuntapohjaiset tilastointialueet \d{4}/;

test.use({ locale: "fi-FI" });

for (const path of PAGES) {
	test(`${path} answers 200 in Finnish with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "fi-FI");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"BDSG",
			"InfoTS",
			"LOPDGDD",
			"HDS",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites Act 917/2014, says why there is no booking, its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/fi/oikeudelliset-tiedot");
	await expect(page.getByText(/917\/2014/).first()).toBeVisible();
	await expect(page.getByText(/784\/2021/).first()).toBeVisible();
	await expect(page.getByText(/kuluttajansuojalaki 38\/1978/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the Data Protection Ombudsman and the article 14 information", async ({
	page,
}) => {
	await page.goto("/fi/tietosuoja");
	await expect(page.getByText(/1050\/2018/).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /Tietosuojavaltuutetun toimisto/ })).toHaveAttribute(
		"href",
		/tietosuoja\.fi/,
	);
	await expect(page.getByText(/Lintulahdenkuja 4, 00530 Helsinki/).first()).toBeVisible();
	// Places, never people.
	await expect(page.getByText(/Paikkoja, ei ihmisiä/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/fi/tietosuoja", "/fi/aineisto"]) {
		await page.goto(path);
		await expect(page.getByText(PTV, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(STATISTICS_FINLAND).first()).toBeVisible();
	}
});

test("the data page says the catalogue is CC0, and what is not listed", async ({ page }) => {
	await page.goto("/fi/aineisto");
	await expect(page.getByRole("link", { name: /CC0 1\.0 -luovutus/ }).first()).toHaveAttribute(
		"href",
		"https://creativecommons.org/publicdomain/zero/1.0/legalcode",
	);
	await expect(
		page.getByRole("link", { name: /Suomi\.fi-palvelutietovaranto avoindata\.fi-palvelussa/ }),
	).toHaveAttribute("href", /avoindata\.suomi\.fi\/data\/fi\/dataset\/palvelutietovaranto/);
	await expect(page.getByText(/Ei mukana: apteekit/).first()).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Finnish objection form", () => {
	// A key in the fixtures' range (`e5e0`) the fixtures never use (kind 9).
	const nationalId = `e5e00009000040008000${String(Math.floor(Math.random() * 1e9)).padStart(12, "0")}`;
	const slug = `vastustus-esimerkki-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('FI', 'FI-PTV', ${nationalId}, '', 'Vastustus Esimerkki', '', 'Vastustus Esimerkki',
					'FI_HEALTH_CENTRE', ${slug}, false)
				RETURNING id
			`;
			practitionerId = row?.id ?? 0;
		} finally {
			await sql.end();
		}
	});

	test.afterAll(async () => {
		const sql = testDb();
		try {
			await sql`DELETE FROM directory.practitioners WHERE id = ${practitionerId}`;
		} finally {
			await sql.end();
		}
	});

	test("withholds a page found by its address, answering in Finnish", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs use 10.92 to 10.97 or the default client.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.173.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/fi/aineisto#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/fi/toimipiste/${slug}`);
		await form.getByLabel(/sähköposti/i).fill("vastustus@example.test");
		// React Aria draws the box over the native input.
		await form.getByRole("checkbox").check({ force: true });
		await form.getByRole("button").click();
		await expect(statusMessages(page)).toBeVisible();
		const sql = testDb();
		try {
			const [row] = await sql<{ withheld: boolean; locale: string }[]>`
				SELECT p.withheld_at IS NOT NULL AS withheld, r.locale
				FROM directory.practitioners p
				JOIN directory.removal_requests r ON r.practitioner_id = p.id
				WHERE p.id = ${practitionerId}
			`;
			expect(row).toEqual({ withheld: true, locale: "fi-FI" });
		} finally {
			await sql.end();
		}
	});
});
