import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Spanish market (`/es`), written for Spanish law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/es/aviso-legal",
	"/es/privacidad",
	"/es/condiciones",
	"/es/accesibilidad",
	"/es/datos",
] as const;

/**
 * The Ministry of Health's source, dated by the last Spanish import once there is one (the
 * centre pages check the date), and the IGN's attribution, word for word.
 */
const REGCESS =
	/Fuente: Ministerio de Sanidad, REGCESS(?:, actualizado \d{1,2} de [a-z]+ de \d{4})?/;
const IGN = "Obra derivada de Líneas Límite Municipales e IGR Poblaciones 2025 CC-BY 4.0 ign.es";

for (const path of PAGES) {
	test(`${path} answers 200 in Spanish with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
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
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites the LSSI and shows its facts as placeholders", async ({ page }) => {
	await page.goto("/es/aviso-legal");
	await expect(page.getByText(/Ley 34\/2002/).first()).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the AEPD and the article 14 information", async ({ page }) => {
	await page.goto("/es/privacidad");
	await expect(page.getByText(/Agencia Española de Protección de Datos/).first()).toBeVisible();
	await expect(page.getByText(/artículo 19\.3 de la LOPDGDD/).first()).toBeVisible();
	await expect(page.getByText(/artículo 14/).first()).toBeVisible();
});

test("the privacy notice and the data page credit both sources word for word", async ({ page }) => {
	for (const path of ["/es/privacidad", "/es/datos"]) {
		await page.goto(path);
		await expect(page.getByText(REGCESS).first()).toBeVisible();
		await expect(page.getByText(IGN, { exact: true }).first()).toBeVisible();
	}
	await page.goto("/es/datos");
	await expect(
		page.getByRole("link", { name: /Aviso legal del Ministerio de Sanidad/ }).first(),
	).toHaveAttribute("href", "https://www.sanidad.gob.es/avisoLegal/home.htm");
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Spanish objection form", () => {
	const nationalId = `13${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
	const slug = `oposicion-ejemplo-${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('ES', 'ES-REGCESS', ${nationalId}, '', 'Oposicion Ejemplo', '', 'Oposicion Ejemplo',
					'ES_MEDICAL_PRACTICE', ${slug}, false)
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

	test("withholds a page found by its address, answering in Spanish", async ({ page }) => {
		await page.goto("/es/datos#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/es/centro/${slug}`);
		await form.getByLabel(/correo electrónico/i).fill("oposicion@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "es-ES" });
		} finally {
			await sql.end();
		}
	});

	test("the removal page of a centre is reachable under /es/centro/…/retirada", async ({
		page,
	}) => {
		const response = await page.goto(
			"/es/centro/clinica-dental-ejemplo-centro-1328900001/retirada",
		);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
	});
});
