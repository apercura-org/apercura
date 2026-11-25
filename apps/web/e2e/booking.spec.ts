import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import {
	bookThroughPanel,
	fillDetails,
	firstFreeCell,
	openPanel,
	ownClientAddress,
	panel,
	patient,
	pickFirstSlot,
	readCode,
	tabTo,
} from "./booking-helpers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";
import { waitForEmail } from "./mailpit";

/*
 * Online booking from a practitioner's page, against the synthetic fixtures with agendas opened
 * by the global setup (`booking-seed.ts`). Codes are read from Mailpit. Tests of one practitioner
 * run in order, each taking the first free time left by the previous one.
 */

const { direct, pending, race } = BOOKING_PRACTITIONERS;

test.describe.configure({ mode: "default" });

test.beforeEach(async ({ page }) => {
	await ownClientAddress(page);
});

test("the action block shows the next free time and keeps the page cacheable", async ({
	page,
	request,
}) => {
	const response = await request.get(`/praticien/${direct.slug}?rdv=1`);
	expect(response.status()).toBe(200);
	await page.goto(`/praticien/${direct.slug}`);
	const block = page.getByRole("region", { name: "Rendez-vous" });
	await expect(block.getByText("Prochain horaire libre")).toBeVisible();
	await expect(block.getByRole("link", { name: "Prendre rendez-vous" })).toHaveAttribute(
		"href",
		"?rdv=1",
	);
	await expect(block.getByRole("link", { name: /^Ou appelez le/ })).toBeVisible();
});

test("a patient books in the panel and downloads the .ics", async ({ page }) => {
	const who = patient("direct");
	await openPanel(page, direct.slug);
	const dialog = panel(page);
	expect(await axeViolations(page)).toEqual([]);

	await dialog.getByText("Consultation", { exact: true }).click();
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await expect(dialog.getByRole("heading", { name: "Choisissez un horaire" })).toBeFocused();
	await expect(dialog.getByText(/Heures du cabinet/)).toBeVisible();
	await expect(firstFreeCell(dialog)).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);

	const slot = await pickFirstSlot(page);
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await fillDetails(page, who);
	expect(await axeViolations(page)).toEqual([]);

	await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
	await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
		timeout: 20_000,
	});
	await expect(dialog.getByText(who.email)).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: /Envoyer un nouveau code \(\d+ s\)/ }),
	).toBeDisabled();
	expect(await axeViolations(page)).toEqual([]);

	// A wrong code says how many attempts are left.
	await dialog.getByLabel("Code à 6 chiffres").fill("000000");
	await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
	const code = await readCode(page.request, who.email);
	if (code !== "000000") {
		await expect(dialog.getByText(/Il vous reste 4 essais/)).toBeVisible();
	}
	await dialog.getByLabel("Code à 6 chiffres").fill(code);
	await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
	await expect(
		dialog.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
	).toBeVisible();
	await expect(dialog.getByText(/lien pour annuler ou déplacer/)).toBeVisible();
	await expect(dialog.getByText(slot.split(", ").at(-1) ?? "")).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);

	const download = page.waitForEvent("download");
	await dialog.getByRole("button", { name: "Ajouter à mon agenda (.ics)" }).click();
	const file = await download;
	const ics = readFileSync((await file.path()) ?? "", "utf8");
	expect(ics).toContain("BEGIN:VCALENDAR");
	expect(ics).toContain("METHOD:PUBLISH");
	expect(ics).toContain("SUMMARY:Rendez-vous — Dr Anne Essaiaa");
	expect(ics).not.toContain("Consultation");

	// The confirmation email carries the manage link (token in the fragment).
	const mail = await waitForEmail(page.request, who.email, /confirmé/);
	expect(mail.text).toMatch(/\/rdv#t=[A-Za-z0-9_-]{43}/);
	expect(mail.text).not.toMatch(/\/rdv\?/);

	// Escape closes the sheet and the URL forgets it.
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(page).not.toHaveURL(/rdv=1/);
});

