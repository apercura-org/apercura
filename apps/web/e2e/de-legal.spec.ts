import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the German market (`/de`), written for German law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/de/impressum",
	"/de/datenschutz",
	"/de/nutzungsbedingungen",
	"/de/barrierefreiheit",
	"/de/daten",
] as const;

/** The statistical offices' source note and Thuringia's and Brandenburg's attributions. */
const DESTATIS = /© Statistisches Bundesamt \(Destatis\), \d{4}/;
const THURINGIA = "© GDI-Th";
const BRANDENBURG =
	"© Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit Brandenburg, dl-de/by-2-0 (Daten geändert)";

for (const path of PAGES) {
	test(`${path} answers 200 in German with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"ECG",
			"MedienG",
			"LOPDGDD",
			"AEPD",
			"HDS",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the Impressum cites the DDG and the MStV and shows its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/de/impressum");
	await expect(page.getByText(/§ 5 DDG/).first()).toBeVisible();
	await expect(page.getByText(/§ 18 Abs\. 2 MStV/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the supervisory authorities and the article 14 information", async ({
	page,
}) => {
	await page.goto("/de/datenschutz");
	await expect(page.getByText(/Art\. 14 DSGVO/).first()).toBeVisible();
	await expect(page.getByText(/Art\. 21 DSGVO/).first()).toBeVisible();
	await expect(
		page.getByRole("link", { name: /Datenschutz-Aufsichtsbehörden des Bundes und der Länder/ }),
	).toHaveAttribute("href", /datenschutzkonferenz-online\.de/);
	// Facilities only: no person is listed, no health data is processed.
	await expect(page.getByText(/keine Gesundheitsdaten/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/de/datenschutz", "/de/daten"]) {
		await page.goto(path);
		await expect(page.getByText(DESTATIS).first()).toBeVisible();
		await expect(page.getByText(THURINGIA, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(BRANDENBURG, { exact: true }).first()).toBeVisible();
	}
	await page.goto("/de/daten");
	await expect(
		page
			.getByText(/Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet/)
			.first(),
	).toBeVisible();
	await expect(
		page
			.getByRole("link", { name: /Datenlizenz Deutschland – Namensnennung – Version 2\.0/ })
			.first(),
	).toHaveAttribute("href", "https://www.govdata.de/dl-de/by-2-0");
	await expect(
		page.getByRole("link", { name: /Datensatz der Brandenburger Apotheken/ }),
	).toHaveAttribute("href", /registry\.gdi-de\.org\/id\/de\.bb\.metadata\//);
	await expect(page.getByText(/Änderungen an den Daten/).first()).toBeVisible();
	await expect(page.getByText(/Thüringen und Brandenburg/).first()).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the German objection form", () => {
	const nationalId = Math.floor(Math.random() * 0xffffffffff)
		.toString(16)
		.padStart(10, "0");
	const slug = `widerspruch-beispiel-k${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('DE', 'DE-KHV', ${nationalId}, '', 'Widerspruch Beispiel', '', 'Widerspruch Beispiel',
					'DE_HOSPITAL', ${slug}, false)
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

	test("withholds a page found by its address, answering in German", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.94.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/de/daten#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/de/einrichtung/${slug}`);
		await form.getByLabel(/E-Mail/i).fill("widerspruch@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "de-DE" });
		} finally {
			await sql.end();
		}
	});

	test("the removal page of a facility is reachable under /de/einrichtung/…/entfernung", async ({
		page,
	}) => {
		const response = await page.goto(
			"/de/einrichtung/universitaetsklinikum-beispielstadt-campus-nord-k7f80f63906/entfernung",
		);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
	});
});
