import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { latestEmailText } from "./mailpit";
import {
	createProAccount,
	expectNoAxeViolations,
	type ProAccount,
	resetPractitioner,
	signIn,
	testDb,
} from "./pro";

/*
 * Claims, the page editor and the GDPR tools on the synthetic fixtures. Each
 * test owns one fictitious practitioner and puts it back as imported first.
 * Pro Santé Connect is the local mock (e2e/mock-psc.ts).
 */

const PSC_PRACTITIONER = { rpps: "19999990047", slug: "bruno-de-la-maquette-19999990047" };
const DOCUMENT_PRACTITIONER = { rpps: "19999990062", slug: "david-temoin-19999990062" };
const OPT_OUT_PRACTITIONER = { rpps: "19999990120", slug: "julie-modele-19999990120" };
const REPORTED_PRACTITIONER = { rpps: "19999990070", slug: "emma-echantillon-19999990070" };

test.describe.configure({ mode: "serial" });

/**
 * One reviewer account for the whole file, kept signed in: password sign-ins
 * are limited to 5 a minute and sign-ups to 5 an hour, and the test server
 * sees every spec as one client. It starts as a plain account (first test)
 * and is promoted to platform administrator when a test needs one.
 */
let reviewer: { context: BrowserContext; page: Page; account: ProAccount } | undefined;

async function reviewerSession(
	browser: Browser,
	request: Parameters<typeof createProAccount>[1],
	baseURL: string,
	options: { admin: boolean },
) {
	if (!reviewer) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const account = await createProAccount(page, request, { name: "Exemple Relecteur", baseURL });
		reviewer = { context, page, account };
	}
	const sql = testDb();
	try {
		await sql`
			UPDATE directory."user" SET is_platform_admin = ${options.admin}
			WHERE email = ${reviewer.account.email}
		`;
	} finally {
		await sql.end();
	}
	return reviewer.page;
}

test.afterAll(async () => {
	await reviewer?.context.close();
	reviewer = undefined;
});

test("signed-out visitors and non-administrators cannot reach the practitioner and admin pages", async ({
	page,
	browser,
	request,
	baseURL,
}) => {
	for (const path of [
		"/fr/pro/page",
		"/fr/pro/bienvenue",
		"/fr/pro/revendiquer",
		"/fr/pro/admin/revendications",
	]) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/pro\/connexion$/);
	}
	const plain = await reviewerSession(browser, request, baseURL as string, { admin: false });
	for (const path of ["/fr/pro/admin/revendications", "/fr/pro/admin/signalements"]) {
		await plain.goto(path);
		await expect(plain).toHaveURL(/\/pro\/tableau-de-bord$/);
	}
	const document = await plain.request.get(
		"/api/admin/claim-documents/00000000-0000-4000-8000-000000000000",
	);
	expect(document.status()).toBe(403);
});

test("a visitor from “Claim this page” comes back to the claim of that RPPS after signing in", async ({
	browser,
	request,
	baseURL,
}) => {
	await reviewerSession(browser, request, baseURL as string, { admin: false });
	const account = reviewer?.account as ProAccount;
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto("/fr/praticien/camille-exemple-19999990013");
	await page.getByRole("link", { name: "Revendiquer cette page" }).click();
	await expect(page).toHaveURL(
		/\/pro\/connexion\?suite=%2Fpro%2Frevendiquer%3Frpps%3D19999990013$/,
	);
	// The sign-up link keeps the intent too.
	await expect(page.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
		"href",
		"/fr/pro/inscription?suite=%2Fpro%2Frevendiquer%3Frpps%3D19999990013",
	);
	await signIn(page, account, { from: page.url() });
	await expect(page).toHaveURL(/\/pro\/revendiquer\?rpps=19999990013$/);
	await expect(page.getByRole("button", { name: "C’est moi : revendiquer la page" })).toBeVisible();
	// A foreign target is ignored: the space opens instead.
	await page.goto("/fr/pro/connexion?suite=https%3A%2F%2Fevil.example%2F");
	await expect(page.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
		"href",
		"/fr/pro/inscription",
	);
	await context.close();
});

