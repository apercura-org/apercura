import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Slovenian market (`/si`), written for Slovenian law (the
 * general information of the ZEPT, the GDPR and the ZVOP-2), and its objection form. The e2e
 * server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/si/pravno-obvestilo",
	"/si/varstvo-osebnih-podatkov",
	"/si/pogoji-uporabe",
	"/si/dostopnost",
	"/si/podatki",
] as const;

/** The attributions CC BY 4.0 requires, word for word (adapter `slovenia.registries`). */
const ATTRIBUTIONS = [
	"Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0",
	"Vir: Geodetska uprava Republike Slovenije, Register prostorskih enot",
];

/** Other markets' law and registers, which a Slovenian page never cites. */
const FOREIGN = [
	"LCEN",
	"CNIL",
	"RGAA",
	"Pro Santé Connect",
	"RPPS",
	"DSGVO",
	"ICO",
	"HDS",
	"Open Government Licence",
	"OGL",
	"NRPZS",
	"ÚZIS",
	"ČÚZK",
	"ÚOOÚ",
	"LOPDGDD",
	"Garante per la protezione",
	"E-Commerce-Gesetz",
];

for (const path of PAGES) {
	test(`${path} answers 200 in Slovenian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "sl-SI");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of FOREIGN) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice shows its facts as placeholders until they are configured", async ({
	page,
}) => {
	await page.goto("/si/pravno-obvestilo");
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice and the data page credit both sources word for word", async ({ page }) => {
	for (const path of ["/si/varstvo-osebnih-podatkov", "/si/podatki"]) {
		await page.goto(path);
		for (const attribution of ATTRIBUTIONS) {
			await expect(page.getByText(attribution, { exact: true }).first()).toBeVisible();
		}
	}
	// The three ZZZS lists share one credit line, printed once on the privacy notice.
	await page.goto("/si/varstvo-osebnih-podatkov");
	await expect(page.locator("#sources [data-attribution]")).toHaveCount(2);
	await page.goto("/si/podatki");
	await expect(page.getByRole("link", { name: /Seznam zobozdravnikov/ }).first()).toHaveAttribute(
		"href",
		/podatki\.gov\.si\/dataset\/poimenski-seznami-zdravnikov/,
	);
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Slovenian objection form", () => {
	const nationalId = `9${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
	const slug = `ana-ugovor-primer-si${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, listing_slug, slug, indexable)
				VALUES ('SI', 'SI-ZZZS', ${nationalId}, 'Ana', 'Ugovor Primer', 'ANA', 'UGOVOR PRIMER',
					'SI_FAMILY_DOCTOR', 'druzinski-zdravnik', ${slug}, false)
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

	test("withholds a page found by its address, answering in Slovenian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs share the default one. 10.167.x.y is this spec's range.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.167.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/si/podatki#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/si/zdravnik/${slug}`);
		await form.getByLabel(/e-pošt|e-mail/i).fill("ugovor@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "sl-SI" });
		} finally {
			await sql.end();
		}
	});
});
