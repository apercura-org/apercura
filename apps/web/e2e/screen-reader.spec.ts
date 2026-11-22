import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
	fillDetails,
	firstFreeCell,
	manageLink,
	ownClientAddress,
	panel,
	patient,
	readCode,
} from "./booking-helpers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";
import { createProAccount, testDb } from "./pro";
import { expectPhrasesInOrder, ScreenReader } from "./screen-reader";

/*
 * Screen-reader flows (RGAA 4.1 / WCAG 2.2, the automatable part of issue #32): what a screen
 * reader user hears, phrase by phrase, from the home search to a practitioner page, through
 * every step of the booking panel, on /rdv and on the practice's Today and Week views. A virtual
 * screen reader reads the real pages of the production build (`screen-reader.ts`); the specs
 * assert landmarks, the heading outline, field rows read as label then value, honest states and
 * the announcements of slot selection and code errors. A manual pass with VoiceOver and NVDA is
 * still needed (docs/accessibility/rgaa-self-assessment.md).
 *
 * Synthetic fixtures only: Dr Jean-Pierre Fictif (RPPS 19999990021, unclaimed, no booking) and
 * Dr Elsa Essaiae (RPPS 19999991045), whose agenda the global setup opens (`booking-seed.ts`).
 */

// The practitioner space and /rdv run only scripts carrying their nonce: the reader is injected.
test.use({ bypassCSP: true });

const FICTIF = { slug: "jean-pierre-fictif-19999990021", name: "Dr Jean-Pierre Fictif" };
const { screenReader: elsa } = BOOKING_PRACTITIONERS;

/** Headings as the reader announced them: "heading, <name>, level <n>". */
function headings(log: readonly string[]) {
	return log.flatMap((phrase) => {
		const match = phrase.match(/^heading, (.*), level (\d)$/);
		return match ? [{ name: match[1] ?? "", level: Number(match[2]) }] : [];
	});
}

/** One h1 first, then no level skipped on the way down (h2 → h4 would be a gap). */
function expectHeadingOutline(log: readonly string[]) {
	const outline = headings(log);
	const listing = outline.map((heading) => `${heading.level} ${heading.name}`).join("\n");
	expect(outline[0]?.level, `First heading is not an h1:\n${listing}`).toBe(1);
	expect(
		outline.filter((heading) => heading.level === 1),
		listing,
	).toHaveLength(1);
	for (const [index, heading] of outline.entries()) {
		const previous = outline[index - 1];
		if (previous) {
			expect(heading.level, `"${heading.name}" skips a level:\n${listing}`).toBeLessThanOrEqual(
				previous.level + 1,
			);
		}
	}
}

/** A field row of a description list, read as its label (term) then its value (definition). */
function expectFieldRow(log: readonly string[], label: string, value: string | RegExp) {
	const found = log.some(
		(phrase, index) =>
			phrase === "term" &&
			log[index + 1] === label &&
			log[index + 2] === "end of term" &&
			log[index + 3] === "definition" &&
			(typeof value === "string" ? log[index + 4] === value : value.test(log[index + 4] ?? "")),
	);
	expect(found, `No field row "${label}" → "${value}" in:\n${log.join("\n")}`).toBe(true);
}

/** Reads the whole page, from the top to the end of the footer. */
async function readPage(page: Page) {
	const reader = await ScreenReader.start(page);
	const log = await reader.readUntil(/^end of contentinfo$/);
	await reader.stop();
	return log;
}