test("the panel opens from the URL and Escape closes it", async ({ page }) => {
	await page.goto(`/praticien/${direct.slug}?rdv=1`);
	await expect(panel(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(panel(page)).toBeHidden();
	await expect(page).not.toHaveURL(/rdv=1/);
	await expect(page.getByRole("link", { name: "Prendre rendez-vous" })).toBeFocused();
});

test("a booking can be made with the keyboard only", async ({ page }) => {
	const who = patient("keyboard");
	await page.goto(`/praticien/${direct.slug}`);
	await tabTo(page, page.getByRole("link", { name: "Prendre rendez-vous" }));
	await page.keyboard.press("Enter");
	const dialog = panel(page);
	await expect(dialog).toBeVisible();

	await tabTo(page, dialog.getByRole("radio", { name: /Consultation/ }).first());
	await page.keyboard.press("Space");
	await tabTo(page, dialog.getByRole("button", { name: "Continuer" }));
	await page.keyboard.press("Enter");

	const cell = firstFreeCell(dialog);
	await expect(cell).toBeVisible();
	const first = dialog.getByRole("gridcell", {
		name: (await cell.getAttribute("aria-label")) ?? "",
		exact: true,
	});
	await tabTo(page, dialog.locator('[role="gridcell"][tabindex="0"]'));
	// The grid opens on the first free time; move away and back, then stamp it. Down to the next
	// day and back up, never sideways: late in the day the first free time is the day's last
	// one, where Right stays put and Left lands on a time that cannot be stamped (taken, or
	// inside the notice). Every seeded day has the same times and later days follow, so the
	// column survives the round trip at any hour.
	await expect(first).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(first).not.toBeFocused();
	await expect(dialog.locator('[role="gridcell"]:focus')).toHaveCount(1);
	await page.keyboard.press("ArrowUp");
	await expect(first).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(first).toHaveAttribute("aria-selected", "true");
	await expect(dialog.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
	await tabTo(page, dialog.getByRole("button", { name: "Continuer" }));
	await page.keyboard.press("Enter");

	await tabTo(page, dialog.getByLabel("Prénom"));
	await page.keyboard.type(who.firstName);
	await page.keyboard.press("Tab");
	await page.keyboard.type(who.lastName);
	await page.keyboard.press("Tab");
	await page.keyboard.type(who.email);
	await page.keyboard.press("Tab");
	await page.keyboard.type(who.phone);
	await tabTo(page, dialog.getByRole("radio", { name: "Oui, c’est la première fois" }));
	await page.keyboard.press("Space");
	await tabTo(page, dialog.getByRole("button", { name: "Recevoir mon code" }));
	await page.keyboard.press("Enter");

	await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeFocused({
		timeout: 20_000,
	});
	await tabTo(page, dialog.getByLabel("Code à 6 chiffres"));
	await page.keyboard.type(await readCode(page.request, who.email));
	await page.keyboard.press("Enter");
	await expect(
		dialog.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
	).toBeFocused();
});

test("a practice that validates by hand gets an honest request", async ({ page }) => {
	const who = patient("pending");
	await bookThroughPanel(page, { slug: pending.slug, who });
	const dialog = panel(page);
	await expect(dialog.getByRole("heading", { name: "Votre demande est envoyée" })).toBeVisible();
	await expect(dialog.getByText(/confirme lui-même ses rendez-vous/)).toBeVisible();
	await expect(dialog.getByText("En attente du cabinet")).toBeVisible();
	await expect(dialog.getByRole("button", { name: /Ajouter à mon agenda/ })).toHaveCount(0);
	expect(await axeViolations(page)).toEqual([]);
	const mail = await waitForEmail(page.request, who.email, /Demande de rendez-vous envoyée/);
	expect(mail.text).toMatch(/Réponse avant/i);
});

test("a time taken by someone else offers the three nearest ones", async ({ browser }) => {
	const first = await browser.newContext({ locale: "fr-FR" });
	const second = await browser.newContext({ locale: "fr-FR" });
	try {
		const winner = await first.newPage();
		const loser = await second.newPage();
		await ownClientAddress(winner);
		await ownClientAddress(loser);
		const a = patient("race-a");
		const b = patient("race-b");

		for (const page of [winner, loser]) {
			await openPanel(page, race.slug);
		}
		const chosen = await pickFirstSlot(winner);
		const same = await pickFirstSlot(loser);
		expect(same).toBe(chosen);
		for (const [page, who] of [
			[winner, a],
			[loser, b],
		] as const) {
			await panel(page).getByRole("button", { name: "Continuer" }).click();
			await fillDetails(page, who);
		}
		await panel(winner).getByRole("button", { name: "Recevoir mon code" }).click();
		await expect(panel(winner).getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
			timeout: 20_000,
		});

		await panel(loser).getByRole("button", { name: "Recevoir mon code" }).click();
		const dialog = panel(loser);
		await expect(
			dialog.getByRole("heading", { name: "Cet horaire vient d’être pris" }),
		).toBeVisible({ timeout: 20_000 });
		const alternatives = dialog.getByRole("button", { name: /^Choisir / });
		await expect(alternatives).toHaveCount(3);
		expect(await axeViolations(loser)).toEqual([]);

		await alternatives.first().click();
		await expect(dialog.getByText(/Nouvel horaire/)).toBeVisible();
		await expect(dialog.getByLabel("Adresse e-mail")).toHaveValue(b.email);
		await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
		await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
			timeout: 20_000,
		});
	} finally {
		await first.close();
		await second.close();
	}
});

