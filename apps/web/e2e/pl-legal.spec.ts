import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Polish market (`/pl`), written for Polish law, and its objection
 * form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/pl/nota-prawna",
	"/pl/prywatnosc",
	"/pl/regulamin",
	"/pl/dostepnosc",
	"/pl/dane",
] as const;

for (const path of PAGES) {
	test(`${path} answers 200 in Polish with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "pl-PL");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"ÚOOÚ",
			"HDS",
			"Open Government Licence",
			"Stawki 2",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice shows its facts as placeholders until they are configured", async ({
	page,
}) => {
	await page.goto("/pl/nota-prawna");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names UODO and the data page credits the sources with their dates", async ({
	page,
}) => {
	await page.goto("/pl/prywatnosc");
	await expect(page.getByText(/Moniuszki 1A/).first()).toBeVisible();
	await page.goto("/pl/dane");
	await expect(page.getByText(/Źródło: Centrum e-Zdrowia/).first()).toBeVisible();
	await expect(page.getByText(/Czas wytworzenia: 27 listopada 2026/).first()).toBeVisible();
	await expect(page.getByText(/Główny Urząd Statystyczny/).first()).toBeVisible();
	await expect(
		page.getByText(/Opracowano na podstawie materiałów państwowego zasobu geodezyjnego/).first(),
	).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Polish objection form", () => {
	const nationalId = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
	const slug = `sprzeciw-przyklad-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('PL', 'PL-RPWDL', ${nationalId}, '', 'Sprzeciw Przykład', '', 'Sprzeciw Przykład',
					'PL_PRIMARY_CARE', ${slug}, false)
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

	test("withholds a page found by its address, answering in Polish", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.96.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/pl/dane#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/pl/placowka/${slug}`);
		await form.getByLabel(/e-mail/i).fill("sprzeciw@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "pl-PL" });
		} finally {
			await sql.end();
		}
	});
});