test("claim with Pro Santé Connect, complete the page, and the public page follows", async ({
	page,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	await resetPractitioner(PSC_PRACTITIONER.rpps);
	const account = await createProAccount(page, request, {
		name: "Bruno Maquette",
		baseURL: baseURL as string,
	});

	// 1. Start the claim from the RPPS number.
	await page.goto(`/fr/pro/revendiquer?rpps=${PSC_PRACTITIONER.rpps}`);
	await expect(page.getByRole("heading", { name: "La page que vous revendiquez" })).toBeVisible();
	await expectNoAxeViolations(page);
	await page.getByRole("button", { name: "C’est moi : revendiquer la page" }).click();
	await expect(page).toHaveURL(/\/pro\/revendiquer\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: "Pro Santé Connect", level: 2 })).toBeVisible();
	await expectNoAxeViolations(page);

	// 2. Pro Santé Connect (mock): the identity 8 + RPPS verifies the claim at once.
	await page.getByRole("button", { name: "Continuer avec Pro Santé Connect" }).click();
	await page.getByLabel("Numéro RPPS").fill(PSC_PRACTITIONER.rpps);
	await page.getByRole("button", { name: "Valider avec e-CPS" }).click();
	await expect(page).toHaveURL(/\?psc=verified$/);
	// Said once: the verified status, stamped violet, with the next step as the primary action.
	await expect(
		page.getByRole("heading", { level: 2, name: "Votre page est vérifiée" }),
	).toBeVisible();
	await expect(page.getByText("Page vérifiée", { exact: true })).toBeVisible();
	await expect(page.getByText("Pro Santé Connect a confirmé votre identité")).toHaveCount(0);
	await expectNoAxeViolations(page);

	// 3. Onboarding: check, booking placeholder, publish.
	await page.getByRole("link", { name: "Compléter votre page" }).click();
	await expect(
		page.getByRole("heading", { name: "Vérifiez les informations importées" }),
	).toBeVisible();
	await expectNoAxeViolations(page);
	await page.getByRole("link", { name: "Continuer" }).click();
	await expect(
		page.getByRole("heading", { name: "Horaires et prise de rendez-vous" }),
	).toBeVisible();
	// The owner goes on to the booking settings from here.
	await expect(
		page.getByRole("link", { name: "Régler horaires et prise de rendez-vous" }),
	).toBeVisible();
	await expectNoAxeViolations(page);
	await page.getByRole("link", { name: "Continuer" }).click();
	await page.getByRole("button", { name: "Publier ma page" }).click();
	await expect(page).toHaveURL(/\/pro\/page$/);

	// 4. The editor: plain text, choices, fees, a photo; the preview follows the draft.
	await expect(page.getByRole("heading", { level: 1, name: "Votre page" })).toBeVisible();
	await expectNoAxeViolations(page);
	const headline = "Cardiologie de ville, échographie cardiaque";
	await page.getByRole("textbox", { name: "Accroche" }).fill(headline);
	await page
		.getByRole("textbox", { name: "Présentation" })
		.fill("Consultations sur rendez-vous.\n\nSuivi des patients après un séjour à l’hôpital.");
	await expect(page.getByTestId("page-preview").getByText(headline)).toBeVisible();
	await page.locator("label").filter({ hasText: "Anglais" }).first().click();
	await page.getByRole("button", { name: "Ajouter un tarif" }).click();
	await page.getByLabel("Tarif 1 : prestation").fill("Consultation");
	await page.getByLabel("Montant (€)").fill("60");
	await page.locator("label").filter({ hasText: "Carte bancaire" }).first().click();
	await page.locator("label").filter({ hasText: "Ascenseur" }).first().click();
	await expect(
		page.getByTestId("page-preview").getByText("Consultation", { exact: true }),
	).toBeVisible();

	// Markup is refused, not stored.
	await page.getByRole("textbox", { name: "Accroche" }).fill("<b>Le meilleur</b>");
	await page.getByRole("button", { name: "Enregistrer la page" }).click();
	await expect(
		page.getByText("Texte simple uniquement : pas de HTML ni de liens entre crochets."),
	).toBeVisible();
	await page.getByRole("textbox", { name: "Accroche" }).fill(headline);
	await page.getByRole("button", { name: "Enregistrer la page" }).click();
	await expect(page.getByText("Enregistré. Votre page publique est à jour.")).toBeVisible();

	const photo = await sharp({
		create: { width: 320, height: 400, channels: 3, background: { r: 0, g: 56, b: 81 } },
	})
		.jpeg()
		.withExif({ IFD0: { Copyright: "Exemple", Artist: "Exemple Praticien" } })
		.toBuffer();
	await page.locator('input[type="file"]').first().setInputFiles({
		name: "portrait.jpg",
		mimeType: "image/jpeg",
		buffer: photo,
	});
	const current = page.getByRole("img", { name: "Photo actuelle" });
	await expect(current).toBeVisible();
	const photoPath = await current.getAttribute("src");
	expect(photoPath).toMatch(/^\/media\/photos\/[0-9a-f-]{36}\.webp$/);
	const served = await page.request.get(photoPath as string);
	expect(served.headers()["content-type"]).toBe("image/webp");
	const metadata = await sharp(await served.body()).metadata();
	expect(metadata.format).toBe("webp");
	expect(metadata.width).toBe(640);
	expect(metadata.exif).toBeUndefined();

	// 5. The public page shows the owner's content and the verified stamp.
	await page.goto(`/fr/praticien/${PSC_PRACTITIONER.slug}`);
	await expect(page.getByText("Page vérifiée", { exact: true })).toBeVisible();
	await expect(page.getByText(headline)).toBeVisible();
	await expect(page.getByText("Suivi des patients après un séjour à l’hôpital.")).toBeVisible();
	await expect(page.getByText("Anglais", { exact: true })).toBeVisible();
	await expect(page.getByText(/60\s€/)).toBeVisible();
	await expect(page.getByText("Carte bancaire", { exact: true })).toBeVisible();
	await expect(page.locator(`img[src="${photoPath}"]`)).toBeVisible();
	await expect(page.getByRole("link", { name: "Revendiquer cette page" })).toHaveCount(0);
	await expectNoAxeViolations(page);

	// 6. Pro Santé Connect now signs this account in, as strong authentication.
	await page.goto("/fr/pro/tableau-de-bord");
	await page.getByRole("button", { name: "Se déconnecter" }).click();
	await expect(page).toHaveURL(/\/pro\/connexion$/);
	await page.getByRole("button", { name: "Se connecter avec Pro Santé Connect" }).click();
	await page.getByLabel("Numéro RPPS").fill(PSC_PRACTITIONER.rpps);
	await page.getByRole("button", { name: "Valider avec e-CPS" }).click();
	await expect(page).toHaveURL(/\/pro\/tableau-de-bord$/);
	await expect(page.getByText(`Connecté avec ${account.email}.`)).toBeVisible();
	await page.goto("/fr/pro/page");
	await expect(page.getByRole("textbox", { name: "Accroche" })).toHaveValue(headline);
});

