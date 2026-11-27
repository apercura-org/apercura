import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";
import { testDb } from "./pro";

/**
 * The institutional pages of the Swiss market in its three languages (`/ch`, `/ch-fr`,
 * `/ch-it`), written for Swiss law (the Impressum of the UWG, the privacy notice of the revised
 * DSG / nLPD with its GDPR section), and its objection form. The e2e server sets no LEGAL_*
 * variable: every fact is a placeholder.
 */
const LANGUAGES = ["de-CH", "fr-CH", "it-CH"] as const;
type SwissLocale = (typeof LANGUAGES)[number];

/** Each legal page in the market's three languages, by the internal route it is. */
const PAGES = {
	legalNotice: {
		"de-CH": "/ch/impressum",
		"fr-CH": "/ch-fr/mentions-legales",
		"it-CH": "/ch-it/note-legali",
	},
	privacy: {
		"de-CH": "/ch/datenschutz",
		"fr-CH": "/ch-fr/confidentialite",
		"it-CH": "/ch-it/privacy",
	},
	terms: {
		"de-CH": "/ch/nutzungsbedingungen",
		"fr-CH": "/ch-fr/conditions",
		"it-CH": "/ch-it/condizioni",
	},
	accessibility: {
		"de-CH": "/ch/barrierefreiheit",
		"fr-CH": "/ch-fr/accessibilite",
		"it-CH": "/ch-it/accessibilita",
	},
	data: { "de-CH": "/ch/daten", "fr-CH": "/ch-fr/donnees", "it-CH": "/ch-it/dati" },
} as const satisfies Record<string, Record<SwissLocale, string>>;

/** Other markets' law, which a Swiss page never cites. */
const FOREIGN = [
	"LCEN",
	"CNIL",
	"RGAA",
	"Pro Santé Connect",
	"RPPS",
	"ICO",
	"HDS",
	"LOPDGDD",
	"AEPD",
	"LSSI",
	"ÚOOÚ",
	"Garante per la protezione",
	"D.Lgs.",
	"Open Government Licence",
	"E-Commerce-Gesetz",
	"ECG",
];

/** The name of the language menu in each language. */
const MENU = { "de-CH": "Sprache", "fr-CH": "Langue", "it-CH": "Lingua" } as const;

/** The hreflang alternates of a page, by hreflang, paths only. */
async function alternatesOf(page: Page): Promise<Record<string, string>> {
	const links = await page.locator('link[rel="alternate"][hreflang]').all();
	const entries = await Promise.all(
		links.map(async (link) => [
			(await link.getAttribute("hreflang")) ?? "",
			new URL((await link.getAttribute("href")) ?? "", "http://x").pathname,
		]),
	);
	return Object.fromEntries(entries);
}

for (const [name, paths] of Object.entries(PAGES)) {
	for (const locale of LANGUAGES) {
		const path = paths[locale];
		test(`${path} (${name}) answers 200 in its language, with its two other languages and no axe violations`, async ({
			page,
		}) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
			await expect(page.locator("main h1")).toBeVisible();
			await expect(page.locator("html")).toHaveAttribute("lang", locale);
			const text = ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ");
			for (const foreign of FOREIGN) {
				expect(text, `${path} mentions ${foreign}`).not.toContain(foreign);
			}
			// Swiss Standard German never writes "ß".
			if (locale === "de-CH") expect(text).not.toContain("ß");
			await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /^index/);
			// The same page in the market's three languages, and nothing towards another market.
			expect(await alternatesOf(page)).toEqual(paths);
			// The language menu offers the same page in the other two.
			const menu = page.getByRole("navigation", { name: MENU[locale] });
			for (const other of LANGUAGES) {
				await expect(menu.locator(`a[hreflang="${other}"]`)).toHaveAttribute("href", paths[other]);
			}
			expect(await axeViolations(page)).toEqual([]);
		});
	}
}

test("the Impressum cites the UWG and shows its facts as placeholders, in each language", async ({
	page,
}) => {
	for (const locale of LANGUAGES) {
		await page.goto(PAGES.legalNotice[locale]);
		await expect(page.getByText(/UWG|LCD|LCSl/).first()).toBeVisible();
		await expect(page.getByText("{{PUBLISHER_NAME}}", { exact: true }).first()).toBeVisible();
	}
});

