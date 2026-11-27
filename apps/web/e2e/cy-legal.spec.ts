import { cyprus } from "@apercura/core/country";
import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Cypriot market (`/cy`), written for Cypriot law, and its
 * objection form. The e2e server sets no LEGAL_* variable: every fact is a placeholder.
 */
const PAGES = [
	"/cy/nomiki-dilosi",
	"/cy/aporrito",
	"/cy/oroi-chrisis",
	"/cy/prosvasimotita",
	"/cy/dedomena",
] as const;

/** Every source's credit, word for word, as CC BY 4.0 asks. */
const CREDITS = cyprus.registries.map((source) => source.attribution ?? "");

for (const path of PAGES) {
	test(`${path} answers 200 in Greek with no axe violations, without another market's law`, async ({
		page,
	}) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", "el-CY");
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
			"InfoTS",
			"NLOD",
			"ehandelsloven",
			"Datatilsynet",
			"Open Government Licence",
		]) {
			expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
		}
		expect(await axeViolations(page)).toEqual([]);
		await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
	});
}

test("the legal notice cites Law 156(I)/2004 and article 45 of the Code of Medical Ethics, its facts as placeholders", async ({
	page,
}) => {
	await page.goto("/cy/nomiki-dilosi");
	await expect(page.getByText(/Ν\. 156\(Ι\)\/2004, άρθρο 8/).first()).toBeVisible();
	await expect(page.getByText(/άρθρο 45 του Κώδικα Ιατρικής Δεοντολογίας/).first()).toBeVisible();
	await expect(
		page.getByText(/ομοιόμορφες για όλους, χωρίς πληρωμένη προβολή/).first(),
	).toBeVisible();
	await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
});

test("the privacy notice names the Commissioner, Law 125(I)/2018 and what is never read", async ({
	page,
}) => {
	await page.goto("/cy/aporrito");
	await expect(page.getByText(/άρθρο 14 του ΓΚΠΔ/).first()).toBeVisible();
	await expect(page.getByText(/άρθρο 21 του ΓΚΠΔ/).first()).toBeVisible();
	await expect(page.getByText(/Ν\. 125\(Ι\)\/2018/).first()).toBeVisible();
	await expect(
		page.getByRole("link", { name: /^Ο Επίτροπος Προστασίας Δεδομένων/ }),
	).toHaveAttribute("href", /dataprotection\.gov\.cy/);
	await expect(page.getByText(/Ιάσονος 1, 1082 Λευκωσία/).first()).toBeVisible();
	// Facilities only: the pharmacist's name and home telephone number are never read.
	await expect(page.getByText(/το τηλέφωνο οικίας του/).first()).toBeVisible();
	await expect(page.getByText(/Στάθμιση του έννομου συμφέροντος/).first()).toBeVisible();
});

test("the terms give the emergency numbers 112 and 199", async ({ page }) => {
	await page.goto("/cy/oroi-chrisis");
	await expect(page.getByText(/καλέστε το 112 ή το 199/).first()).toBeVisible();
});

test("the privacy notice and the data page credit every source word for word", async ({ page }) => {
	expect(CREDITS.every((credit) => credit.includes("CC BY 4.0"))).toBe(true);
	for (const path of ["/cy/aporrito", "/cy/dedomena"]) {
		await page.goto(path);
		for (const credit of CREDITS) {
			await expect(page.getByText(credit, { exact: true }).first()).toBeVisible();
		}
	}
});

test("the data page links the licence and the portal, says what is kept and that the north is not covered", async ({
	page,
}) => {
	await page.goto("/cy/dedomena");
	await expect(
		page.getByRole("link", { name: /Creative Commons Αναφορά Δημιουργού 4\.0 Διεθνές/ }).first(),
	).toHaveAttribute("href", /creativecommons\.org\/licenses\/by\/4\.0/);
	await expect(
		page.getByRole("link", { name: /Η Εθνική Πύλη Ανοικτών Δεδομένων \(data\.gov\.cy\)/ }),
	).toHaveAttribute("href", /data\.gov\.cy/);
	await expect(page.getByText(/Τι διατηρείται και γιατί/).first()).toBeVisible();
	await expect(
		page
			.getByText(
				/η Κυβέρνηση της Κυπριακής Δημοκρατίας δεν ασκεί πραγματικό έλεγχο: καμία ανοιχτή πηγή δεν δημοσιεύει τις μονάδες εκεί/,
			)
			.first(),
	).toBeVisible();
	for (const kind of ["Κρατικά νοσοκομεία", "Κρατικά κέντρα υγείας", "Ιδιωτικά φαρμακεία"]) {
		await expect(page.getByText(kind, { exact: true }).first()).toBeVisible();
	}
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Cypriot objection form", () => {
	// A registration number above the fixtures' (the scheme allows six digits).
	const nationalId = String(900_000 + Math.floor(Math.random() * 99_999));
	const slug = `enstasi-paradeigma-f${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('CY', 'CY-FARM', ${nationalId}, '', 'Ένσταση Παράδειγμα', '', 'Ένσταση Παράδειγμα',
					'CY_PHARMACY', ${slug}, false)
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

	test("withholds a page found by its address, answering in Greek", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client (5 an hour), and the other
		// markets' objection specs use ranges of their own.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.174.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto("/cy/dedomena#remove");
		const form = page.locator("#remove form");
		await form.getByRole("textbox").first().fill(`https://apercura.org/cy/monada/${slug}`);
		await form.getByLabel(/e-mail/i).fill("enstasi@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "el-CY" });
		} finally {
			await sql.end();
		}
	});
});
