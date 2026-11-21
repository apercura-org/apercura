import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createProAccount, resetPractitioner } from "./pro";

/*
 * Design review captures (not a test): desktop and mobile screenshots of the
 * claim flow, the page editor and the admin queue, written to
 * `.impeccable/review/m4/` (never committed). Runs only with
 * CAPTURE_SCREENSHOTS=1, on the synthetic fixtures.
 */

const OUT = join(import.meta.dirname, "..", "..", "..", ".impeccable", "review", "m4");
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

test.skip(!process.env.CAPTURE_SCREENSHOTS, "design captures run with CAPTURE_SCREENSHOTS=1");

async function capture(page: Page, name: string) {
	mkdirSync(OUT, { recursive: true });
	for (const [label, size] of Object.entries(VIEWPORTS)) {
		await page.setViewportSize(size);
		await page.waitForTimeout(300);
		await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true });
	}
	await page.setViewportSize(VIEWPORTS.desktop);
}

test("capture the claim flow, the editor and the admin queue", async ({
	page,
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(240_000);
	const rpps = "19999990054";
	await resetPractitioner(rpps);
	await resetPractitioner("19999990138");
	await createProAccount(page, request, { name: "Chloe Essai", baseURL: baseURL as string });

	await page.goto(`/pro/revendiquer?rpps=${rpps}`);
	await capture(page, "claim-start");
	await page.getByRole("button", { name: "C’est moi : revendiquer la page" }).click();
	await expect(page).toHaveURL(/\/pro\/revendiquer\/[0-9a-f-]{36}$/);
	await capture(page, "claim-workspace");
	await page.getByRole("button", { name: "Continuer avec Pro Santé Connect" }).click();
	await page.getByLabel("Numéro RPPS").fill(rpps);
	await page.getByRole("button", { name: "Valider avec e-CPS" }).click();
	await expect(page).toHaveURL(/\?psc=verified$/);
	await capture(page, "claim-verified");

	await page.goto("/pro/bienvenue?etape=2");
	await capture(page, "onboarding-booking");
	await page.goto("/pro/bienvenue?etape=3");
	await page.getByRole("button", { name: "Publier ma page" }).click();
	await expect(page).toHaveURL(/\/pro\/page$/);
	await page
		.getByRole("textbox", { name: "Accroche" })
		.fill("Dermatologie médicale et esthétique, adultes et enfants");
	await page
		.getByRole("textbox", { name: "Présentation" })
		.fill(
			"Consultations sur rendez-vous, du lundi au vendredi.\n\nDépistage des cancers de la peau, suivi de l’eczéma et du psoriasis.",
		);
	await page.locator("label").filter({ hasText: "Anglais" }).first().click();
	await page.getByRole("button", { name: "Ajouter un tarif" }).click();
	await page.getByLabel("Tarif 1 : prestation").fill("Consultation");
	await page.getByLabel("Montant (€)").fill("50");
	await page.locator("label").filter({ hasText: "Carte bancaire" }).first().click();
	await page.getByRole("button", { name: "Enregistrer la page" }).click();
	await expect(page.getByText("Enregistré. Votre page publique est à jour.")).toBeVisible();
	await capture(page, "editor");

	// A document claim waiting in the admin queue.
	const claimantContext = await browser.newContext();
	const claimant = await claimantContext.newPage();
	await createProAccount(claimant, request, { name: "Kevin Doublon", baseURL: baseURL as string });
	await claimant.goto("/pro/revendiquer?rpps=19999990138");
	await claimant.getByRole("button", { name: "C’est moi : revendiquer la page" }).click();
	await claimant
		.locator('input[type="file"]')
		.first()
		.setInputFiles({
			name: "attestation.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from("%PDF-1.4\n% synthetic attestation\n%%EOF\n"),
		});
	await expect(claimant.getByText("Carte CPS", { exact: true })).toBeVisible();
	await claimant.getByRole("button", { name: "Afficher mon code" }).click();
	await capture(claimant, "claim-documents");
	await claimant.getByRole("button", { name: "Envoyer pour examen" }).click();
	await expect(
		claimant.getByText("Votre revendication est en cours d’examen").first(),
	).toBeVisible();
	await claimantContext.close();

	const adminContext = await browser.newContext();
	const admin = await adminContext.newPage();
	await createProAccount(admin, request, {
		name: "Exemple Relecteur",
		baseURL: baseURL as string,
		platformAdmin: true,
	});
	await admin.goto("/pro/admin/revendications");
	await capture(admin, "admin-queue");
	await admin.getByRole("link", { name: /Doublon/ }).click();
	await expect(admin.getByRole("heading", { name: "Rappel téléphonique" })).toBeVisible();
	await capture(admin, "admin-claim");
	await admin.goto("/pro/admin/signalements");
	await capture(admin, "admin-reports");
	await adminContext.close();
});
