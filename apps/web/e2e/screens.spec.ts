import { expect, type Page, test } from "@playwright/test";
import {
	bookThroughPanel,
	capture,
	fillDetails,
	firstFreeCell,
	manageLink,
	openPanel,
	ownClientAddress,
	panel,
	patient,
	pickFirstSlot,
	readCode,
} from "./booking-helpers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";

/*
 * Design review captures (not assertions): every booking panel state and every /rdv state, at
 * 1440 px and 390 px, written to E2E_SCREENSHOTS_DIR. Skipped unless that variable is set.
 * The browser clock is moved to 08:20 in Paris while a grid shows, so today's row carries the
 * "now" marker whatever the hour of the run; it goes back to the real time before the ALTCHA
 * check and the code, which are timed by the server.
 */

const { direct, pending, race, manage } = BOOKING_PRACTITIONERS;
// The phone first: it takes the earliest free time, which sits next to the "now" marker on its
// narrow grid; the wide grid shows the next one without scrolling.
const VIEWPORTS = [
	{ name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
	{ name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
] as const;

/** Today at 08:20 in Paris (the agendas open 08:00 to 19:00). */
function morningInParis(): Date {
	const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
	const probe = new Date(`${day}T08:20:00Z`);
	const offset =
		Number(
			new Intl.DateTimeFormat("en-GB", {
				timeZone: "Europe/Paris",
				hour: "2-digit",
				hourCycle: "h23",
			}).format(probe),
		) - 8;
	return new Date(probe.getTime() - offset * 3_600_000);
}

async function realTime(page: Page) {
	await page.clock.setSystemTime(new Date());
}

test.skip(!process.env.E2E_SCREENSHOTS_DIR, "design captures only (E2E_SCREENSHOTS_DIR)");
test.describe.configure({ mode: "default" });

for (const { name, viewport, isMobile } of VIEWPORTS) {
	test.describe(name, () => {
		test.use({ viewport, isMobile, hasTouch: isMobile });

		test.beforeEach(async ({ page }) => {
			await ownClientAddress(page);
			await page.clock.install({ time: morningInParis() });
			await page.clock.resume();
		});

		test(`panel states (${name})`, async ({ page }) => {
			const who = patient(`screens-${name}`);
			await openPanel(page, direct.slug);
			const dialog = panel(page);
			await expect(dialog.getByText("Consultation", { exact: true })).toBeVisible();
			await capture(page, `panel-1-reason-${name}`);
			await dialog.getByText("Consultation", { exact: true }).click();
			await dialog.getByRole("button", { name: "Continuer" }).click();
			await expect(firstFreeCell(dialog)).toBeVisible();
			await capture(page, `panel-2-slot-${name}`);
			await pickFirstSlot(page);
			await capture(page, `panel-2b-slot-stamped-${name}`);
			await realTime(page);
			await dialog.getByRole("button", { name: "Continuer" }).click();
			await fillDetails(page, who);
			await expect(dialog.getByText("Vérifié")).toBeVisible({ timeout: 20_000 });
			await capture(page, `panel-3-details-${name}`);
			// The proof-of-work check, ticked, further down the same step.
			await capture(page, `panel-3b-details-check-${name}`, dialog.getByRole("radiogroup"));
			await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
			await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeFocused({
				timeout: 20_000,
			});
			await capture(page, `panel-4-code-${name}`);
			await dialog.getByLabel("Code à 6 chiffres").fill(await readCode(page.request, who.email));
			await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
			await expect(
				dialog.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
			).toBeVisible();
			await capture(page, `panel-5-done-${name}`);
		});

		test(`pending request (${name})`, async ({ page }) => {
			await realTime(page);
			await bookThroughPanel(page, { slug: pending.slug, who: patient(`screens-p-${name}`) });
			await expect(
				panel(page).getByRole("heading", { name: "Votre demande est envoyée" }),
			).toBeVisible();
			await capture(page, `panel-5b-pending-${name}`);
		});

		test(`time taken (${name})`, async ({ page, browser }) => {
			await realTime(page);
			const other = await browser.newContext({ locale: "fr-FR", viewport });
			try {
				const winner = await other.newPage();
				await ownClientAddress(winner);
				await openPanel(winner, race.slug);
				await openPanel(page, race.slug);
				expect(await pickFirstSlot(page)).toBe(await pickFirstSlot(winner));
				for (const [tab, who] of [
					[winner, patient(`screens-w-${name}`)],
					[page, patient(`screens-l-${name}`)],
				] as const) {
					await panel(tab).getByRole("button", { name: "Continuer" }).click();
					await fillDetails(tab, who);
				}
				await panel(winner).getByRole("button", { name: "Recevoir mon code" }).click();
				await expect(
					panel(winner).getByRole("heading", { name: "Saisissez votre code" }),
				).toBeVisible({ timeout: 20_000 });
				await panel(page).getByRole("button", { name: "Recevoir mon code" }).click();
				await expect(
					panel(page).getByRole("heading", { name: "Cet horaire vient d’être pris" }),
				).toBeVisible({ timeout: 20_000 });
				for (const button of await panel(page)
					.getByRole("button", { name: /^Choisir / })
					.all()) {
					const box = await button.boundingBox();
					expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
				}
				await capture(page, `panel-6-taken-${name}`);
			} finally {
				await other.close();
			}
		});

		test(`manage page states (${name})`, async ({ page }) => {
			await page.goto(`/fr/rdv#t=${"A".repeat(43)}`);
			await expect(page.getByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeVisible();
			await capture(page, `rdv-invalid-${name}`);

			await realTime(page);
			const who = patient(`screens-m-${name}`);
			await bookThroughPanel(page, { slug: manage.slug, who });
			await expect(
				panel(page).getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
			).toBeVisible();
			const link = await manageLink(page.request, who.email);
			await page.clock.setSystemTime(morningInParis());
			await page.goto(link.path);
			await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();
			await capture(page, `rdv-1-view-${name}`);
			await page.getByRole("button", { name: "Déplacer le rendez-vous" }).click();
			const heading = page.getByRole("heading", { name: "Choisissez un nouvel horaire" });
			await expect(firstFreeCell(page)).toBeVisible();
			await firstFreeCell(page).click();
			await capture(page, `rdv-2-reschedule-${name}`, heading);
			await page.getByRole("button", { name: "Garder l’horaire actuel" }).click();
			await page.getByRole("button", { name: "Annuler le rendez-vous" }).click();
			await expect(page.getByRole("alertdialog")).toBeVisible();
			await capture(page, `rdv-3-cancel-confirm-${name}`);
			await page.getByRole("button", { name: "Oui, annuler" }).click();
			await expect(page.getByText("Annulé par vous")).toBeVisible();
			await capture(page, `rdv-4-cancelled-${name}`);
		});
	});
}
