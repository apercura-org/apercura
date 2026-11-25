import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { bookThroughPanel, ownClientAddress, patient } from "./booking-helpers";
import { waitForEmail } from "./mailpit";
import {
	createProAccount,
	expectNoAxeViolations,
	type ProAccount,
	pageAgendaUntil,
	resetPractitioner,
	testDb,
} from "./pro";

/*
 * The practice side of booking on the synthetic fixtures (a fictitious practitioner, RPPS
 * 1999999xxxx): the owner sets up a place from presets and weekly hours and opens the agenda
 * (verified claim and fees seeded), a patient's request appears on Today, the owner accepts it,
 * finds it in the week and cancels it with a message (email in Mailpit), adds an appointment
 * and a block with the keyboard only, then invites an assistant who joins with a second factor
 * and runs the agenda but not the page. axe on every page.
 */

const PRACTITIONER = { rpps: "19999990039", slug: "alice-specimen-19999990039" };

test.describe.configure({ mode: "serial" });

let owner: { context: BrowserContext; page: Page; account: ProAccount } | undefined;

/** The page claimed and verified (as with Pro Santé Connect), fees and payment methods stated. */
async function seedOwnedPage(rpps: string, ownerEmail: string) {
	const sql = testDb();
	try {
		const [practitioner] = await sql<{ id: number }[]>`
			SELECT id FROM directory.practitioners WHERE national_id = ${rpps}
		`;
		const [account] = await sql<{ id: string }[]>`
			SELECT id FROM directory."user" WHERE email = ${ownerEmail}
		`;
		if (!practitioner || !account) throw new Error("Seed: practitioner or account missing");
		const organizationId = randomUUID();
		await sql.begin(async (tx) => {
			await tx`
				INSERT INTO directory.organization (id, name, slug, metadata)
				VALUES (${organizationId}, 'Alice Specimen', ${`alice-specimen-${organizationId.slice(0, 8)}`},
					${JSON.stringify({ practitionerId: practitioner.id })})
			`;
			await tx`
				INSERT INTO directory.member (id, organization_id, user_id, role)
				VALUES (${randomUUID()}, ${organizationId}, ${account.id}, 'owner')
			`;
			await tx`
				INSERT INTO directory.claims (id, practitioner_id, user_id, status, verified_at, decided_at)
				VALUES (${randomUUID()}, ${practitioner.id}, ${account.id}, 'verified', now(), now())
			`;
			await tx`
				UPDATE directory.practitioners SET claim_status = 'claimed', owner_org_id = ${organizationId}
				WHERE id = ${practitioner.id}
			`;
			await tx`
				INSERT INTO directory.practitioner_profiles (practitioner_id, fees, payment_methods, published_at)
				VALUES (${practitioner.id}, ${sql.json({ items: [{ label: "Consultation", amount: 30 }] })},
					${["card", "cash"]}, now())
			`;
			await tx`SELECT directory.refresh_practitioner(${[practitioner.id]}::integer[])`;
		});
	} finally {
		await sql.end();
	}
}

/**
 * Design review captures (E2E_SCREENSHOTS_DIR): the page at 1440 px, then at 390 px after a
 * reload (`reopen` puts a dialog back), then back to the desktop size. Not an assertion.
 */
async function shoot(page: Page, name: string, reopen?: () => Promise<void>) {
	const dir = process.env.E2E_SCREENSHOTS_DIR;
	if (!dir) return;
	mkdirSync(dir, { recursive: true });
	const sizes = [
		["desktop", { width: 1440, height: 900 }],
		["mobile", { width: 390, height: 844 }],
	] as const;
	for (const [label, size] of sizes) {
		await page.setViewportSize(size);
		if (label === "mobile") {
			await page.reload();
			await expect(page.locator("main h1:visible")).toBeVisible();
			await page.waitForLoadState("networkidle");
			await reopen?.();
		}
		if (!reopen) await page.evaluate(() => window.scrollTo(0, 0));
		await page.waitForTimeout(400);
		await page.screenshot({ path: join(dir, `${name}-${label}.png`), fullPage: !reopen });
	}
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.reload();
	await expect(page.locator("main h1:visible")).toBeVisible();
}

function ownerPage() {
	if (!owner) throw new Error("The owner is set up by the first test");
	return owner.page;
}

