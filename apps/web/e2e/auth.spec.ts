import { expect, type Page, test } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { axeViolations } from "./axe";
import { latestEmailText } from "./mailpit";

async function expectNoAxeViolations(page: Page) {
	await expect(page.locator("main h1:visible")).toBeVisible();
	// React Aria announces a pending button through a live-region node labelled
	// by the button (the first announcement on a page is deferred by 100 ms).
	// When the step is done and the button is gone, that node points at nothing
	// until React Aria clears it, 7 s later: let it appear, then wait it out.
	await page.waitForTimeout(250);
	await expect(page.locator('[aria-live] [role="img"]')).toHaveCount(0, { timeout: 10_000 });
	expect(await axeViolations(page)).toEqual([]);
}

/** A TOTP code that differs from the last one used (codes are single-use within their window). */
async function freshCode(totp: OTPAuth.TOTP, used: Set<string>) {
	for (;;) {
		const code = totp.generate();
		if (!used.has(code)) {
			used.add(code);
			return code;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
}

for (const path of [
	"/pro/connexion",
	"/pro/inscription",
	"/en/pro/connexion",
	"/en/pro/inscription",
]) {
	test(`${path} has no axe violations and is not indexed`, async ({ page }) => {
		await page.goto(path);
		await expectNoAxeViolations(page);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	});
}

for (const path of ["/pro/tableau-de-bord", "/pro/securite", "/pro/connexion/verification"]) {
	test(`${path} sends signed-out visitors to sign in`, async ({ page }) => {
		await page.goto(path);
		await expect(page).toHaveURL(/\/pro\/connexion$/);
	});
}

test("a broken email link says so and offers to sign in", async ({ page }) => {
	await page.goto("/pro/verification-email?error=invalid_token");
	await expect(page.getByText("Ce lien ne fonctionne plus.")).toBeVisible();
	await expectNoAxeViolations(page);
});

test("sign up, confirm the email, enrol TOTP, then sign in with password and code", async ({
	page,
	request,
}) => {
	test.setTimeout(120_000);
	const email = `exemple.martin.${Date.now()}@example.test`;
	const password = "une longue phrase de passe pour Apercura";
	const usedCodes = new Set<string>();

	// 1. Sign up.
	await page.goto("/pro/inscription");
	await page.getByLabel("Prénom et nom").fill("Exemple Martin");
	await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
	await page.getByLabel("Mot de passe", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Créer le compte" }).click();
	await expect(page.getByRole("heading", { name: "Consultez votre messagerie" })).toBeFocused();

	// 2. Follow the confirmation link from the email (French: the account was created in French).
	const text = await latestEmailText(request, email);
	expect(text).toContain("Confirmez votre adresse e-mail");
	const link = text.match(/https?:\/\/\S+\/api\/auth\/verify-email\?\S+/)?.[0];
	expect(link).toBeTruthy();
	await page.goto(link as string);
	await expect(page).toHaveURL(/\/pro\/verification-email/);
	await expect(page.getByText("Votre adresse e-mail est confirmée.")).toBeVisible();
	await expectNoAxeViolations(page);

	// 3. Sign in with the password only: the space asks for a second factor first.
	await page.getByRole("link", { name: "Se connecter" }).click();
	await expect(page).toHaveURL(/\/pro\/connexion$/);
	await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
	await page.getByLabel("Mot de passe", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Se connecter", exact: true }).click();
	await expect(page).toHaveURL(/\/pro\/securite$/);
	await expect(page.getByText("Choisissez un second facteur pour continuer")).toBeVisible();
	await expectNoAxeViolations(page);

	// The space and the session list stay closed until then.
	await page.goto("/pro/tableau-de-bord");
	await expect(page).toHaveURL(/\/pro\/securite$/);

	// 4. Enrol the authenticator app.
	await page.getByLabel("Votre mot de passe", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Configurer l’application" }).click();
	const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
	expect(secret).toMatch(/^[A-Z2-7]+=*$/);
	await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
	await expectNoAxeViolations(page);
	const totp = new OTPAuth.TOTP({
		secret: OTPAuth.Secret.fromBase32(secret),
		algorithm: "SHA1",
		digits: 6,
		period: 30,
	});
	await page.getByLabel(/Code à 6 chiffres/).fill(await freshCode(totp, usedCodes));
	await page.getByRole("button", { name: "Activer" }).click();
	await expect(page.getByText("L’application d’authentification est configurée.")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Où vous êtes connecté" })).toBeVisible();
	await expectNoAxeViolations(page);

	// 5. The space opens.
	await page.getByRole("link", { name: "Continuer vers votre espace" }).click();
	await expect(page).toHaveURL(/\/pro\/tableau-de-bord$/);
	await expect(page.getByRole("heading", { level: 1, name: "Votre espace" })).toBeVisible();
	await expectNoAxeViolations(page);

	// 6. Sign out, then sign in again: password, then the TOTP code.
	await page.getByRole("button", { name: "Se déconnecter" }).click();
	await expect(page).toHaveURL(/\/pro\/connexion$/);
	await page.goto("/pro/tableau-de-bord");
	await expect(page).toHaveURL(/\/pro\/connexion$/);
	await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
	await page.getByLabel("Mot de passe", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Se connecter", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Saisissez votre code" })).toBeFocused();
	await expectNoAxeViolations(page);
	await page.getByLabel(/Code à 6 chiffres/).fill(await freshCode(totp, usedCodes));
	await page.getByRole("button", { name: "Confirmer" }).click();
	await expect(page).toHaveURL(/\/pro\/tableau-de-bord$/);
	await expect(page.getByRole("heading", { level: 1, name: "Votre espace" })).toBeVisible();
	await expect(page.getByText(`Connecté avec ${email}.`)).toBeVisible();
});