test("search results show the next free time of a bookable practitioner", async ({ page }) => {
	await page.goto("/recherche?quoi=Essaiaa");
	const link = page.getByRole("link", { name: /^Réserver : / }).first();
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute("href", new RegExp(`/praticien/${direct.slug}\\?rdv=1$`));
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("the panel covers the screen at every step", async ({ page }) => {
		const who = patient("mobile");
		await openPanel(page, direct.slug);
		const dialog = panel(page);
		const box = await dialog.boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(389);
		await dialog.getByText("Consultation", { exact: true }).click();
		await dialog.getByRole("button", { name: "Continuer" }).click();
		await expect(firstFreeCell(dialog)).toBeVisible();
		// Times booked by the earlier tests stay in their column, struck through.
		await expect(
			dialog
				.locator('[role="gridcell"][aria-disabled="true"][aria-label$=", indisponible"]')
				.first(),
		).toBeAttached();
		await pickFirstSlot(page);
		await dialog.getByRole("button", { name: "Continuer" }).click();
		// Each step starts from its top: heading in view and focused.
		await expect(dialog.getByRole("heading", { name: "Vos coordonnées" })).toBeFocused();
		await expect(dialog.getByRole("heading", { name: "Vos coordonnées" })).toBeInViewport();
		await fillDetails(page, who);
		await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
		const heading = dialog.getByRole("heading", { name: "Saisissez votre code" });
		await expect(heading).toBeFocused({ timeout: 20_000 });
		await expect(heading).toBeInViewport();
		await expect(dialog.getByText(/Nous avons envoyé un code à 6 chiffres/)).toBeInViewport();
		// Stacked actions fit the screen: the stamp first, Back under it.
		const confirm = await dialog
			.getByRole("button", { name: "Confirmer le rendez-vous" })
			.boundingBox();
		const back = await dialog.getByRole("button", { name: "Retour" }).boundingBox();
		expect((confirm?.x ?? 0) + (confirm?.width ?? 0)).toBeLessThanOrEqual(390);
		expect(confirm?.y ?? 0).toBeLessThan(back?.y ?? 0);
		await dialog.getByLabel("Code à 6 chiffres").fill(await readCode(page.request, who.email));
		await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
		await expect(
			dialog.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
		).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});
