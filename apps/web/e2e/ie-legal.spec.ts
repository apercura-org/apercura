import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Irish market (`/ie`), written for Irish law, not the UK's: the
 * information of S.I. No. 68 of 2003, the privacy notice under the GDPR and the Data Protection
 * Act 2018 with the Data Protection Commission, the terms, a voluntary accessibility statement,
 * the data page with every source's attribution and the PSI's condition on advertising, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = {
	legalNotice: "/ie/legal-notice",
	privacy: "/ie/privacy",
	terms: "/ie/terms",
	accessibility: "/ie/accessibility",
	data: "/ie/data",
} as const;

/** Other markets' law, which an Irish page never cites. */
const FOREIGN = [
	"LCEN",
	"RGAA",
	"Pro Santé Connect",
	"RPPS",
	"Information Commissioner",
	"UK GDPR",
	"Electronic Commerce (EC Directive) Regulations 2002",
	"Open Government Licence",
	"NHS",
	"HDS",
	"LOPDGDD",
	"Garante per la protezione",
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
		await expect(page.locator("html")).toHaveAttribute("lang", "en-IE");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of FOREIGN) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
		await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the legal notice gives regulation 7's facts as placeholders, and French law as the country of origin", async ({
	page,
}) => {
	await page.goto(PAGES.legalNotice);
	const main = page.locator("main");
	await expect(main.getByText(/S\.I\. No\. 68 of 2003/).first()).toBeVisible();
	await expect(main.locator("section#origin h2")).toBeVisible();
	await expect(main.locator("section#origin")).toContainText("French law governs the service");
	await expect(main.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
	// A draft until the legal review.
	await expect(main.locator("section#status h2")).toBeVisible();
});

test("the privacy notice has the GDPR sections, the DPC and the CNIL, and the people never read", async ({
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
	await expect(main.getByText(/Data Protection Act 2018/).first()).toBeVisible();
	await expect(main.locator("section#rights")).toContainText("Data Protection Commission");
	await expect(main.locator("section#rights")).toContainText("6 Pembroke Row, Dublin 2, D02 X963");
	await expect(main.locator("section#rights")).toContainText("CNIL");
	await expect(
		main.getByRole("link", { name: /Raise a concern with the Data Protection Commission/ }),
	).toHaveAttribute("href", /dataprotection\.ie/);
	await expect(main.locator("section#people")).toContainText("superintendent");
	await expect(main.locator("section#people")).toContainText("person in charge");
	await expect(main.locator("section#transfers")).toContainText("European Economic Area");
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	const credits = {
		"ie-psi":
			"Source: Pharmaceutical Society of Ireland, Register of Pharmacies. © Pharmaceutical Society of Ireland.",
		"ie-hiqa":
			"Source: Health Information and Quality Authority, register of designated centres for older people. © HIQA.",
		"ie-hse-hospitals":
			"Source: Health Service Executive, Health Atlas Ireland, Hospitals – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.",
		"ie-hse-health-centres":
			"Source: Health Service Executive, Health Atlas Ireland, Health Centres – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.",
		"ie-counties": "© Tailte Éireann, Counties – National Statutory Boundaries, CC BY 4.0.",
		"ie-towns":
			"Source: CSO and Tailte Éireann, Census 2022 Built Up Areas, CC BY 4.0 (towns' points computed by Apercura).",
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

test("the data page quotes the PSI's clause on advertising, dates each list, and says what is left out", async ({
	page,
}) => {
	await page.goto(PAGES.data);
	const main = page.locator("main");
	await expect(main.locator("#conditions")).toContainText(
		"“Not use the information for the principal purpose of advertising or promoting a particular product or service”",
	);
	await expect(main.locator("#conditions")).toContainText("sells no placement or ranking");
	await expect(main.locator("#conditions")).toContainText("HIQA's re-use conditions");
	// The HSE's layers are a March 2020 snapshot, said plainly, with why.
	await expect(main.locator("section#dates")).toContainText("March 2020");
	await expect(main.locator("section#dates")).toContainText("data.ehealthireland.ie");
	await expect(main.locator("section#dates time")).toHaveCount(3);
	await expect(main.locator("section#not-imported")).toContainText("GP practices");
	await expect(main.locator("section#locations")).toContainText("never used to locate a facility");
	for (const id of ["coverage", "fields-not-read", "identifiers", "correct", "remove"]) {
		await expect(main.locator(`section#${id} h2`), `#${id}`).toBeVisible();
	}
	await expect(main.locator("#coverage li")).toHaveCount(4);
	await expect(page.locator("#remove form")).toBeVisible();
});

test("the terms keep the Irish consumer's protections, and the accessibility statement is voluntary", async ({
	page,
}) => {
	await page.goto(PAGES.terms);
	await expect(page.locator("main section#law")).toContainText("French law");
	await expect(page.locator("main section#law")).toContainText("Irish courts");
	await expect(page.locator("main section#health")).toContainText("112 or 999");
	await page.goto(PAGES.accessibility);
	await expect(page.locator("main section#scope")).toContainText("S.I. No. 358 of 2020");
	await expect(page.locator("main section#scope")).toContainText("S.I. No. 636 of 2023");
	await expect(page.locator("main section#scope")).toContainText("WCAG 2.2");
});

test.describe("the Irish objection form", () => {
	const nationalId = `9${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
	const slug = `example-objection-pharmacy-p${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('IE', 'IE-PSI', ${nationalId}, '', 'Example Objection Pharmacy', '',
					'Example Objection Pharmacy', 'IE_PHARMACY', ${slug}, false)
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

	test("withholds a page found by its Irish address", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs use theirs (10.92 to 10.95).
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.171.0.${Math.floor(Math.random() * 250) + 1}`,
		});
		await page.goto(`${PAGES.data}#remove`);
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/ie/facility/${slug}`);
		await form.getByLabel(/e-?mail/i).fill("objection@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "en-IE" });
		} finally {
			await sql.end();
		}
	});
});