test.afterAll(async () => {
	await owner?.context.close();
	owner = undefined;
});

test("the owner sets up a place from presets and weekly hours, then opens the agenda", async ({
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	await resetPractitioner(PRACTITIONER.rpps);
	const context = await browser.newContext();
	const page = await context.newPage();
	await ownClientAddress(page);
	const account = await createProAccount(page, request, {
		name: "Alice Specimen",
		baseURL: baseURL as string,
	});
	owner = { context, page, account };
	await seedOwnedPage(PRACTITIONER.rpps, account.email);

	// Onboarding now leads to the booking settings.
	await page.goto("/pro/bienvenue?etape=2");
	await page.getByRole("link", { name: "Régler horaires et prise de rendez-vous" }).click();
	await expect(page).toHaveURL(/\/pro\/agenda\/reglages$/);
	await expect(page.getByRole("heading", { level: 1, name: "Prise de rendez-vous" })).toBeVisible();
	await expect(page.getByText("Fuseau horaire : Europe/Paris")).toBeVisible();
	await expectNoAxeViolations(page);

	// 1. A calendar for the practice address, with the presets of the specialty.
	await page.getByRole("button", { name: "Régler ce lieu" }).click();
	await expect(page.getByRole("heading", { level: 3, name: /^Consultation/ })).toBeVisible();
	await expect(
		page.getByRole("heading", { level: 3, name: /^Première consultation/ }),
	).toBeVisible();
	const open = page.getByRole("button", { name: "Ouvrir la prise de rendez-vous en ligne" });
	await expect(open).toBeDisabled();
	await expect(
		page.getByText("Ajoutez des horaires d’ouverture ou une ouverture exceptionnelle."),
	).toBeVisible();

	// 2. Weekly hours: the "days" template, plus a Saturday morning.
	await page.getByRole("button", { name: "Journées, 9 h à 12 h 30 et 14 h à 18 h 30" }).click();
	await page.getByRole("button", { name: "Ajouter une plage le samedi" }).click();
	await page.getByRole("button", { name: "Enregistrer les horaires" }).click();
	await expect(page.getByText("Horaires enregistrés.")).toBeVisible();

	// 3. Requests wait for the practice.
	await page
		.getByRole("switch", { name: "Valider chaque demande à la main" })
		.click({ force: true });
	await page.getByRole("button", { name: "Enregistrer les règles" }).click();
	await expect(page.getByText("Règles de réservation enregistrées.")).toBeVisible();

	// 4. A closure today (a holiday): listed, removable.
	await page.getByRole("button", { name: "Ajouter", exact: true }).click();
	await expect(page.getByText(/^Fermé le /)).toBeVisible();

	// 5. The private feed: a link shown once, initials by default.
	await page.getByRole("button", { name: "Créer un lien de flux" }).click();
	const feedUrl = await page.getByRole("textbox", { name: "Lien du flux" }).inputValue();
	expect(feedUrl).toMatch(/\/api\/ics\/[A-Za-z0-9_-]{43}\.ics$/);
	const feed = await request.get(new URL(feedUrl).pathname);
	expect(feed.status()).toBe(200);
	expect(feed.headers()["content-type"]).toContain("text/calendar");
	expect(feed.headers()["cache-control"]).toContain("no-store");

	// 6. Open.
	await expect(open).toBeEnabled();
	await open.click();
	await expect(
		page.getByText("La prise de rendez-vous en ligne est ouverte. Les patients peuvent réserver"),
	).toBeVisible();
	await expectNoAxeViolations(page);
	// The section index starts level with the first section.
	await page.evaluate(() => window.scrollTo(0, 0));
	const indexBox = await page.getByRole("navigation", { name: "Sur cette page" }).boundingBox();
	const placesBox = await page.locator('section[aria-labelledby="settings-places"]').boundingBox();
	expect(Math.abs((indexBox?.y ?? 0) - (placesBox?.y ?? 999))).toBeLessThan(4);
	// Nothing scrolls sideways on a phone (WCAG 1.4.10), weekly hours included.
	await page.setViewportSize({ width: 390, height: 844 });
	await page.reload();
	await expect(
		page.getByRole("heading", { level: 2, name: "Horaires de la semaine" }),
	).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await expect(page.getByRole("button", { name: "Ajouter une plage le samedi" })).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.reload();
	await shoot(page, "settings");

	// Revoking the feed stops the old link at once.
	await page.getByRole("button", { name: "Désactiver le flux" }).click();
	await expect(
		page.getByText("Le flux est désactivé : l’ancien lien ne fonctionne plus."),
	).toBeVisible();
	expect((await request.get(new URL(feedUrl).pathname)).status()).toBe(404);
});

test("a patient's request shows on Today; the owner accepts it, finds it in the week and cancels it with a message", async ({
	browser,
}) => {
	test.setTimeout(180_000);
	const page = ownerPage();
	const patientContext = await browser.newContext();
	const patientPage = await patientContext.newPage();
	await ownClientAddress(patientPage);
	const who = patient("agenda");
	// The cached page may need one refresh to show the new agenda.
	await expect(async () => {
		await patientPage.goto(`/praticien/${PRACTITIONER.slug}`);
		await expect(patientPage.getByRole("link", { name: "Prendre rendez-vous" })).toBeVisible({
			timeout: 2_000,
		});
	}).toPass({ timeout: 30_000 });
	await bookThroughPanel(patientPage, { slug: PRACTITIONER.slug, who, reason: "Consultation" });
	await waitForEmail(patientPage.request, who.email, /Demande de rendez-vous/);
	await patientContext.close();

	// The request is in the week too, as a request (dashed box), at its time (this week on a
	// weekday, as today is closed; next week on a weekend).
	await page.goto("/pro/agenda");
	const request = page.getByRole("gridcell", {
		name: new RegExp(`${who.firstName} ${who.lastName}.*Demande à traiter`),
	});
	await pageAgendaUntil(page, request, { next: "Semaine suivante", max: 3 });
	await shoot(page, "week-request", () =>
		pageAgendaUntil(page, request, { next: "Jour suivant", max: 9 }),
	);

	// Today: the request to answer, the discreet access note.
	await page.goto("/pro/aujourdhui");
	await expect(page.getByRole("heading", { level: 1, name: "Aujourd’hui" })).toBeVisible();
	const requests = page.getByRole("region", { name: "Demandes à traiter" });
	await expect(
		requests.getByText(`${who.firstName} ${who.lastName}`, { exact: false }),
	).toBeVisible();
	await expect(
		page.getByText("Les données des patients de cette page sont déchiffrées pour vous"),
	).toBeVisible();
	// Adding from Today opens on the next free time.
	await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
	await expect(page.getByRole("dialog", { name: "Ajouter à l’agenda" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expectNoAxeViolations(page);
	await shoot(page, "today");
	await requests.getByRole("button", { name: "Accepter" }).click();
	await expect(
		page.getByText("Demande acceptée. Le patient reçoit une confirmation."),
	).toBeVisible();
	await expect(requests.getByText("Aucune demande en attente.")).toBeVisible();

	// The week: find the appointment (it may be next week), open it, cancel with a message.
	await page.goto("/pro/agenda");
	await expect(page.getByRole("grid")).toBeVisible();
	await expectNoAxeViolations(page);
	const entry = page.getByRole("gridcell", {
		name: new RegExp(`${who.firstName} ${who.lastName}.*Confirmé`),
	});
	await pageAgendaUntil(page, entry, { next: "Semaine suivante", max: 3 });
	await entry.first().click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: `Consultation · ${who.firstName} ${who.lastName}` }),
	).toBeVisible();
	await expectNoAxeViolations(page);
	await dialog.getByRole("button", { name: "Annuler le rendez-vous" }).click();
	await dialog
		.getByLabel("Message au patient (facultatif)")
		.fill("Le cabinet est fermé ce jour-là.");
	await dialog.getByRole("button", { name: "Annuler le rendez-vous" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(entry).toHaveCount(0);
	const cancelled = await waitForEmail(page.request, who.email, /annulé par le cabinet/);
	expect(cancelled.text).toContain("Le cabinet est fermé ce jour-là.");
});

test("the week works with the keyboard only: move, change week, add an appointment and a block", async () => {
	test.setTimeout(120_000);
	const page = ownerPage();
	await page.goto("/pro/agenda");
	const heading = page.getByRole("heading", { level: 2, name: /^Semaine du / });
	await expect(heading).toBeVisible();
	// Desktop opens on the week view; the next week is in the future whatever today is.
	await page.getByRole("button", { name: "Semaine suivante" }).focus();
	await page.keyboard.press("Tab");
	const focused = page.locator('[role="gridcell"]:focus');
	await expect(focused).toHaveCount(1);
	const first = await focused.getAttribute("aria-label");
	await page.keyboard.press("PageDown");
	await expect(heading).not.toHaveText(/^$/);
	const nextWeek = await heading.textContent();
	await expect(page.locator('[role="gridcell"]:focus')).toHaveCount(1);
	await page.keyboard.press("Home");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	const moved = await page.locator('[role="gridcell"]:focus').getAttribute("aria-label");
	expect(moved).not.toBe(first);
	expect(moved).toMatch(/libre|hors des horaires/);
	await page.keyboard.press("PageUp");
	await expect(heading).not.toHaveText(nextWeek ?? "");
	await page.keyboard.press("PageDown");
	await expect(heading).toHaveText(nextWeek ?? "");

	// Enter on a free time: the add dialog; Escape closes it.
	await expect(page.locator('[role="gridcell"]:focus')).toHaveCount(1);
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog", { name: "Ajouter à l’agenda" });
	await expect(dialog).toBeVisible();
	await expectNoAxeViolations(page);
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);

	// An appointment taken by phone, with an email: the first email is neutral.
	const phoned = patient("phone");
	await expect(page.locator('[role="gridcell"]:focus')).toHaveCount(1);
	await page.keyboard.press("Enter");
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Prénom").fill(phoned.firstName);
	await dialog.getByLabel("Nom", { exact: true }).fill("Telephone");
	await dialog.getByLabel("E-mail (facultatif)").fill(phoned.email);
	await dialog.getByLabel("E-mail (facultatif)").press("Tab");
	await dialog.getByRole("button", { name: "Ajouter le rendez-vous" }).focus();
	await page.keyboard.press("Enter");
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole("gridcell", { name: /Alexis Telephone/ }).first()).toBeVisible();
	const neutral = await waitForEmail(page.request, phoned.email, /enregistré pour cette adresse/);
	expect(neutral.text).not.toContain("Consultation");
	expect(neutral.text).not.toContain("Telephone");

	// A block an hour later, the same day.
	await expect(page.locator('[role="gridcell"]:focus')).toHaveCount(1);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(dialog).toBeVisible();
	await dialog.getByText("Une plage bloquée", { exact: true }).click();
	await dialog.getByRole("button", { name: "Bloquer cette plage" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole("gridcell", { name: /Plage bloquée/ }).first()).toBeVisible();
	if (process.env.E2E_SCREENSHOTS_DIR) {
		// On a phone the day view opens on today: walk to the day of the new entries.
		const toWeek = () =>
			pageAgendaUntil(page, page.getByRole("gridcell", { name: /Alexis Telephone/ }), {
				next: "Jour suivant",
				max: 9,
			});
		// The week that holds the new entries, then the add dialog on a free time.
		await shoot(page, "week", toWeek);
		// The current week at 10:20 in Paris (browser clock only), so today's column shows "now".
		const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
		const probe = new Date(`${day}T10:20:00Z`);
		const offset =
			Number(
				new Intl.DateTimeFormat("en-GB", {
					timeZone: "Europe/Paris",
					hour: "2-digit",
					hourCycle: "h23",
				}).format(probe),
			) - 10;
		await page.clock.install({ time: new Date(probe.getTime() - offset * 3_600_000) });
		await page.clock.resume();
		await page.reload();
		await shoot(page, "week-today", async () => {});
		await page.clock.setSystemTime(new Date());
		await page.reload();
		await page.getByRole("button", { name: "Semaine suivante" }).click();
		const addOnFree = async () => {
			await page
				.getByRole("gridcell", { name: /, (libre|hors des horaires)$/ })
				.first()
				.click();
			await expect(dialog).toBeVisible();
		};
		await addOnFree();
		await shoot(page, "add-appointment", addOnFree);
	}

	// The day view (phones) shows one day at a time.
	await page.getByRole("button", { name: "Jour", exact: true }).click();
	await expect(page.getByRole("button", { name: "Jour suivant" })).toBeVisible();
	await expect(page.getByRole("columnheader")).toHaveCount(2);
	await expectNoAxeViolations(page);
});

test("the owner invites an assistant, who joins with a second factor and runs the agenda but not the page", async ({
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(180_000);
	const page = ownerPage();
	const assistantEmail = `exemple.secretaire.${Date.now()}@example.test`;
	await page.goto("/pro/equipe");
	await expect(page.getByRole("heading", { level: 1, name: "Équipe" })).toBeVisible();
	await expect(page.getByText("L’agenda seulement", { exact: false })).toBeVisible();
	await expectNoAxeViolations(page);
	await page.getByLabel("Adresse e-mail").fill(assistantEmail);
	await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
	await expect(
		page.getByText(`Invitation envoyée à ${assistantEmail}. Elle est valable 48 heures.`),
	).toBeVisible();
	await expect(page.getByRole("cell", { name: assistantEmail, exact: true })).toBeVisible();
	await shoot(page, "team");

	const mail = await waitForEmail(request, assistantEmail, /vous invite à rejoindre/);
	const link = mail.text.match(/https?:\/\/\S+\/pro\/invitation\/[0-9a-f-]{36}/)?.[0];
	expect(link).toBeDefined();
	const invitationPath = new URL(link as string).pathname;

	// Signed out: sign in (or create the account) first, then come back.
	const context = await browser.newContext();
	const assistantPage = await context.newPage();
	await ownClientAddress(assistantPage);
	await assistantPage.goto(invitationPath);
	await expect(assistantPage).toHaveURL(/\/pro\/connexion\?suite=%2Fpro%2Finvitation%2F/);
	await createProAccount(assistantPage, request, {
		name: "Exemple Secretaire",
		email: assistantEmail,
		baseURL: baseURL as string,
	});
	await assistantPage.goto(invitationPath);
	await expect(
		assistantPage.getByRole("heading", { level: 1, name: "Rejoindre un cabinet" }),
	).toBeVisible();
	await expect(
		assistantPage.getByText(/vous invite à rejoindre Alice Specimen en tant que Secrétaire/),
	).toBeVisible();
	await expectNoAxeViolations(assistantPage);
	await assistantPage.getByRole("button", { name: "Rejoindre l’équipe" }).click();
	await expect(assistantPage).toHaveURL(/\/pro\/aujourdhui$/);

	// The agenda, yes; the page, the team, the settings and the log, no.
	const nav = assistantPage.getByRole("navigation", { name: "Espace praticien" });
	await expect(nav.getByRole("link", { name: "Agenda" })).toBeVisible();
	await expect(nav.getByRole("link", { name: "Votre page" })).toHaveCount(0);
	await expect(nav.getByRole("link", { name: "Équipe" })).toHaveCount(0);
	await assistantPage.goto("/pro/agenda");
	await expect(assistantPage.getByRole("grid")).toBeVisible();
	// The appointment the owner took by phone, next week (its details are decrypted for her).
	await assistantPage.getByRole("button", { name: "Semaine suivante" }).click();
	await expect(
		assistantPage.getByRole("gridcell", { name: /Alexis Telephone/ }).first(),
	).toBeVisible();
	await assistantPage.goto("/pro/page");
	await expect(assistantPage.getByRole("textbox", { name: "Accroche" })).toHaveCount(0);
	await assistantPage.goto("/pro/equipe");
	await expect(assistantPage.getByText("Seul le titulaire gère l’équipe")).toBeVisible();
	await assistantPage.goto("/pro/agenda/reglages");
	await expect(
		assistantPage.getByText("Seul le titulaire règle la prise de rendez-vous"),
	).toBeVisible();
	await assistantPage.goto("/pro/agenda/journal");
	await expect(
		assistantPage.getByText("Seul le titulaire consulte le journal des accès"),
	).toBeVisible();
	await context.close();

	// The owner sees the new member, with a second factor, and who read patient details.
	await page.goto("/pro/equipe");
	const row = page.getByRole("row", {
		name: new RegExp(assistantEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
	});
	await expect(row.getByText("Configuré")).toBeVisible();
	await page.goto("/pro/agenda/journal");
	await expect(page.getByRole("heading", { level: 1, name: "Journal des accès" })).toBeVisible();
	await expect(page.getByRole("cell", { name: /Exemple Secretaire/ }).first()).toBeVisible();
	await expectNoAxeViolations(page);
});
