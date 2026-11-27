import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Swedish market (`/se`), written for Swedish law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/se/juridisk-information",
	"/se/integritet",
	"/se/villkor",
	"/se/tillganglighet",
	"/se/data",
] as const;

/** Each source's credit, word for word (adapter `sweden.registries`). */
const REGISTER = "Apotek med tillstånd: © Läkemedelsverket, CC BY 4.0; bearbetat av Apercura";
const HEALTH_CENTRES = "Vårdcentraler: Västra Götalandsregionen, CC0 1.0";
const PLACES = "Län och kommuner: Källa: SCB, CC0 1.0";

for (const path of PAGES) {
	test(`${path} answers 200 in Swedish with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "sv-SE");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"BDSG",
			"LOPDGDD",
			"HDS",
			"Datatilsynet",
			"NLOD",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites e-handelslagen 8 § and marknadsföringslagen, its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/se/juridisk-information");
	await expect(page.getByText(/e-handelslagen 8 §/).first()).toBeVisible();
	await expect(page.getByText(/marknadsföringslagen \(2008:486\)/).first()).toBeVisible();
	await expect(page.getByText(/läkemedelslagens regler om marknadsföring/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names IMY and the article 14 information", async ({ page }) => {
	await page.goto("/se/integritet");
	await expect(page.getByText(/\(artikel 14\)/).first()).toBeVisible();
	await expect(page.getByText(/dataskyddsförordningen artikel 21/).first()).toBeVisible();
	await expect(page.getByText(/lagen \(2018:218\)/).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Integritetsskyddsmyndigheten/ })).toHaveAttribute(
		"href",
		/imy\.se/,
	);
	await expect(page.getByText(/Box 8114, 104 20 Stockholm/).first()).toBeVisible();
	// Facilities only: no person is listed, no sole trader's name or identity number.
	await expect(page.getByText(/förtecknas inte/).first()).toBeVisible();
	await expect(page.getByText(/personnummer/).first()).toBeVisible();
	// Hosted in the EEA, never a named place.
	await expect(page.getByText(/inom Europeiska ekonomiska samarbetsområdet/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/se/integritet", "/se/data"]) {
		await page.goto(path);
		await expect(page.getByText(REGISTER, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(HEALTH_CENTRES, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(PLACES, { exact: true }).first()).toBeVisible();
	}
});

test("the data page links the licence and the register, says what is kept and where health centres are listed", async ({
	page,
}) => {
	await page.goto("/se/data");
	await expect(
		page.getByRole("link", { name: /Creative Commons Erkännande 4\.0 \(CC BY 4\.0\)/ }).first(),
	).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/deed.sv");
	await expect(
		page.getByRole("link", { name: /Registret över apotek med tillstånd/ }),
	).toHaveAttribute("href", /lakemedelsverket\.se/);
	await expect(page.getByText(/Vad som behålls, och varför/).first()).toBeVisible();
	await expect(page.getByText(/stängt för allmänheten/).first()).toBeVisible();
	await expect(page.getByText(/hittills bara Västra Götaland/).first()).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test("the accessibility statement is voluntary and names lag 2018:1937 and DIGG", async ({
	page,
}) => {
	await page.goto("/se/tillganglighet");
	await expect(page.getByText(/lagen \(2018:1937\)/i).first()).toBeVisible();
	await expect(page.getByText(/frivillig/).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /digg\.se/ })).toHaveAttribute("href", /digg\.se/);
});

/** A random GLN under a synthetic prefix above the fixtures', its check digit valid. */
function randomGln(): string {
	const body = `73599998${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
	let sum = 0;
	for (let index = 0; index < 12; index++) sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
	return `${body}${(10 - (sum % 10)) % 10}`;
}

test.describe("the Swedish objection form", () => {
	const nationalId = randomGln();
	const slug = `invandning-exempel-a${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('SE', 'SE-GLN', ${nationalId}, '', 'Invändning Exempel', '', 'Invändning Exempel',
					'SE_PHARMACY', ${slug}, false)
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

	test("withholds a page found by its address, answering in Swedish", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs use 10.77, 10.92 to 10.97, 10.166 to 10.174 or the default client.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.175.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/se/data#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/se/verksamhet/${slug}`);
		await form.getByLabel(/e-post/i).fill("invandning@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "sv-SE" });
		} finally {
			await sql.end();
		}
	});
});