test("claim with a document and a registry phone callback; an administrator approves", async ({
	page,
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	await resetPractitioner(DOCUMENT_PRACTITIONER.rpps);
	const claimant = await createProAccount(page, request, {
		name: "David Temoin",
		baseURL: baseURL as string,
	});
	await page.goto(`/fr/pro/revendiquer?rpps=${DOCUMENT_PRACTITIONER.rpps}`);
	await page.getByRole("button", { name: "C’est moi : revendiquer la page" }).click();
	await expect(page.getByRole("heading", { name: "Un justificatif et un appel" })).toBeVisible();

	// A synthetic "CPS card", encrypted before storage.
	await page
		.locator('input[type="file"]')
		.first()
		.setInputFiles({
			name: "carte-cps.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(
				"%PDF-1.4\n% synthetic test document\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
			),
		});
	await expect(page.getByText("Carte CPS", { exact: true })).toBeVisible();
	// Withdrawing asks first, naming the consequence.
	await page.getByRole("button", { name: "Retirer cette revendication" }).click();
	const confirm = page.getByRole("alertdialog", { name: "Retirer cette revendication ?" });
	await expect(confirm).toBeVisible();
	await expect(confirm.getByText(/justificatifs sont supprimés dans 30 jours/)).toBeVisible();
	await confirm.getByRole("button", { name: "Garder la revendication" }).click();
	await expect(confirm).toHaveCount(0);
	await page.getByRole("button", { name: "Afficher mon code" }).click();
	const code = (await page.getByTestId("callback-code").textContent())?.trim() ?? "";
	expect(code).toMatch(/^\d{6}$/);
	await page.getByRole("button", { name: "Envoyer pour examen" }).click();
	await expect(page.getByText("Votre revendication est en cours d’examen").first()).toBeVisible();
	await expectNoAxeViolations(page);

	const sql = testDb();
	try {
		const [stored] = await sql<{ storage_key: string }[]>`
			SELECT d.storage_key FROM directory.claim_documents d
			JOIN directory.claims c ON c.id = d.claim_id
			JOIN directory.practitioners p ON p.id = c.practitioner_id
			WHERE p.national_id = ${DOCUMENT_PRACTITIONER.rpps}
		`;
		expect(stored?.storage_key).toMatch(/^claims\/[0-9a-f-]{36}$/);
	} finally {
		await sql.end();
	}

	// The administrator, in another browser context.
	const admin = await reviewerSession(browser, request, baseURL as string, { admin: true });
	await admin.goto("/fr/pro/admin/revendications");
	await expect(admin.getByRole("heading", { level: 1, name: "Revendications" })).toBeVisible();
	await expectNoAxeViolations(admin);
	await admin.getByRole("link", { name: /Temoin/ }).click();
	await expect(admin.getByRole("heading", { name: "Rappel téléphonique" })).toBeVisible();
	await expectNoAxeViolations(admin);

	const documentLink = admin.getByRole("link", { name: /Ouvrir le justificatif/ });
	const documentResponse = await admin.request.get(
		(await documentLink.getAttribute("href")) as string,
	);
	expect(documentResponse.status()).toBe(200);
	expect(documentResponse.headers()["content-type"]).toBe("application/pdf");
	expect(documentResponse.headers()["cache-control"]).toContain("no-store");
	expect((await documentResponse.body()).toString("utf8")).toContain("synthetic test document");

	await admin.getByLabel(/Code lu par le cabinet/).fill(code);
	await admin.getByRole("button", { name: "Vérifier le code" }).click();
	await expect(admin.getByText("Le rappel téléphonique a réussi.")).toBeVisible();
	await admin.getByRole("button", { name: "Approuver", exact: true }).click();
	await expect(admin).toHaveURL(/\/pro\/admin\/revendications$/);

	const check = testDb();
	try {
		const [claim] = await check<{ status: string; delay: number; audits: number }[]>`
			SELECT c.status,
				extract(epoch FROM (c.booking_opens_at - c.verified_at)) / 86400 AS delay,
				(SELECT count(*)::integer FROM directory.platform_audit_events e
					JOIN directory.claim_documents d ON d.id::text = e.subject_id
					WHERE d.claim_id = c.id AND e.action = 'claim_document.decrypt') AS audits
			FROM directory.claims c
			JOIN directory.practitioners p ON p.id = c.practitioner_id
			WHERE p.national_id = ${DOCUMENT_PRACTITIONER.rpps}
		`;
		expect(claim?.status).toBe("verified");
		expect(Math.round(Number(claim?.delay))).toBe(7);
		expect(claim?.audits).toBe(1);
	} finally {
		await check.end();
	}
	expect(await latestEmailText(request, claimant.email)).toContain("Votre page est vérifiée");

	await page.goto(`/fr/praticien/${DOCUMENT_PRACTITIONER.slug}`);
	await expect(page.getByText("Page vérifiée", { exact: true })).toBeVisible();
});

