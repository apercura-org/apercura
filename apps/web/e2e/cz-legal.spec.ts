import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the Czech market (`/cz`), written for Czech law, and its objection
 * form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/cz/pravni-informace",
	"/cz/ochrana-osobnich-udaju",
	"/cz/podminky-uziti",
	"/cz/pristupnost",
	"/cz/data",
] as const;

/** The attributions CC BY 4.0 requires, word for word (adapter `czechia.registries`). */
const ATTRIBUTIONS = [
	"Zdroj: Ministerstvo zdravotnictví ČR a Ústav zdravotnických informací a statistiky ČR, Národní registr poskytovatelů zdravotních služeb (nzip.cz)",
	"ČÚZK, 2026",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Czech with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "cs-CZ");
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
	await page.goto("/cz/pravni-informace");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice and the data page credit both sources word for word", async ({ page }) => {
	for (const path of ["/cz/ochrana-osobnich-udaju", "/cz/data"]) {
		await page.goto(path);
		for (const attribution of ATTRIBUTIONS) {
			await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
		}
	}
	await page.goto("/cz/data");
	await expect(
		page.getByRole("link", { name: /NRPZS: Místa poskytování zdravotních služeb/ }).first(),
	).toHaveAttribute("href", /nzip\.cz\/data\/1823/);
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Czech objection form", () => {
	const nationalId = `7${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
	const slug = `namitka-ukazka-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('CZ', 'CZ-NRPZS', ${nationalId}, '', 'Námitka Ukázka', '', 'Námitka Ukázka',
					'CZ_GP', ${slug}, false)
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

	test("withholds a page found by its address, answering in Czech", async ({ page }) => {
		await page.goto("/cz/data#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/cz/zarizeni/${slug}`);
		await form.getByLabel(/e-mail/i).fill("namitka@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "cs-CZ" });
		} finally {
			await sql.end();
		}
	});
});
