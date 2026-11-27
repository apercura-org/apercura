import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";
import { statusMessages } from "./status";

/**
 * The institutional pages of the Maltese market (`/mt`), written for Maltese law: the
 * information of the Electronic Commerce Act (Cap. 426, article 8C), the privacy notice under the
 * GDPR and the Data Protection Act (Cap. 586) with the IDPC, the terms, a voluntary accessibility
 * statement, the data page with every source's attribution and the advertising rules, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = {
	legalNotice: "/mt/legal-notice",
	privacy: "/mt/privacy",
	terms: "/mt/terms",
	accessibility: "/mt/accessibility",
	data: "/mt/data",
} as const;

/** Other markets' law, which a Maltese page never cites. */
const FOREIGN = [
	"LCEN",
	"RGAA",
	"Pro Santé Connect",
	"RPPS",
	"UK GDPR",
	"Electronic Commerce (EC Directive) Regulations 2002",
	"S.I. No. 68 of 2003",
	"dataprotection.ie",
	"Open Government Licence",
	"NHS",
	"HDS",
	"LOPDGDD",
	"nFADP",
	"Impressum",
];

for (const [name, path] of Object.entries(PAGES)) {
	test(`${path} (${name}) answers 200 in English, indexed, without alternates or axe violations`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "en-MT");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of FOREIGN) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
		await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the legal notice gives article 8C's facts as placeholders, and French law as the country of origin", async ({
	page,
}) => {
	await page.goto(PAGES.legalNotice);
	const main = page.locator("main");
	await expect(main.getByText(/Cap\. 426/).first()).toBeVisible();
	await expect(main.locator("section#origin")).toContainText("French law governs the service");
	await expect(main.locator("section#origin")).toContainText("article 8A");
	await expect(main.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
	// A draft until the legal review.
	await expect(main.locator("section#status h2")).toBeVisible();
});

test("the privacy notice has the GDPR sections, the IDPC and the CNIL, and keeps the data in the EEA", async ({
	page,
}) => {
	await page.goto(PAGES.privacy);
	const main = page.locator("main");
	for (const id of [
		"controller",
		"directory",
		"people",
		"sources",
		"legitimate-interests",
		"objection",
		"transfers",
		"rights",
	]) {
		await expect(main.locator(`section#${id} h2`), `#${id}`).toBeVisible();
	}
	await expect(main.getByText(/Cap\. 586/).first()).toBeVisible();
	await expect(main.locator("section#rights")).toContainText(
		"Information and Data Protection Commissioner",
	);
	await expect(main.locator("section#rights")).toContainText("CNIL");
	await expect(main.locator("section#people")).toContainText("names no pharmacist");
	await expect(main.locator("section#transfers")).toContainText("European Economic Area");
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	const credits = {
		"mt-pharmacies":
			"Source: Medicines Authority, Licensed Pharmacies in Malta and Gozo (data.gov.mt), CC BY 4.0.",
		"mt-local-councils":
			"Source: Planning Authority, Local Councils Units and Boundaries, CC BY 4.0 (localities' points computed by Apercura).",
		"mt-localities":
			"Source: National Statistics Office, districts and localities; Office of the Address Registrar, Local Councils of Malta; CC BY 4.0.",
	} as const;
	for (const path of [PAGES.privacy, PAGES.data]) {
		await page.goto(path);
		for (const [id, text] of Object.entries(credits)) {
			await expect(page.locator(`[data-attribution="${id}"]`).first(), `${path} ${id}`).toHaveText(
				text,
			);
		}
	}
});

test("the data page states the licence and the advertising rules, and says what is left out", async ({
	page,
}) => {
	await page.goto(PAGES.data);
	const main = page.locator("main");
	await expect(main.locator("#conditions")).toContainText("CC BY 4.0");
	await expect(main.locator("#conditions")).toContainText("S.L. 458.32");
	await expect(main.locator("#conditions")).toContainText("without ranking or paid placement");
	await expect(main.locator("section#not-imported")).toContainText("in-patient pharmacies");
	await expect(main.locator("section#not-imported")).toContainText("Medical Council");
	for (const id of [
		"coverage",
		"fields-not-read",
		"locations",
		"identifiers",
		"correct",
		"remove",
	]) {
		await expect(main.locator(`section#${id} h2`), `#${id}`).toBeVisible();
	}
	await expect(main.locator("#coverage li")).toHaveCount(1);
	await expect(page.locator("#remove form")).toBeVisible();
});

test("the terms keep the Maltese consumer's protections, and the accessibility statement is voluntary", async ({
	page,
}) => {
	await page.goto(PAGES.terms);
	await expect(page.locator("main section#law")).toContainText("French law");
	await expect(page.locator("main section#law")).toContainText("Maltese courts");
	await expect(page.locator("main section#health")).toContainText("112");
	await page.goto(PAGES.accessibility);
	await expect(page.locator("main section#scope")).toContainText("S.L. 418.03");
	await expect(page.locator("main section#scope")).toContainText("S.L. 627.03");
	await expect(page.locator("main section#scope")).toContainText("WCAG 2.2");
});

test.describe("the Maltese objection form", () => {
	const nationalId = String(Math.floor(Math.random() * 8_000) + 1_000);
	const slug = `example-objection-pharmacy-dl${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			await sql`
				DELETE FROM directory.practitioners
				WHERE country = 'MT' AND id_scheme = 'MT-MA' AND national_id = ${nationalId}
			`;
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('MT', 'MT-MA', ${nationalId}, '', 'Example Objection Pharmacy', '',
					'Example Objection Pharmacy', 'MT_PHARMACY', ${slug}, false)
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

	test("withholds a page found by its Maltese address", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs use theirs.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.176.0.${Math.floor(Math.random() * 250) + 1}`,
		});
		await page.goto(`${PAGES.data}#remove`);
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/mt/facility/${slug}`);
		await form.getByLabel(/e-?mail/i).fill("objection@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "en-MT" });
		} finally {
			await sql.end();
		}
	});
});
