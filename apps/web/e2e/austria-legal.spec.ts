import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the Austrian market (`/at`), written for Austrian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/at/impressum",
	"/at/datenschutz",
	"/at/nutzungsbedingungen",
	"/at/barrierefreiheit",
	"/at/daten",
] as const;

/** Every attribution the Austrian sources require, word for word. */
const ATTRIBUTIONS = [
	"Datenquelle: Stadt Wien – data.wien.gv.at",
	"Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at",
	"Datenquelle: Land Salzburg – data.salzburg.gv.at",
	"Datenquelle: Statistik Austria - data.statistik.gv.at",
];

for (const path of PAGES) {
	test(`${path} answers 200 with no axe violations, without French law`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const french of ["LCEN", "CNIL", "RGAA", "Pro Santé Connect", "RPPS"]) {
			expect(text, `${path} mentions ${french}`).not.toContain(french);
		}
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the Impressum carries the ECG and MedienG information, facts as placeholders", async ({
	page,
}) => {
	await page.goto("/at/impressum");
	for (const heading of [
		"Diensteanbieter und Medieninhaber",
		"Unternehmensgegenstand",
		"Grundlegende Richtung (§ 25 Abs. 4 MedienG)",
	]) {
		await expect(page.getByRole("heading", { name: heading })).toBeVisible();
	}
	for (const placeholder of ["{{PUBLISHER_NAME}}", "{{PUBLICATION_DIRECTOR}}", "{{HOST_NAME}}"]) {
		await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
	}
	// No VAT number is configured: the row is absent, never a placeholder.
	await expect(page.getByText("Umsatzsteuer-Identifikationsnummer (UID)")).toHaveCount(0);
	await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
});

test("the Datenschutzerklärung names every source, the objection and the Datenschutzbehörde", async ({
	page,
}) => {
	await page.goto("/at/datenschutz");
	await expect(page.getByRole("heading", { name: "Interessenabwägung" })).toBeVisible();
	for (const attribution of ATTRIBUTIONS) {
		await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
	}
	await expect(page.getByText(/Barichgasse 40-42, 1030 Wien/)).toBeVisible();
	await expect(
		page.getByRole("link", { name: /Beschwerde bei der Datenschutzbehörde/ }),
	).toHaveAttribute("href", "https://dsb.gv.at/eingabe-an-die-dsb/beschwerde");
	await expect(
		page.getByRole("link", { name: "So widersprechen Sie einer Seite" }),
	).toHaveAttribute("href", "/at/daten#entfernen");
});

test("the data page lists the five Austrian sources with their licence and the Länder covered", async ({
	page,
}) => {
	await page.goto("/at/daten");
	const sources = page.getByRole("table", {
		name: "Datenquellen des österreichischen Verzeichnisses",
	});
	for (const name of [
		"Ärzte Standorte Wien",
		"Niedergelassene Ärzte Steiermark",
		"Ärzte Land Salzburg",
		"Zahnärzte Land Salzburg",
		"Gemeinden – Schwerpunkte",
	]) {
		await expect(sources.getByRole("link", { name: new RegExp(name) })).toBeVisible();
	}
	for (const attribution of ATTRIBUTIONS) {
		await expect(sources.getByText(attribution, { exact: true }).first()).toBeVisible();
	}
	await expect(sources.getByRole("link", { name: /CC BY 4.0/ }).first()).toHaveAttribute(
		"href",
		"https://creativecommons.org/licenses/by/4.0/deed.de",
	);
	const coverage = page.locator("#bundeslaender");
	await expect(coverage.getByText("Wien", { exact: true })).toBeVisible();
	await expect(coverage.getByText("Nur beanspruchte Seiten", { exact: true })).toHaveCount(6);
	await expect(coverage.getByText("Aus offenen Daten", { exact: true })).toHaveCount(3);
});

test.describe("the Austrian objection form", () => {
	const nationalId = String(990_000_000 + Math.floor(Math.random() * 9_999_999));
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('AT', 'AT-WIEN', ${nationalId}, 'Erika', 'Einspruch', 'Erika', 'Einspruch', 'ARZT',
					${`erika-einspruch-w${nationalId}`}, false)
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

	test("withholds a page found by its Austrian key, answering in German", async ({ page }) => {
		await page.goto("/at/daten#entfernen");
		const form = page.locator("#entfernen form");
		await form.getByLabel("Kennung der Seite").fill(`w${nationalId}`);
		await form.getByLabel(/E-Mail/).fill("einspruch@example.test");
		// React Aria draws the box over the native input.
		await form.getByRole("checkbox").check({ force: true });
		await form.getByRole("button").click();
		await expect(statusMessages(page)).toContainText("angezeigt");
		const sql = testDb();
		try {
			const [row] = await sql<{ withheld: boolean; locale: string }[]>`
				SELECT p.withheld_at IS NOT NULL AS withheld, r.locale
				FROM directory.practitioners p
				JOIN directory.removal_requests r ON r.practitioner_id = p.id
				WHERE p.id = ${practitionerId}
			`;
			expect(row).toEqual({ withheld: true, locale: "de-AT" });
		} finally {
			await sql.end();
		}
	});
});
