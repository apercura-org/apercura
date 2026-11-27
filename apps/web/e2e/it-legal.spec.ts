import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Italian market (`/it`), written for Italian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/it/note-legali",
	"/it/privacy",
	"/it/condizioni",
	"/it/accessibilita",
	"/it/dati",
] as const;

/**
 * The Ministry of Health's lists, dated by the last Italian import once there is one (the date
 * of the synthetic fixtures varies), and ISTAT's boundaries, word for word.
 */
const MINISTRY = ["Farmacie", "Parafarmacie", "Posti letto per struttura ospedaliera"].map(
	(list) =>
		new RegExp(
			`^Fonte: Ministero della Salute, ${list}, IODL 2\\.0(?:, aggiornato al \\d{1,2} [a-z]+ \\d{4})?$`,
		),
);
const ISTAT =
	"Fonte: Istat, Confini delle unità amministrative a fini statistici al 1° gennaio 2026, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)";

for (const path of PAGES) {
	test(`${path} answers 200 in Italian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "it-IT");
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
			"LOPDGDD",
			"AEPD",
			"LSSI",
			"ÚOOÚ",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites D.Lgs. 70/2003 and shows its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/it/note-legali");
	await expect(page.getByText(/D\.Lgs\. 70\/2003/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the Garante and the article 14 information", async ({ page }) => {
	await page.goto("/it/privacy");
	await expect(
		page.getByText(/Garante per la protezione dei dati personali/).first(),
	).toBeVisible();
	await expect(page.getByText(/articolo 14/).first()).toBeVisible();
	await expect(page.getByText(/D\.Lgs\. 196\/2003/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/it/privacy", "/it/dati"]) {
		await page.goto(path);
		for (const [index, attribution] of MINISTRY.entries()) {
			const id = ["it-farmacie", "it-parafarmacie", "it-posti-letto"][index];
			await expect(page.locator(`[data-attribution="${id}"]`).first()).toHaveText(attribution);
		}
		await expect(page.locator('[data-attribution="it-istat"]').first()).toHaveText(ISTAT);
		await expect(page.getByText(ISTAT, { exact: true }).first()).toBeVisible();
	}
	await page.goto("/it/dati");
	await expect(
		page.getByRole("link", { name: /Italian Open Data Licence v2\.0/ }).first(),
	).toHaveAttribute("href", "https://www.dati.gov.it/iodl/2.0/");
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Italian objection form", () => {
	const nationalId = `8${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
	const slug = `farmacia-opposizione-f${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('IT', 'IT-FARM', ${nationalId}, '', 'Farmacia Opposizione', '',
					'Farmacia Opposizione', 'IT_PHARMACY', ${slug}, false)
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

	test("withholds a page found by its address, answering in Italian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.93.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/it/dati#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/it/struttura/${slug}`);
		await form.getByLabel(/e-mail/i).fill("opposizione@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "it-IT" });
		} finally {
			await sql.end();
		}
	});

	test("the removal page of a place is reachable under /it/struttura/…/rimozione", async ({
		page,
	}) => {
		const response = await page.goto("/it/struttura/farmacia-esempio-f9000001/rimozione");
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
	});
});