test("the privacy notice has the nFADP sections, in each language", async ({ page }) => {
	const law = { "de-CH": /DSG/, "fr-CH": /LPD/, "it-CH": /LPD/ } as const;
	const commissioner = { "de-CH": /EDÖB/, "fr-CH": /PFPDT/, "it-CH": /IFPDT/ } as const;
	for (const locale of LANGUAGES) {
		await page.goto(PAGES.privacy[locale]);
		const main = page.locator("main");
		// The controller, the law it follows, the information owed, disclosure abroad, the
		// objection, the rights and the GDPR for visitors in the EU: each a section with a heading.
		for (const id of [
			"controller",
			"law",
			"information",
			"abroad",
			"objection",
			"rights",
			"gdpr",
		]) {
			await expect(main.locator(`section#${id} h2`), `${locale} #${id}`).toBeVisible();
		}
		await expect(main.getByText(law[locale]).first()).toBeVisible();
		await expect(main.getByText(commissioner[locale]).first()).toBeVisible();
	}
});

test("the privacy notice and the data page credit the sources word for word, in the page's language", async ({
	page,
}) => {
	const foph = {
		"de-CH": "Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler 2023",
		"fr-CH":
			"Source : © Office fédéral de la santé publique (OFSP), Chiffres-clés des hôpitaux suisses 2023",
		"it-CH":
			"Fonte: © Ufficio federale della sanità pubblica (UFSP), Cifre chiave degli ospedali svizzeri 2023",
	} as const;
	const communes = {
		"de-CH": "Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz",
		"fr-CH": "Source : OFS – Répertoire officiel des communes de Suisse",
		"it-CH": "Fonte: UST – Elenco ufficiale dei Comuni della Svizzera",
	} as const;
	// Geneva's SITG asks for the day of the download: the day of the last Swiss import, in French.
	const sitg =
		/^Source : Portail des données SITG \(État de Genève\)(?:, téléchargé en date du \d{1,2}(?:er)? [a-zéû]+ \d{4})? ; données compilées par Apercura$/;
	for (const locale of LANGUAGES) {
		for (const path of [PAGES.privacy[locale], PAGES.data[locale]]) {
			await page.goto(path);
			await expect(page.locator('[data-attribution="ch-bag-kzp"]').first()).toHaveText(
				foph[locale],
			);
			await expect(page.locator('[data-attribution="ch-bfs-gemeinden"]').first()).toHaveText(
				communes[locale],
			);
			for (const id of ["ch-ge-hopitaux", "ch-ge-ems", "ch-ge-pharmacies"]) {
				await expect(page.locator(`[data-attribution="${id}"]`).first()).toHaveText(sitg);
			}
			await expect(page.getByText("{date}", { exact: false })).toHaveCount(0);
		}
	}
	await page.goto(PAGES.data["de-CH"]);
	await expect(page.locator("#remove form")).toBeVisible();
});

test.describe("the Swiss objection form", () => {
	const nationalId = `9${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
	const slug = `spital-widerspruch-h${nationalId}`;
	let practitionerId = 0;

	test.beforeAll(async () => {
		const sql = testDb();
		try {
			const [row] = await sql<{ id: number }[]>`
				INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, slug, indexable)
				VALUES ('CH', 'CH-BAG', ${nationalId}, '', 'Spital Widerspruch', '',
					'Spital Widerspruch', 'CH_HOSPITAL', ${slug}, false)
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

	test("withholds a page found by its French address, answering in French", async ({ page }) => {
		// A client of its own: the public forms' rate limit is per client, and the other markets'
		// objection specs share the default one.
		await page.setExtraHTTPHeaders({
			"x-forwarded-for": `10.95.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
		});
		await page.goto(`${PAGES.data["fr-CH"]}#remove`);
		const form = page.locator("#remove form");
		await form
			.getByRole("textbox")
			.first()
			.fill(`https://apercura.org/ch-fr/etablissement/${slug}`);
		await form.getByLabel(/e-mail|courriel/i).fill("opposition@example.test");
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
			expect(row).toEqual({ withheld: true, locale: "fr-CH" });
		} finally {
			await sql.end();
		}
	});
});
