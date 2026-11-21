import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test";
import { waitForEmail } from "./mailpit";

let counter = 0;

/** A fictitious patient with a unique address (the per-email hold limit is 3 an hour). */
export function patient(label: string) {
	counter += 1;
	const id = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
	return {
		firstName: "Alexis",
		lastName: "Fictif",
		email: `e2e-${label}-${id}@example.test`,
		phone: "06 12 34 56 78",
	};
}

/**
 * A distinct client address per test (the server trusts one proxy hop in e2e), so the
 * per-IP booking limits of one test never block another.
 */
export async function ownClientAddress(page: Page) {
	counter += 1;
	const octets = [10, (Date.now() >> 8) & 255, Date.now() & 255, (counter * 37) & 255];
	await page.setExtraHTTPHeaders({ "x-forwarded-for": octets.join(".") });
}

/**
 * Saves a screenshot under E2E_SCREENSHOTS_DIR (design review), when set. The step is shown from
 * its top: the booking sheet (or the page) scrolls back up, or `anchor` scrolls to the top.
 */
export async function capture(page: Page, name: string, anchor?: Locator) {
	const dir = process.env.E2E_SCREENSHOTS_DIR;
	if (!dir) {
		return;
	}
	mkdirSync(dir, { recursive: true });
	if (anchor) {
		await anchor.evaluate((element) => element.scrollIntoView({ block: "start" }));
	} else {
		await page.evaluate(() => {
			const body = document.querySelector("[data-sheet-body]");
			if (body) {
				body.scrollTo({ top: 0 });
			} else {
				window.scrollTo({ top: 0 });
			}
		});
	}
	// Show each slot grid from its first column (clicks scroll it sideways).
	await page.evaluate(() => {
		for (const grid of document.querySelectorAll('[role="grid"]')) {
			if (grid.parentElement) {
				grid.parentElement.scrollLeft = 0;
			}
		}
	});
	// Let the stamp animation and focus rings settle.
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

export function panel(page: Page) {
	return page.getByRole("dialog", { name: "Prendre rendez-vous" });
}

export async function openPanel(page: Page, slug: string) {
	await page.goto(`/praticien/${slug}`);
	await page.getByRole("link", { name: "Prendre rendez-vous" }).click();
	await expect(panel(page)).toBeVisible();
	await expect(page).toHaveURL(/[?&]rdv=1/);
}

/** The first time that can be stamped in the grid; returns its spoken label. */
export async function pickFirstSlot(
	page: Page,
	scope: Page | Locator = panel(page),
): Promise<string> {
	const cell = firstFreeCell(scope);
	await expect(cell).toBeVisible();
	const label = (await cell.getAttribute("aria-label")) ?? "";
	await cell.click();
	await expect(cell).toHaveAttribute("aria-selected", "true");
	return label;
}

/** Bookable cells carry a label and no `aria-disabled`; empty-day cells have no label. */
export function firstFreeCell(scope: Page | Locator): Locator {
	return scope.locator('[role="gridcell"][aria-label]:not([aria-disabled])').first();
}

export async function fillDetails(page: Page, who: ReturnType<typeof patient>) {
	const dialog = panel(page);
	await dialog.getByLabel("Prénom").fill(who.firstName);
	await dialog.getByLabel("Nom", { exact: true }).fill(who.lastName);
	await dialog.getByLabel("Adresse e-mail").fill(who.email);
	await dialog.getByLabel("Téléphone mobile ou fixe").fill(who.phone);
	await dialog.getByText("Oui, c’est la première fois").click();
}

/** The 6-digit code of the latest code email to `email`. */
export async function readCode(request: APIRequestContext, email: string) {
	const mail = await waitForEmail(request, email, /code/i);
	const code = mail.subject.match(/(\d{6})/)?.[1];
	if (!code) {
		throw new Error(`No code in "${mail.subject}"`);
	}
	return code;
}

/** Reason (when asked) → first free time → details → code → confirmation. */
export async function bookThroughPanel(
	page: Page,
	options: { slug: string; who: ReturnType<typeof patient>; reason?: string },
) {
	await openPanel(page, options.slug);
	const dialog = panel(page);
	if (options.reason) {
		await dialog.getByText(options.reason, { exact: true }).click();
		await dialog.getByRole("button", { name: "Continuer" }).click();
	}
	const slot = await pickFirstSlot(page);
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await fillDetails(page, options.who);
	await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
	await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
		timeout: 20_000,
	});
	const code = await readCode(page.request, options.who.email);
	await dialog.getByLabel("Code à 6 chiffres").fill(code);
	await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
	return { slot };
}

/** The manage link (`/rdv#t=…`) of the confirmation email, made relative to the test server. */
export async function manageLink(request: APIRequestContext, email: string) {
	const mail = await waitForEmail(request, email, /confirmé|demande/i);
	const url = mail.text.match(/https?:\/\/\S+\/rdv#t=[A-Za-z0-9_-]{43}/)?.[0];
	if (!url) {
		throw new Error("No manage link in the confirmation email");
	}
	const parsed = new URL(url);
	return { path: `${parsed.pathname}${parsed.hash}`, token: parsed.hash.slice(3) };
}

/** Presses Tab until `target` has the focus (keyboard-only journeys). */
export async function tabTo(page: Page, target: Locator, max = 60) {
	await target.waitFor();
	for (let index = 0; index < max; index += 1) {
		if (await target.evaluate((element) => element === document.activeElement)) {
			return;
		}
		await page.keyboard.press("Tab");
	}
	throw new Error("Could not reach the element with Tab");
}
