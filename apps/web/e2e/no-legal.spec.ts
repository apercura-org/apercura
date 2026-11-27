import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Norwegian market (`/no`), written for Norwegian law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/no/juridisk",
	"/no/personvern",
	"/no/vilkar",
	"/no/tilgjengelighet",
	"/no/data",
] as const;

/** The register's credit, word for word (NLOD 2.0 § 5), and Kartverket's. */
const REGISTER =
	"Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av Apercura";
const ADDRESSES = "Adresser: © Kartverket, CC BY 4.0";
const PLACES = "Fylker og kommuner: © Kartverket, CC BY 4.0";

for (const path of PAGES) {
	test(`${path} answers 200 in Norwegian with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "nb-NO");
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
			"InfoTS",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites ehandelsloven § 8 and helsepersonelloven § 13, its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/no/juridisk");
	await expect(page.getByText(/ehandelsloven § 8/).first()).toBeVisible();
	await expect(page.getByText(/helsepersonelloven § 13/i).first()).toBeVisible();
	await expect(page.getByText(/forsvarlig, nøktern og saklig/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names Datatilsynet and the article 14 information", async ({ page }) => {
	await page.goto("/no/personvern");
	await expect(page.getByText(/personvernforordningen artikkel 14/).first()).toBeVisible();
	await expect(page.getByText(/personvernforordningen artikkel 21/).first()).toBeVisible();
	await expect(page.getByRole("link", { name: /^Datatilsynet/ })).toHaveAttribute(
		"href",
		/datatilsynet\.no/,
	);
	await expect(page.getByText(/Postboks 458 Sentrum, 0105 Oslo/).first()).toBeVisible();
	// Establishments only: no person is listed, no sole proprietorship.
	await expect(
		page.getByText(/helsepersonellet som arbeider der, vises ikke/).first(),
	).toBeVisible();
	await expect(page.getByText(/enkeltpersonforetak/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	for (const path of ["/no/personvern", "/no/data"]) {
		await page.goto(path);
		await expect(page.getByText(REGISTER, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(ADDRESSES, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(PLACES, { exact: true }).first()).toBeVisible();
	}
});

test("the data page links the licence and the register, and says what is kept and why", async ({
	page,
}) => {
	await page.goto("/no/data");
	await expect(
		page.getByRole("link", { name: /Norsk lisens for offentlige data \(NLOD 2\.0\)/ }).first(),
	).toHaveAttribute("href", "https://data.norge.no/nlod/no/2.0");
	await expect(
		page.getByRole("link", { name: /Registerets åpne data \(data\.brreg\.no\)/ }),
	).toHaveAttribute("href", /data\.brreg\.no/);
	await expect(page.getByText(/Personopplysninger \(NLOD 2\.0 punkt 3\)/).first()).toBeVisible();
	await expect(page.getByText(/Hva som beholdes, og hvorfor/).first()).toBeVisible();
	await expect(page.getByText(/86\.101/).first()).toBeVisible();
	await expect(page.locator("#remove form")).toBeVisible();
});

/** A random organisation number of the synthetic range above the fixtures', its check digit valid. */
function randomOrgNumber(): string {
	const weights = [3, 2, 7, 6, 5, 4, 3, 2];
	for (;;) {
		const base = `99${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
		const sum = weights.reduce((total, weight, index) => total + weight * Number(base[index]), 0);
		const check = (11 - (sum % 11)) % 11;
		if (check !== 10) return `${base}${check}`;
	}
}

test.describe("the Norwegian objection form", () => {
	const nationalId = randomOrgNumber();
	const slug = `innsigelse-eksempel-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('NO', 'NO-ORGNR', ${nationalId}, '', 'Innsigelse Eksempel', '', 'Innsigelse Eksempel',
					'NO_GP', ${slug}, false)
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

	test("withholds a page found by its address, answering in Norwegian", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs use 10.92 to 10.97 or the default client.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.172.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/no/data#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/no/virksomhet/${slug}`);
		await form.getByLabel(/e-post/i).fill("innsigelse@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "nb-NO" });
		} finally {
			await sql.end();
		}
	});
});