test("home search, results and an unclaimed practitioner page read in order", async ({ page }) => {
	await page.goto("/");
	const home = await readPage(page);
	expectPhrasesInOrder(home, [
		"link, Aller au contenu",
		"banner",
		"navigation, Principale",
		"main",
		"heading, Apercura, level 1",
		"search, Trouver un professionnel de santé",
		/^combobox, Qui \?, has popup listbox/,
		/^combobox, Où \?, has popup listbox/,
		"button, Chercher",
		"heading, Chaque professionnel a déjà sa page, level 2",
		// The specimen card is labelled as fictitious before anything else is read.
		"article, Dr Exemple Martin, Exemple fictif",
		"Page non réclamée",
		"heading, Ce à quoi Apercura s’engage, level 2",
		"table, Ce à quoi Apercura s’engage",
		"heading, Construit à partir du registre national, level 2",
		"heading, Vous êtes professionnel de santé ?, level 2",
		"end of main",
		"contentinfo",
		"navigation, À propos d’Apercura",
		"link, Accessibilité",
	]);
	expectHeadingOutline(home);

	// Search by name with the keyboard: the results say what was searched, how they are sorted
	// and, honestly, that booking is not open for these practitioners yet.
	const who = page.getByRole("combobox", { name: "Qui ?" });
	await who.fill("Fictif");
	// Suggestions open as the user types; Tab leaves them for "Où ?", Enter submits the form.
	await expect(page.getByRole("option", { name: /Jean-Pierre Fictif/ })).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("combobox", { name: "Où ?" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/recherche\?quoi=Fictif/);
	await expect(page.getByRole("table", { name: "Résultats" })).toBeVisible();
	const results = await readPage(page);
	expectPhrasesInOrder(results, [
		"main",
		"heading, Recherche, level 1",
		"search, Trouver un professionnel de santé",
		"Vous avez cherché « Fictif »",
		"region, Résultats",
		"heading, Résultats, level 2",
		"Résultats 1 à 1",
		/Personne ne paie pour apparaître plus haut\.$/,
		/^La prise de rendez-vous en ligne n’est pas encore ouverte : appelez le cabinet/,
		"table, Résultats",
		"columnheader, Professionnel",
		"columnheader, Lieu d’exercice",
		"columnheader, Rendez-vous",
		/^row, Dr Jean-Pierre Fictif Médecin généraliste /,
		"link, Dr Jean-Pierre Fictif",
		"link, Appeler le 01 99 00 01 01",
		"end of main",
	]);
	expectHeadingOutline(results);

	await page.getByRole("link", { name: FICTIF.name }).focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(new RegExp(`/praticien/${FICTIF.slug}$`));
	const practitioner = await readPage(page);
	expectPhrasesInOrder(practitioner, [
		"main",
		"navigation, Vous êtes ici",
		"heading, Dr Jean-Pierre Fictif, level 1",
		"Médecin généraliste",
		"Page non réclamée",
		"Construite à partir du registre public. Le professionnel ne l’a pas encore complétée.",
		"region, Profession et qualifications",
		"region, Lieux d’exercice",
		"heading, Cabinet Medical de l'Exemple, level 3",
		"region, Informations pratiques",
		"region, Honoraires et Assurance Maladie",
		"complementary, Rendez-vous et page",
		"region, Rendez-vous",
		"La prise de rendez-vous en ligne n’est pas encore ouverte pour ce professionnel. Pour prendre rendez-vous, appelez le cabinet.",
		"link, Appeler le 01 99 00 01 01",
		"region, C’est vous ?",
		"link, Revendiquer cette page",
		"region, Une erreur ?",
		"link, Signaler une erreur",
		"end of complementary, Rendez-vous et page",
		"end of main",
	]);
	expectHeadingOutline(practitioner);
	expectFieldRow(practitioner, "Profession", "Médecin");
	expectFieldRow(practitioner, "Spécialité", "Médecin généraliste");
	// Unknown facts say so instead of being left out or blank.
	expectFieldRow(practitioner, "Autres qualifications", "Non renseigné");
	expectFieldRow(practitioner, "Téléphone", "link, 01 99 00 01 01");
	expectFieldRow(practitioner, "Secteur de conventionnement", "Conventionné secteur 1");
	expectFieldRow(practitioner, "Carte Vitale", "Acceptée");
	// Every page ends with its source and the date of the data, read as a date.
	expectPhrasesInOrder(practitioner, [
		"end of complementary, Rendez-vous et page",
		"Source",
		"Annuaire Santé, Agence du numérique en santé",
		"Mise à jour",
		"time",
		/^\d{1,2} \S+ \d{4}$/,
		"end of main",
	]);
});

test.describe("booking, the appointment page and the practice's agenda", () => {
	test.describe.configure({ mode: "serial" });

	const who = patient("screen-reader");
	let slotLabel = "";

	test("the booking panel announces each step, the chosen time and code errors", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await ownClientAddress(page);
		await page.goto(`/praticien/${elsa.slug}`);
		const openLink = page.getByRole("link", { name: "Prendre rendez-vous" });
		await expect(openLink).toBeVisible();
		const reader = await ScreenReader.start(page);

		// The page says booking is open and when the next free time is, before the button.
		const before = await reader.readUntil(/^link, Prendre rendez-vous/);
		expectPhrasesInOrder(before, [
			"heading, Dr Elsa Essaiae, level 1",
			"region, Rendez-vous",
			"La prise de rendez-vous en ligne est ouverte. Elle est gratuite et sans compte.",
			"Prochain horaire libre",
			"link, Prendre rendez-vous, has popup dialog",
		]);

		// Step 1, reason: the dialog takes the focus and reads its title, the practitioner, the
		// step count and a required radio group.
		await reader.clear();
		await openLink.focus();
		await page.keyboard.press("Enter");
		const dialog = panel(page);
		await expect(dialog).toBeVisible();
		await expect(async () => {
			expect(await reader.log()).toContain("dialog, Prendre rendez-vous");
		}).toPass({ timeout: 10_000 });
		expectPhrasesInOrder(await reader.readUntil(/^button, Continuer$/), [
			"dialog, Prendre rendez-vous",
			"heading, Prendre rendez-vous, level 2",
			"button, Fermer",
			"Avec Dr Elsa Essaiae",
			"Étape 1 sur 4 : Motif",
			"heading, Pour quel motif ?, level 3",
			/^radiogroup, Motif du rendez-vous, .*required$/,
			"radio, Consultation 15 min, not checked, position 1, set size 2",
			/^radio, Première consultation 30 min · première consultation uniquement, not checked, position 2, set size 2$/,
			"button, Continuer",
		]);

		// Step 2, time: the focus lands on the step's heading; the grid reads days as row headers
		// and every time with its date and state (past times say so and cannot be chosen).
		await reader.clear();
		await dialog.getByText("Consultation", { exact: true }).click();
		await dialog.getByRole("button", { name: "Continuer" }).click();
		await expect(dialog.getByRole("heading", { name: "Choisissez un horaire" })).toBeFocused();
		await expect(firstFreeCell(dialog)).toBeVisible();
		const times = await reader.readUntil(/^gridcell, .*, not selected$/);
		expectPhrasesInOrder(times, [
			"heading, Choisissez un horaire, level 3",
			/^Du .+ au .+$/,
			"button, 14 jours précédents, disabled",
			"button, 14 jours suivants",
			"Heures du cabinet (heure d’Europe centrale).",
			"grid, Horaires disponibles",
			/^rowheader, /,
			/^gridcell, \S+ \d+ \S+, \d\d:\d\d, (passé, disabled, )?not selected$/,
		]);

		// Choosing a time is confirmed by a polite announcement naming it.
		await reader.clear();
		const cell = firstFreeCell(dialog);
		slotLabel = (await cell.getAttribute("aria-label")) ?? "";
		expect(slotLabel).toMatch(/^\S+ \d+ \S+, \d\d:\d\d$/);
		await cell.focus();
		await page.keyboard.press("Enter");
		await expect(cell).toHaveAttribute("aria-selected", "true");
		await expect(async () => {
			expect(await reader.log()).toContain(`polite: Sélectionné : ${slotLabel}`);
		}).toPass({ timeout: 10_000 });

		// Step 3, details: required fields say so; a submit with nothing filled in moves the focus
		// to the first field, which then reads its error.
		await dialog.getByRole("button", { name: "Continuer" }).click();
		await expect(dialog.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
		await reader.clear();
		await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
		const firstName = dialog.getByLabel("Prénom");
		await expect(firstName).toBeFocused();
		await expect(firstName).toHaveAttribute("aria-invalid", "true");
		await reader.clear();
		await dialog.getByLabel("Nom", { exact: true }).focus();
		await expect(async () => {
			expectPhrasesInOrder(await reader.log(), [
				/^textbox, Nom, Saisissez votre nom\., invalid, required$/,
			]);
		}).toPass({ timeout: 10_000 });

		// Step 4, code: the heading takes the focus; a wrong code moves the focus back to the field,
		// which reads the error and the attempts left.
		await fillDetails(page, who);
		await reader.clear();
		await dialog.getByRole("button", { name: "Recevoir mon code" }).click();
		await expect(dialog.getByRole("heading", { name: "Saisissez votre code" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(async () => {
			expect(await reader.log()).toContain("heading, Saisissez votre code, level 3");
		}).toPass({ timeout: 10_000 });
		const code = await readCode(page.request, who.email);
		const wrong = code === "000000" ? "111111" : "000000";
		const codeField = dialog.getByLabel("Code à 6 chiffres");
		await codeField.fill(wrong);
		await reader.clear();
		await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
		await expect(codeField).toBeFocused();
		await expect(async () => {
			expectPhrasesInOrder(await reader.log(), [
				`textbox, Code à 6 chiffres, ${wrong}, Le code est valable 30 minutes. Ce code n’est pas le bon. Il vous reste 4 essais., invalid, required`,
			]);
		}).toPass({ timeout: 10_000 });

		// Done: the confirmation is a heading, then a status naming the email it was sent to, then
		// the appointment as field rows.
		await codeField.fill(code);
		await reader.clear();
		await dialog.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
		await expect(
			dialog.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
		).toBeFocused();
		const done = await reader.readUntil(/^Heure$/);
		expectPhrasesInOrder(done, [
			"heading, Votre rendez-vous est confirmé, level 3",
			"status",
			`Un e-mail de confirmation part vers ${who.email}. Il contient le lien pour annuler ou déplacer le rendez-vous.`,
			"end of status",
		]);
		expectFieldRow(done, "Avec", "Dr Elsa Essaiae");
		expectFieldRow(done, "Motif", "Consultation");
	});

	test("/rdv reads the appointment as field rows, then what the patient can do", async ({
		page,
	}) => {
		const link = await manageLink(page.request, who.email);
		await page.goto(link.path);
		await expect(page.getByRole("region", { name: "État" })).toBeVisible();
		const appointment = await readPage(page);
		expectPhrasesInOrder(appointment, [
			"main",
			"heading, Votre rendez-vous, level 1",
			"region, État",
			"heading, État, level 2",
			"Confirmé",
			"region, Ce que vous pouvez faire",
			"button, Déplacer le rendez-vous",
			"button, Annuler le rendez-vous",
			"end of main",
		]);
		expectHeadingOutline(appointment);
		expectFieldRow(appointment, "Avec", "link, Dr Elsa Essaiae");
		expectFieldRow(appointment, "Heure", slotLabel.split(", ").at(-1) ?? "");
		expectFieldRow(appointment, "Motif", "Consultation");
		expectFieldRow(appointment, "Lieu", /^Cabinet Fictif Ae, .+75005 Paris 5e Arrondissement$/);
		expectFieldRow(appointment, "Patient", `${who.firstName} ${who.lastName}`);

		// Without its token the page says what happened and what to do next.
		await page.goto("/rdv");
		await expect(page.getByRole("heading", { name: "Ce lien est incomplet" })).toBeVisible();
		expectPhrasesInOrder(await readPage(page), [
			"heading, Votre rendez-vous, level 1",
			"heading, Ce lien est incomplet, level 2",
			/^Rouvrez le lien de votre e-mail de confirmation\./,
			"link, Chercher un praticien",
		]);
	});

	test("Today and the week grid read as named tables and a grid of days and times", async ({
		page,
		request,
		baseURL,
	}) => {
		test.setTimeout(180_000);
		// The practice owner: a verified account made a member of the seeded practice.
		const account = await createProAccount(page, request, {
			name: "Elsa Essaiae",
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
				VALUES (${randomUUID()}, 'e2e-booking-screenReader', ${user.id}, 'owner')
			`;
			await sql`
				UPDATE directory.practitioners
				SET claim_status = 'claimed', owner_org_id = 'e2e-booking-screenReader'
				WHERE national_id = ${elsa.rpps}
			`;
		} finally {
			await sql.end();
		}

		await page.goto("/pro/aujourdhui");
		await expect(page.getByRole("region", { name: "Les rendez-vous du jour" })).toBeVisible();
		await expect(page.locator('[role="status"]')).toHaveCount(0);
		const today = await readPage(page);
		const todayLabel = new Intl.DateTimeFormat("fr-FR", {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone: "Europe/Paris",
		}).format(new Date());
		expectPhrasesInOrder(today, [
			"navigation, Espace praticien",
			"link, Aujourd’hui, current page",
			"main",
			"heading, Aujourd’hui, level 1",
			todayLabel,
			"region, Prochain patient",
			"region, Les rendez-vous du jour",
			"button, Ajouter un rendez-vous",
			"button, Bloquer une plage",
			"link, Voir la semaine",
		]);
		if (slotLabel.startsWith(todayLabel)) {
			// Booked for today (the usual case): the day is a table named by its heading.
			const time = slotLabel.split(", ").at(-1) ?? "";
			expectPhrasesInOrder(today, [
				"region, Les rendez-vous du jour",
				"table, Les rendez-vous du jour",
				"columnheader, Heure",
				"columnheader, Rendez-vous",
				"columnheader, État",
				"columnheader, Actions",
				new RegExp(`^row, ${time} à \\d\\d:\\d\\d Alexis Fictif Consultation Confirmé`),
				"region, Demandes à traiter",
			]);
		} else {
			// Booked for a later day (late runs): the empty day says so once.
			expectPhrasesInOrder(today, ["Aucun rendez-vous aujourd’hui."]);
		}
		expectPhrasesInOrder(today, [
			"region, Demandes à traiter",
			"Aucune demande en attente.",
			"Les données des patients de cette page sont déchiffrées pour vous, et chaque accès est enregistré.",
			"end of main",
		]);
		expectHeadingOutline(today);

		// The week: view switch, week navigation, legend and keyboard help, then a grid whose
		// columns are days and rows are times.
		await page.goto("/pro/agenda");
		await expect(page.getByRole("grid")).toBeVisible();
		const reader = await ScreenReader.start(page);
		const week = await reader.readUntil(/^gridcell, /);
		expectPhrasesInOrder(week, [
			"heading, Agenda, level 1",
			"group, Affichage",
			"button, Semaine, pressed",
			"button, Jour, not pressed",
			/^navigation, Semaine du /,
			"button, Semaine précédente",
			"button, Semaine suivante",
			/^heading, Semaine du .+, level 2$/,
			"list, Légende",
			/^Les flèches parcourent la semaine/,
			/^grid, Semaine du /,
			"columnheader, Heure",
			/^columnheader, lundi \d+ \S+$/,
			/^columnheader, dimanche \d+ \S+$/,
			/^rowheader, \d\d:\d\d$/,
			/^gridcell, lundi \d+ \S+, \d\d:\d\d, /,
		]);
		expectHeadingOutline(week);

		// The appointment's cell reads its date, time, patient and state when focused (it may be
		// next week); arrows move one day or one time step and read the new cell.
		const entry = page.getByRole("gridcell", { name: /Alexis Fictif.*Confirmé/ });
		for (let attempt = 0; attempt < 3 && (await entry.count()) === 0; attempt += 1) {
			await page.getByRole("button", { name: "Semaine suivante" }).click();
			await page.waitForTimeout(500);
		}
		await reader.clear();
		await entry.first().focus();
		await page.keyboard.press("ArrowDown");
		await expect(async () => {
			expectPhrasesInOrder(await reader.log(), [
				new RegExp(`^gridcell, .*Alexis Fictif, ${slotLabel} à \\d\\d:\\d\\d, Confirmé$`),
				/^gridcell, \S+ \d+ \S+, \d\d:\d\d/,
			]);
		}).toPass({ timeout: 10_000 });
	});
});
