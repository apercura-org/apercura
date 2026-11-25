import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";
import {
	fillDetails,
	manageLink,
	openPanel,
	ownClientAddress,
	panel,
	patient,
	pickFirstSlot,
	readCode,
} from "./booking-helpers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";
import { waitForEmail } from "./mailpit";
import { createProAccount, expectNoAxeViolations, pageAgendaUntil, testDb } from "./pro";

/*
 * A home visit booked from a nurse's page (synthetic fixtures, agenda opened by the global
 * setup): the patient picks their commune among the communes the nurse visits, types the
 * address of the visit, and every email and page says "À domicile — <commune>" without the
 * street. Then the practice finds the address in its agenda and edits the communes it visits.
 * The address below is made up. axe on every step.
 */

const { homeVisit } = BOOKING_PRACTITIONERS;
const STREET = "12 rue de la Simulation\nBâtiment B, 3e étage";

// The practice reads the visit booked by the first test.
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
	await ownClientAddress(page);
});

test("a patient books a home visit in a commune the nurse visits", async ({ page }) => {
	const who = patient("home");
	await openPanel(page, homeVisit.slug);
	const dialog = panel(page);

	// The only reason is a home visit: the reason step stays, to ask for the commune first.
	const reason = dialog.getByRole("radio", { name: /Soins à domicile/ });
	await expect(dialog.getByText(/20 min · à domicile/)).toBeVisible();
	await expect(
		dialog.getByText("Communes desservies : Paris 14e Arrondissement et Paris 15e Arrondissement"),
	).toBeVisible();
	await reason.check({ force: true });
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await expect(dialog.getByText("Choisissez votre commune.")).toBeVisible();
	// The focus moves to the list, which reads its error.
	await expect(dialog.getByRole("button", { name: /Votre commune/ })).toBeFocused();
	expect(await axeViolations(page)).toEqual([]);

	// The hidden select carries the autofill hint of the commune.
	await expect(dialog.locator('select[autocomplete="address-level2"]')).toBeAttached();
	await dialog.getByRole("button", { name: /Votre commune/ }).click();
	await page.getByRole("option", { name: "Paris 15e Arrondissement (75015)" }).click();
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await expect(dialog.getByRole("heading", { name: "Choisissez un horaire" })).toBeFocused();

	await pickFirstSlot(page);
	await dialog.getByRole("button", { name: "Continuer" }).click();
	await expect(dialog.getByText("À domicile — Paris 15e Arrondissement")).toBeVisible();
	const address = dialog.getByLabel("Adresse de la visite");
	await expect(address).toHaveAttribute("autocomplete", "street-address");
	await fillDetails(page, who);

	// The address is required: its error is announced like the other fields'.
	await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
	await expect(dialog.getByText("Saisissez l’adresse de la visite.")).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);
	// Four lines at most, said before anything is sent.
	await address.fill("12 rue de la Simulation\nBâtiment B\n3e étage\nPorte gauche\nCode 1234");
	await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
	await expect(
		dialog.getByText("Écrivez l’adresse sur 4 lignes et en 300 caractères au plus."),
	).toBeVisible();
	await address.fill(STREET);
	await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
	await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
		timeout: 20_000,
	});

	await dialog.getByLabel("Code à 6 chiffres").fill(await readCode(page.request, who.email));
	await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
	await expect(dialog.getByText("Réservé")).toBeVisible({ timeout: 20_000 });
	await expect(dialog.getByText("À domicile — Paris 15e Arrondissement")).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);

	// The confirmation email names the commune, never the street.
	const mail = await waitForEmail(page.request, who.email, /confirmé/i);
	expect(mail.text).toContain("À domicile — Paris 15e Arrondissement");
	expect(mail.text).not.toContain("rue de la Simulation");

	// So does the manage page.
	const { path } = await manageLink(page.request, who.email);
	await page.goto(path);
	await expect(page.getByText("À domicile — Paris 15e Arrondissement")).toBeVisible();
	await expect(page.getByText(/rue de la Simulation/)).toHaveCount(0);
	expect(await axeViolations(page)).toEqual([]);
});

test("the practice reads the address in its agenda and edits the communes it visits", async ({
	page,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	// The practice owner: a verified account made a member of the seeded practice.
	const account = await createProAccount(page, request, {
		name: "Rose De L'Essai",
		baseURL: baseURL ?? "",
	});
	const sql = testDb();
	try {
		const [user] = await sql<{ id: string }[]>`
			SELECT id FROM directory."user" WHERE email = ${account.email}
		`;
		if (!user) throw new Error("Seed: account missing");
		await sql`
			INSERT INTO directory.member (id, organization_id, user_id, role)
			VALUES (${randomUUID()}, 'e2e-booking-homeVisit', ${user.id}, 'owner')
		`;
		await sql`
			UPDATE directory.practitioners
			SET claim_status = 'claimed', owner_org_id = 'e2e-booking-homeVisit'
			WHERE national_id = ${homeVisit.rpps}
		`;
	} finally {
		await sql.end();
	}

	// The visit in the week: where it takes place, and the address, for the practice only.
	await page.goto("/pro/agenda");
	const entry = page.getByRole("gridcell", { name: /Alexis Fictif.*Confirmé/ });
	await pageAgendaUntil(page, entry, { next: "Semaine suivante", max: 3 });
	await entry.first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("À domicile — Paris 15e Arrondissement")).toBeVisible();
	await expect(dialog.getByText("12 rue de la Simulation")).toBeVisible();
	await expect(dialog.getByText("Bâtiment B, 3e étage")).toBeVisible();
	await expectNoAxeViolations(page);
	await page.keyboard.press("Escape");

	// The settings: the home visit's travel time and communes.
	await page.goto("/pro/agenda/reglages");
	const form = page.getByRole("form", { name: /^Soins à domicile/ });
	await expect(form.getByLabel("Temps de trajet (minutes)")).toHaveValue("15");
	const area = form.getByRole("group", { name: "Communes desservies" });
	await expect(area.getByText("Paris 14e Arrondissement")).toBeVisible();
	await expect(area.getByText("Paris 15e Arrondissement")).toBeVisible();
	await expectNoAxeViolations(page);

	await area.getByRole("button", { name: "Retirer Paris 14e Arrondissement" }).click();
	await expect(area.getByText("Paris 14e Arrondissement")).toHaveCount(0);
	await area.getByLabel("Rayon (km)").fill("3");
	await area.getByRole("button", { name: "Ajouter les communes autour du cabinet" }).click();
	await expect(area.getByText(/communes? ajoutées?\./)).toBeVisible();
	await expect(area.getByText("Paris 14e Arrondissement")).toBeVisible();
	await area.getByRole("combobox", { name: "Ajouter une commune" }).pressSequentially("Lyon 3");
	await page.getByRole("option", { name: /^Lyon 3e Arrondissement/ }).click();
	await expect(area.getByText("Lyon 3e Arrondissement")).toBeVisible();
	await expectNoAxeViolations(page);
	await form.getByRole("button", { name: "Enregistrer" }).click();
	await expect(form.getByText("Motif enregistré.")).toBeVisible();

	// The booking panel offers the new list.
	await openPanel(page, homeVisit.slug);
	await expect(
		panel(page).getByText(/Communes desservies : .*Lyon 3e Arrondissement/),
	).toBeVisible();
});
