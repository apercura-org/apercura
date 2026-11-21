import { type APIRequestContext, expect, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";
import postgres from "postgres";
import { axeViolations } from "./axe";

/** Direct database access for test setup (synthetic fixtures only, never production). */
export function testDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is needed by the claim and page specs");
	return postgres(url, { max: 1, onnotice: () => {} });
}

export async function expectNoAxeViolations(page: Page) {
	await expect(page.locator("main h1:visible")).toBeVisible();
	// React Aria's live-region node for pending buttons points at nothing for a moment.
	await page.waitForTimeout(250);
	await expect(page.locator('[aria-live] [role="img"]')).toHaveCount(0, { timeout: 10_000 });
	expect(await axeViolations(page)).toEqual([]);
}

export type ProAccount = { email: string; password: string; totp: OTPAuth.TOTP; used: Set<string> };

/** A TOTP code that differs from the last one used (codes are single-use within their window). */
export async function freshCode(account: ProAccount) {
	for (;;) {
		const code = account.totp.generate();
		if (!account.used.has(code)) {
			account.used.add(code);
			return code;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
}

/**
 * Signs in with the password. The production server limits password sign-ins
 * to 5 a minute and sees every test as one client: when parallel specs hit
 * the limit, wait for the window to pass and try again.
 */
async function submitPassword(page: Page, email: string, password: string, from?: string) {
	for (let attempt = 0; ; attempt++) {
		await page.goto(from ?? "/pro/connexion");
		await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
		await page.getByLabel("Mot de passe", { exact: true }).fill(password);
		await page.getByRole("button", { name: "Se connecter", exact: true }).click();
		const limited = page.getByText("Trop de tentatives. Attendez une minute, puis réessayez.");
		const left = page.waitForURL((url) => !url.pathname.endsWith("/pro/connexion"), {
			timeout: 10_000,
		});
		const outcome = await Promise.race([
			left.then(() => "left" as const),
			limited.waitFor({ timeout: 10_000 }).then(() => "limited" as const),
			page
				.getByLabel(/Code à 6 chiffres/)
				.waitFor({ timeout: 10_000 })
				.then(() => "factor" as const),
		]).catch(() => "unknown" as const);
		if (outcome !== "limited" || attempt >= 3) return;
		await page.waitForTimeout(20_000);
	}
}

/**
 * A practitioner-space account with a confirmed email and an authenticator
 * app, signed in with its second factor. Sign-up goes through the API and
 * the email confirmation through the database (the sign-up flow itself is
 * covered by auth.spec.ts).
 */
export async function createProAccount(
	page: Page,
	request: APIRequestContext,
	options: { name: string; baseURL: string; platformAdmin?: boolean },
): Promise<ProAccount> {
	const email = `${options.name.toLowerCase().replace(/[^a-z]+/g, ".")}.${Date.now()}@example.test`;
	const password = "une longue phrase de passe pour les tests";
	const signUp = await request.post("/api/auth/sign-up/email", {
		data: { email, password, name: options.name, locale: "fr" },
		headers: { origin: new URL(options.baseURL).origin },
	});
	expect(signUp.ok(), await signUp.text()).toBe(true);
	const sql = testDb();
	try {
		await sql`
			UPDATE directory."user" SET email_verified = true,
				is_platform_admin = ${options.platformAdmin === true}
			WHERE email = ${email}
		`;
	} finally {
		await sql.end();
	}

	await submitPassword(page, email, password);
	await expect(page).toHaveURL(/\/pro\/securite$/);
	await page.getByLabel("Votre mot de passe", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Configurer l’application" }).click();
	const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
	const account: ProAccount = {
		email,
		password,
		used: new Set(),
		totp: new OTPAuth.TOTP({
			secret: OTPAuth.Secret.fromBase32(secret),
			algorithm: "SHA1",
			digits: 6,
			period: 30,
		}),
	};
	await page.getByLabel(/Code à 6 chiffres/).fill(await freshCode(account));
	await page.getByRole("button", { name: "Activer" }).click();
	await expect(page.getByText("L’application d’authentification est configurée.")).toBeVisible();
	return account;
}

/** Signs in again with password and TOTP (after a sign-out or in another context). */
export async function signIn(
	page: Page,
	account: ProAccount,
	/** Stay on the sign-in page the visitor was sent to (with its `?suite=`). */
	options: { from?: string } = {},
) {
	await submitPassword(page, account.email, account.password, options.from);
	await page.getByLabel(/Code à 6 chiffres/).fill(await freshCode(account));
	await page.getByRole("button", { name: "Confirmer" }).click();
	if (!options.from) await expect(page).toHaveURL(/\/pro\/tableau-de-bord$/);
}

/**
 * Puts a synthetic practitioner back as the import left it: no claim, no
 * owner, no profile, no removal request or suppression, every place shown.
 * Specs call it first, so they can run again on the same database.
 */
export async function resetPractitioner(rpps: string) {
	const sql = testDb();
	try {
		const [row] = await sql<{ id: number; owner_org_id: string | null }[]>`
			SELECT id, owner_org_id FROM directory.practitioners WHERE national_id = ${rpps}
		`;
		if (!row) throw new Error(`No synthetic practitioner ${rpps}: import the fixtures first`);
		await sql.begin(async (tx) => {
			await tx`DELETE FROM directory.claims WHERE practitioner_id = ${row.id}`;
			await tx`DELETE FROM directory.removal_requests WHERE practitioner_id = ${row.id}`;
			await tx`DELETE FROM directory.reports WHERE practitioner_id = ${row.id}`;
			await tx`DELETE FROM directory.practitioner_profiles WHERE practitioner_id = ${row.id}`;
			await tx`DELETE FROM directory.suppressions WHERE national_id = ${rpps}`;
			// A Pro Santé Connect identity links to one account only: free it for the next run.
			await tx`DELETE FROM directory.account WHERE provider_id = 'psc' AND account_id = ${`8${rpps}`}`;
			const owned = await tx<{ site_id: number | null }[]>`
				DELETE FROM directory.activities WHERE practitioner_id = ${row.id} AND source = 'owner'
				RETURNING site_id
			`;
			for (const site of owned) {
				if (site.site_id) await tx`DELETE FROM directory.sites WHERE id = ${site.site_id}`;
			}
			await tx`UPDATE directory.activities SET hidden = false WHERE practitioner_id = ${row.id}`;
			if (row.owner_org_id)
				await tx`DELETE FROM directory.organization WHERE id = ${row.owner_org_id}`;
			await tx`
				UPDATE directory.practitioners
				SET claim_status = 'unclaimed', owner_org_id = NULL, withheld_at = NULL, status = 'active'
				WHERE id = ${row.id}
			`;
			await tx`SELECT directory.refresh_practitioner(${[row.id]}::integer[])`;
		});
		return row.id;
	} finally {
		await sql.end();
	}
}
