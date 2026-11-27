import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Lithuanian market (`/lt`), written for Lithuanian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/lt/teisine-informacija",
	"/lt/privatumas",
	"/lt/naudojimo-salygos",
	"/lt/prieinamumas",
	"/lt/duomenys",
] as const;

/** The attributions CC BY 4.0 requires, word for word (adapter `lithuania.registries`). */
const ATTRIBUTIONS = [
	"Šaltinis: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM, „Sveikatos priežiūros įstaigų licencijų duomenys“ (data.gov.lt), CC BY 4.0",
	"Šaltinis: VĮ Registrų centras, Lietuvos Respublikos adresų registras (data.gov.lt), CC BY 4.0 (gyvenamųjų vietovių taškus apskaičiavo Apercura)",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Lithuanian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "lt-LT");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"ICO",
			"HDS",
			"ÚOOÚ",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal information shows its facts as placeholders until they are configured", async ({
	page,
}) => {
	await page.goto("/lt/teisine-informacija");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the State Data Protection Inspectorate and links to it", async ({
	page,
}) => {
	await page.goto("/lt/privatumas");
	await expect(
		page.getByText(/Valstybinė duomenų apsaugos inspekcija/, { exact: false }).first(),
	).toBeVisible();
	await expect(page.locator('a[href^="https://vdai.lrv.lt/"]').first()).toBeVisible();
});

test("the privacy notice and the data page credit both sources word for word", async ({ page }) => {
	for (const path of ["/lt/privatumas", "/lt/duomenys"]) {
		await page.goto(path);
		for (const attribution of ATTRIBUTIONS) {
			await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
		}
	}
	await page.goto("/lt/duomenys");
	await expect(
		page.getByRole("link", { name: /Sveikatos priežiūros įstaigų licencijų duomenys/ }).first(),
	).toHaveAttribute("href", /data\.gov\.lt\/datasets\/1623/);
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Lithuanian objection form", () => {
	const institution = String(Math.floor(Math.random() * 900_000) + 100_000);
	const nationalId = `${institution}-${Math.floor(Math.random() * 90_000_000) + 10_000_000}`;
	const slug = `priestaravimas-pavyzdys-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('LT', 'LT-VASPVT', ${nationalId}, '', 'MB „Prieštaravimo pavyzdys“', '',
					'MB „Prieštaravimo pavyzdys“', 'LT_SPECIALIST', ${slug}, false)
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

	test("withholds a page found by its address, answering in Lithuanian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.170.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/lt/duomenys#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/lt/istaiga/${slug}`);
		await form.getByLabel(/el\. pašt|e-mail/i).fill("priestaravimas@example.test");
		// React Aria draws the box over the native input.
		await form.getByRole("checkbox").check({ force: true });
		await form.getByRole("button").click();
		await expect(page.getByRole("status")).toBeVisible();
		const sql = testDb();
		try {
			const [row] = await sql<{ withheld: boolean; locale: string }[]>`
				SELECT p.withheld_at IS NOT NULL AS withheld, r.locale
				FROM directory.practitioners p
				JOIN directory.removal_requests r ON r.practitioner_id = p.id
				WHERE p.id = ${practitionerId}
			`;
			expect(row).toEqual({ withheld: true, locale: "lt-LT" });
		} finally {
			await sql.end();
		}
	});
});
