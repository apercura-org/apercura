import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the UK market (`/gb`), written for UK law, and its objection
 * form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/gb/legal-notice",
	"/gb/privacy",
	"/gb/terms",
	"/gb/accessibility",
	"/gb/data",
] as const;

/** Attribution statements the UK sources require, word for word (Open Government Licence). */
const ATTRIBUTIONS = [
	"Contains information from NHS England, Organisation Data Service, licensed under the Open Government Licence v3.0.",
	"Contains public sector information from Public Health Scotland, licensed under the Open Government Licence v3.0.",
	"Contains public sector information from the Business Services Organisation, licensed under the Open Government Licence v3.0.",
	"Contains OS data © Crown copyright and database rights 2026.",
];

for (const path of PAGES) {
	test(`${path} answers 200 with no axe violations, without French or Austrian law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of ["LCEN", "CNIL", "RGAA", "Pro Santé Connect", "RPPS", "DSGVO", "ECG"]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the legal notice carries the information of the 2002 regulations, facts as placeholders", async ({
	page,
}) => {
	await page.goto("/gb/legal-notice");
	for (const heading of [
		"Service provider",
		"Person responsible for the content",
		"Hosting provider",
	]) {
		await expect(page.getByRole("heading", { name: heading })).toBeVisible();
	}
	for (const placeholder of ["{{PUBLISHER_NAME}}", "{{PUBLISHER_ADDRESS}}", "{{HOST_NAME}}"]) {
		await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
	}
	// No VAT number is configured: the row is absent, never a placeholder.
	await expect(page.getByText("VAT identification number")).toHaveCount(0);
	await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
});

test("the privacy notice names every source, the objection and the ICO", async ({ page }) => {
	await page.goto("/gb/privacy");
	await expect(
		page.getByRole("heading", { name: "Legitimate interests assessment" }),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Practices, not people" })).toBeVisible();
	for (const attribution of ATTRIBUTIONS) {
		await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
	}
	await expect(
		page.getByText(/Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF/),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /complaint to the Information Commissioner/ }),
	).toHaveAttribute(
		"href",
		"https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/",
	);
	await expect(page.getByRole("link", { name: "How to object to a page" })).toHaveAttribute(
		"href",
		"/gb/data#remove",
	);
});

test("the data page lists the UK sources with their licence and the nations covered", async ({
	page,
}) => {
	await page.goto("/gb/data");
	const sources = page.getByRole("table", { name: "Data sources of the UK directory" });
	for (const name of [
		"GP practices (epraccur) and branch surgeries (ebranchs)",
		"General dental practices (egdpprac)",
		"Pharmacies and dispensaries (edispensary)",
		"GP Practice Contact Details and List Sizes",
		"Dental Surgery List",
		"Code-Point Open",
		"OS Open Names",
	]) {
		await expect(
			sources.getByRole("link", { name: new RegExp(name.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")) }),
		).toBeVisible();
	}
	for (const attribution of ATTRIBUTIONS) {
		await expect(sources.getByText(attribution, { exact: true }).first()).toBeVisible();
	}
	await expect(
		sources.getByRole("link", { name: /Open Government Licence v3.0/ }).first(),
	).toHaveAttribute(
		"href",
		"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
	);
	const coverage = page.locator("#nations");
	for (const nation of ["England", "Wales", "Scotland", "Northern Ireland"]) {
		await expect(coverage.getByText(nation, { exact: true })).toBeVisible();
	}
});

test.describe("the UK objection form", () => {
	const nationalId = `A9${String(Math.floor(Math.random() * 9_000) + 1_000)}`;
	const slug = `objection-example-surgery-${nationalId.toLowerCase()}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('GB', 'GB-ODS-GP', ${nationalId}, '', 'Objection Example Surgery', '',
					'Objection Example Surgery', 'GB_GP', ${slug}, false)
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

	test("withholds a page found by its address, answering in English", async ({ page }) => {
		await page.goto("/gb/data#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/gb/practice/${slug}`);
		await form.getByLabel(/email/i).fill("objection@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "en-GB" });
		} finally {
			await sql.end();
		}
	});
});
