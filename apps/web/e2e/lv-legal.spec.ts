import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Latvian market (`/lv`), written for Latvian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/lv/juridiska-informacija",
	"/lv/privatums",
	"/lv/lietosanas-noteikumi",
	"/lv/pieklustamiba",
	"/lv/dati",
] as const;

/** The attributions of the four sources, word for word (adapter `latvia.registries`). */
const ATTRIBUTIONS = [
	"Avots: Nacionālais veselības dienests, data.gov.lv (CC0 1.0)",
	"Avots: Iekšlietu ministrijas Informācijas centrs, data.gov.lv (CC0 1.0)",
	"Avots: Zāļu valsts aģentūra, data.gov.lv (CC0 1.0)",
	"Izmantoti Valsts adrešu reģistra informācijas sistēmas dati (Valsts zemes dienests, CC BY 4.0), apvienoti ar citiem avotiem",
];

/** A GP practice of the e2e fixtures, as `lvFacilitySlug` writes it. */
const GP_PRACTICE = "/lv/iestade/ilzes-paraugas-gimenes-arsta-prakse-g010000006";

for (const path of PAGES) {
	test(`${path} answers 200 in Latvian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "lv-LV");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"ÚOOÚ",
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

test("the legal information cites the Law on Information Society Services and shows its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/lv/juridiska-informacija");
	await expect(
		page.getByText(/Informācijas sabiedrības pakalpojumu likuma 4\. pants/).first(),
	).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice gives the GPs their article 14 information and names the Data State Inspectorate", async ({
	page,
}) => {
	await page.goto("/lv/privatums");
	await expect(page.locator("#gps")).toContainText("VDAR 14. pants");
	await expect(page.locator("#gps")).toContainText(
		"Ģimenes ārsta praksē reģistrēto pacientu skaits",
	);
	await expect(page.locator("#gps")).toContainText("14. panta 5. punkta b) apakšpunkts");
	await expect(page.getByText(/VDAR 21\. pants/).first()).toBeVisible();
	await expect(page.getByText(/Elijas iela 17, Rīga, LV-1050/).first()).toBeVisible();
	await expect(
		page.getByRole("link", { name: /Iesniegt sūdzību Datu valsts inspekcijai/ }),
	).toHaveAttribute("href", /^https:\/\/www\.dvi\.gov\.lv\//);
	// Places only, and GPs in their professional capacity: no health data is processed.
	await expect(
		page.getByText(/neapstrādā pacientu datus un veselības datus/).first(),
	).toBeVisible();
	// No hosting certification, no place named for the servers.
	await expect(page.getByText(/Eiropas Ekonomikas zonā/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/lv/privatums", "/lv/dati"]) {
		await page.goto(path);
		for (const attribution of ATTRIBUTIONS) {
			await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
		}
	}
	await page.goto("/lv/dati");
	await expect(
		page.getByText("Izmantoti Valsts adrešu reģistra informācijas sistēmas dati", { exact: true }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /CC0 1\.0/ }).first()).toHaveAttribute(
		"href",
		/creativecommons\.org\/publicdomain\/zero\/1\.0/,
	);
	await expect(page.getByRole("link", { name: /CC BY 4\.0/ }).first()).toHaveAttribute(
		"href",
		/creativecommons\.org\/licenses\/by\/4\.0/,
	);
	await expect(page.getByText(/2024\. gadā/).first()).toBeVisible();
	await expect(page.locator("#correct form")).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Latvian objection form", () => {
	const nationalId = String(Math.floor(Math.random() * 900_000_000) + 100_000_000);
	const slug = `iebildums-paraugs-g${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('LV', 'LV-GP', ${nationalId}, '', 'Iebildums Paraugs', '', 'Iebildums Paraugs',
					'LV_GP_PRACTICE', ${slug}, false)
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

	test("withholds a page found by its address, answering in Latvian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.166.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/lv/dati#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/lv/iestade/${slug}`);
		await form.getByLabel(/e-pas/i).fill("iebildums@example.test");
		// React Aria draws the box over the native input.
		await form.getByRole("checkbox").check({ force: true });
		await form.getByRole("button").click();
		// The request is encrypted, stored and mailed before it answers: longer while the server
		// renders the other specs' pages.
		await expect(page.getByRole("status")).toBeVisible({ timeout: 15_000 });
		const sql = testDb();
		try {
			const [row] = await sql<{ withheld: boolean; locale: string }[]>`
				SELECT p.withheld_at IS NOT NULL AS withheld, r.locale
				FROM directory.practitioners p
				JOIN directory.removal_requests r ON r.practitioner_id = p.id
				WHERE p.id = ${practitionerId}
			`;
			expect(row).toEqual({ withheld: true, locale: "lv-LV" });
		} finally {
			await sql.end();
		}
	});

	test("the removal and report pages of a place are reachable under /lv/iestade/…/dzesana and …/zinot", async ({
		page,
	}) => {
		for (const path of [`${GP_PRACTICE}/dzesana`, `${GP_PRACTICE}/zinot`]) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(200);
			await expect(page.locator("main h1")).toBeVisible();
		}
	});
});
