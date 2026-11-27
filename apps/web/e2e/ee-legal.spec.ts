import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Estonian market (`/ee`), written for Estonian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/ee/oigusteave",
	"/ee/privaatsus",
	"/ee/kasutustingimused",
	"/ee/ligipaasetavus",
	"/ee/andmed",
] as const;

/** The Health Board's credit, word for word, and the Land and Spatial Development Board's. */
const HEALTH_BOARD =
	"Terviseamet, tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud";
const LAND_BOARD = /Haldus- ja asustusjaotus: Maa- ja Ruumiamet \d{2}\.\d{2}\.\d{4}/;

for (const path of PAGES) {
	test(`${path} answers 200 in Estonian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "et-EE");
		const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
		for (const foreign of [
			"LCEN",
			"CNIL",
			"RGAA",
			"Pro Santé Connect",
			"RPPS",
			"DSGVO",
			"BDSG",
			"DDG",
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

test("the legal notice cites InfoTS § 4 and the Advertising Act, its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/ee/oigusteave");
	await expect(page.getByText(/InfoTS § 4 lg 1/).first()).toBeVisible();
	await expect(page.getByText(/reklaamiseaduse § 22 lõike 3/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the Data Protection Inspectorate and the article 14 information", async ({
	page,
}) => {
	await page.goto("/ee/privaatsus");
	await expect(page.getByText(/IKÜM artikkel 14/).first()).toBeVisible();
	await expect(page.getByText(/IKÜM artikkel 21/).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /Andmekaitse Inspektsioon/ })).toHaveAttribute(
		"href",
		/aki\.ee/,
	);
	await expect(page.getByText(/Tatari 39, 10134 Tallinn/).first()).toBeVisible();
	// Providers only: no health worker is listed, no health data is processed.
	await expect(page.getByText(/tervishoiutöötajaid ei avaldata/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/ee/privaatsus", "/ee/andmed"]) {
		await page.goto(path);
		await expect(page.getByText(HEALTH_BOARD, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(LAND_BOARD).first()).toBeVisible();
		await expect(
			page.getByText("Ravimiamet, tegevuslubade register", { exact: true }).first(),
		).toBeVisible();
	}
});

test("the data page says the Estonian data is republished under CC BY-NC-SA 3.0, and why it is non-commercial", async ({
	page,
}) => {
	await page.goto("/ee/andmed");
	await expect(
		page.getByRole("link", { name: /Litsents CC BY-NC-SA 3\.0 Jurisdiktsiooniga sidumata/ }),
	).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode");
	await expect(
		page.getByRole("link", { name: /Terviseameti andmestik portaalis andmed\.eesti\.ee/ }),
	).toHaveAttribute("href", /andmed\.eesti\.ee\/datasets\//);
	await expect(page.getByText(/Ükski muu saidi litsentsiväide/).first()).toBeVisible();
	await expect(
		page.getByText(/Mitteäriline eesmärk \(litsentsi punkt 4\(c\)\)/).first(),
	).toBeVisible();
	await expect(page.getByText(/Andmetes tehtud muudatused/).first()).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Estonian objection form", () => {
	// Five digits from 90000: the synthetic fixtures' licence numbers stay below.
	const nationalId = String(90000 + Math.floor(Math.random() * 9999));
	const slug = `vastuvaide-naide-l${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('EE', 'EE-TTL', ${nationalId}, '', 'Vastuväide Näide', '', 'Vastuväide Näide',
					'EE_FAMILY_PRACTICE', ${slug}, false)
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

	test("withholds a page found by its address, answering in Estonian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs use 10.92 to 10.95 or the default client.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.97.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/ee/andmed#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/ee/asutus/${slug}`);
		await form.getByLabel(/e-post/i).fill("vastuvaide@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "et-EE" });
		} finally {
			await sql.end();
		}
	});
});