test("objecting to an unclaimed page hides it at once; once an administrator confirms, only its suppression stays", async ({
	page,
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(120_000);
	await resetPractitioner(OPT_OUT_PRACTITIONER.rpps);
	await page.goto(`/fr/praticien/${OPT_OUT_PRACTITIONER.slug}`);
	await page
		.getByRole("link", {
			name: "Vous êtes le titulaire de cette page et ne souhaitez pas apparaître publiquement ? C’est ici",
		})
		.click();
	await expect(
		page.getByRole("heading", { level: 1, name: "Demander le retrait de cette page" }),
	).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	await expectNoAxeViolations(page);
	await page.getByLabel("Votre e-mail").fill("julie.modele@example.test");
	await page
		.locator("label")
		.filter({ hasText: "Je suis le praticien de cette page" })
		.first()
		.click();
	await page.getByRole("button", { name: "Masquer et retirer la page" }).click();
	await expect(page.getByText("La page est masquée")).toBeVisible();
	// What happens next, and when: no promise of an instant deletion.
	await expect(page.getByText(/dans un délai d’un mois au plus/)).toBeVisible();

	// Hidden at once: a real 404 like an unknown page (never a soft 404, nothing about the
	// person), noindex, out of sitemaps and searches.
	const hidden = await page.goto(`/fr/praticien/${OPT_OUT_PRACTITIONER.slug}`);
	expect(hidden?.status()).toBe(404);
	await expect(page.getByText("Modele")).toHaveCount(0);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	const index = await (await request.get("/sitemap.xml")).text();
	for (const chunk of index.match(/\/sitemaps\/fr\/praticiens-\d+\.xml/g) ?? []) {
		expect(await (await request.get(chunk)).text()).not.toContain(OPT_OUT_PRACTITIONER.slug);
	}
	const sql = testDb();
	try {
		const [row] = await sql<{ indexable: boolean; search: boolean; contact: string }[]>`
			SELECT p.indexable, sd.indexable AS search, r.contact_enc AS contact
			FROM directory.practitioners p
			JOIN directory.search_docs sd ON sd.practitioner_id = p.id
			JOIN directory.removal_requests r ON r.practitioner_id = p.id
			WHERE p.national_id = ${OPT_OUT_PRACTITIONER.rpps}
		`;
		expect(row?.indexable).toBe(false);
		expect(row?.search).toBe(false);
		// The requester's address is encrypted (platform key), never stored in clear.
		expect(row?.contact).toMatch(/^enc:v1:/);
		expect(row?.contact).not.toContain("julie");
	} finally {
		await sql.end();
	}
	expect(await latestEmailText(request, "julie.modele@example.test")).toContain(
		"Votre demande de retrait est bien reçue",
	);

	// The light check: an administrator confirms, the page is suppressed for good.
	const admin = await reviewerSession(browser, request, baseURL as string, { admin: true });
	await admin.goto("/fr/pro/admin/signalements");
	await expect(
		admin.getByRole("heading", { level: 1, name: "Signalements et retraits" }),
	).toBeVisible();
	await expectNoAxeViolations(admin);
	const row = admin.getByRole("row", { name: /Modele/ });
	await row.getByRole("button", { name: "Lire" }).click();
	await expect(row.getByText("julie.modele@example.test")).toBeVisible();
	await row.getByRole("button", { name: "Supprimer la page" }).click();
	await expect(admin.getByRole("row", { name: /Modele/ })).toHaveCount(0);

	// Removed for good: the same 404 as an unknown page (like a withheld one), noindex, nothing
	// about the person, and out of every sitemap.
	const gone = await page.goto(`/fr/praticien/${OPT_OUT_PRACTITIONER.slug}`);
	expect(gone?.status()).toBe(404);
	await expect(page.getByText("Modele")).toHaveCount(0);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	const sitemap = await (await request.get("/sitemap.xml")).text();
	for (const chunk of sitemap.match(/\/sitemaps\/fr\/praticiens-\d+\.xml/g) ?? []) {
		expect(await (await request.get(chunk)).text()).not.toContain(OPT_OUT_PRACTITIONER.slug);
	}
	// Only the suppression is kept (#116): no practitioner row, so nothing hanging off one (page,
	// search entry, removal request) either.
	const suppressed = testDb();
	try {
		const [left] = await suppressed<{ reason: string; practitioners: number; pages: number }[]>`
			SELECT s.reason,
				(SELECT count(*)::integer FROM directory.practitioners p
					WHERE p.national_id = s.national_id) AS practitioners,
				(SELECT count(*)::integer FROM directory.practitioner_pages pg
					WHERE pg.slug = ${OPT_OUT_PRACTITIONER.slug}) AS pages
			FROM directory.suppressions s
			WHERE s.country = 'FR' AND s.id_scheme = 'RPPS' AND s.national_id = ${OPT_OUT_PRACTITIONER.rpps}
		`;
		expect(left).toEqual({ reason: "objection", practitioners: 0, pages: 0 });
	} finally {
		await suppressed.end();
	}
});

test("reporting an error stores the message encrypted", async ({ page }) => {
	await resetPractitioner(REPORTED_PRACTITIONER.rpps);
	await page.goto(`/fr/praticien/${REPORTED_PRACTITIONER.slug}/signaler`);
	await expect(page.getByRole("heading", { level: 1, name: "Signaler une erreur" })).toBeVisible();
	await expectNoAxeViolations(page);
	await page.getByRole("radio", { name: "Le praticien est à la retraite" }).check();
	await page
		.getByLabel("Précisions")
		.fill("Cabinet fermé depuis le mois dernier (exemple de test).");
	await page.getByRole("button", { name: "Envoyer le signalement" }).click();
	await expect(page.getByText("Merci, votre signalement est bien reçu")).toBeVisible();
	const sql = testDb();
	try {
		const [report] = await sql<{ kind: string; content_enc: string }[]>`
			SELECT r.kind, r.content_enc FROM directory.reports r
			JOIN directory.practitioners p ON p.id = r.practitioner_id
			WHERE p.national_id = ${REPORTED_PRACTITIONER.rpps}
			ORDER BY r.created_at DESC LIMIT 1
		`;
		expect(report?.kind).toBe("retired");
		expect(report?.content_enc).toMatch(/^enc:v1:/);
		expect(report?.content_enc).not.toContain("Cabinet");
	} finally {
		await sql.end();
	}
});

for (const path of ["/fr/donnees", "/fr/pro/revendication-email"]) {
	test(`${path} has no axe violations`, async ({ page }) => {
		await page.goto(path);
		await expectNoAxeViolations(page);
	});
}
