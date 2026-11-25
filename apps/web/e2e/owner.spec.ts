import { randomUUID } from "node:crypto";
import { signRevalidation } from "@apercura/core/revalidation";
import {
	type APIRequestContext,
	type BrowserContext,
	expect,
	type Page,
	test,
} from "@playwright/test";
import { E2E_BOOKING_ENV } from "./booking-env";
import { capture, ownClientAddress } from "./booking-helpers";
import { waitForEmail } from "./mailpit";
import {
	createProAccount,
	expectNoAxeViolations,
	type ProAccount,
	resetPractitioner,
	testDb,
} from "./pro";

/*
 * The owner experience (issue #92) on the synthetic fixtures: the "Is this you?" block, the
 * "I am this practitioner" contact form and its admin queue, the opt-out from both kinds of page,
 * page statistics, the share kit, the poster and the badge. Fictitious practitioners only.
 */

/** Unclaimed: the contact form and the opt-out of an unclaimed page. */
const UNCLAIMED = { rpps: "19999991102", slug: "anne-essaiak-19999991102", name: "Essaiak" };
/** Claimed in setup by an owner account made here: statistics, share kit, poster. */
const OWNED = { rpps: "19999991110", slug: "benoit-essaial-19999991110", name: "Essaial" };

const BROWSER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

test.describe.configure({ mode: "serial" });

let owner: { context: BrowserContext; page: Page; account: ProAccount } | undefined;
let ownedId = 0;
/** The professional email of the contact request sent by the second test. */
let contactEmail = "";

async function revalidate(request: APIRequestContext, tags: string[]) {
	const body = JSON.stringify({ tags });
	const timestamp = Math.floor(Date.now() / 1000);
	const response = await request.post("/api/revalidate", {
		data: body,
		headers: {
			"content-type": "application/json",
			"x-apercura-timestamp": String(timestamp),
			"x-apercura-signature": signRevalidation(E2E_BOOKING_ENV.REVALIDATE_SECRET, timestamp, body),
		},
	});
	expect(response.ok()).toBe(true);
}

test.afterAll(async () => {
	await owner?.context.close();
	owner = undefined;
	await resetPractitioner(OWNED.rpps);
	await resetPractitioner(UNCLAIMED.rpps);
});

test("an unclaimed page says what claiming gives, and offers the claim, the contact and the opt-out", async ({
	page,
}) => {
	await resetPractitioner(UNCLAIMED.rpps);
	await page.goto(`/fr/praticien/${UNCLAIMED.slug}`);
	const block = page.getByRole("region", { name: "C’est vous ?" });
	await expect(block).toBeVisible();
	for (const benefit of [
		"gratuit, sans abonnement ni engagement ;",
		"les statistiques de consultation de votre page ;",
		"un kit de partage : lien, QR code et affiche.",
	]) {
		await expect(block.getByRole("listitem").filter({ hasText: benefit })).toBeVisible();
	}
	await expect(block.getByRole("link", { name: "Revendiquer cette page" })).toHaveAttribute(
		"href",
		`/fr/pro/revendiquer?rpps=${UNCLAIMED.rpps}`,
	);
	await expect(
		block.getByRole("link", { name: "Pas de carte CPS ? Contactez-nous" }),
	).toHaveAttribute("href", `/fr/praticien/${UNCLAIMED.slug}/c-est-moi`);
	await expect(
		block.getByRole("link", {
			name: "Vous êtes le titulaire de cette page et ne souhaitez pas apparaître publiquement ? C’est ici",
		}),
	).toHaveAttribute("href", `/fr/praticien/${UNCLAIMED.slug}/retrait`);
	// No beacon on an unclaimed page: it keeps no statistics.
	const beacons: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/page-views/")) beacons.push(request.url());
	});
	await page.reload();
	await expect(block).toBeVisible();
	await page.waitForTimeout(500);
	expect(beacons).toEqual([]);
	await expectNoAxeViolations(page);
	await capture(page, "owner-unclaimed-block", block);

	// The opt-out is reachable from the keyboard, then opens the GDPR objection form.
	const optOut = block.getByRole("link", { name: /ne souhaitez pas apparaître publiquement/ });
	await optOut.focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("heading", { level: 1, name: "Demander le retrait de cette page" }),
	).toBeVisible();
	await expect(page.getByText(/article 21 du RGPD/)).toBeVisible();
	await expect(page.getByLabel("Votre e-mail")).toBeVisible();
	await expectNoAxeViolations(page);
});

test("“I am this practitioner”: the request is stored encrypted, acknowledged and alerted", async ({
	page,
	request,
}) => {
	test.setTimeout(120_000);
	await ownClientAddress(page);
	await page.goto(`/fr/praticien/${UNCLAIMED.slug}`);
	await page.getByRole("link", { name: "Pas de carte CPS ? Contactez-nous" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "Je suis ce praticien" })).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	await expect(
		page.getByText("Ce formulaire est réservé au praticien de cette page"),
	).toBeVisible();
	const rpps = page.getByLabel("Numéro RPPS de la page");
	await expect(rpps).toHaveValue(UNCLAIMED.rpps);
	await expect(rpps).toHaveAttribute("readonly", "");
	await expectNoAxeViolations(page);
	await capture(page, "owner-contact-form");

	const email = `e2e-contact-${randomUUID().slice(0, 8)}@example.test`;
	contactEmail = email;
	await page.getByLabel("Vos nom et prénom").fill("Anne Essaiak");
	await page.getByLabel("Votre e-mail professionnel").fill(email);
	await page.getByLabel("Votre téléphone (facultatif)").fill("01 99 00 11 02");
	await page
		.getByLabel("Votre message")
		.fill("Ma carte CPS est en renouvellement ; merci de me recontacter (exemple de test).");
	await page.getByRole("button", { name: "Envoyer ma demande" }).click();
	await expect(page.getByText("Votre demande est bien reçue")).toBeVisible({ timeout: 60_000 });

	const sql = testDb();
	try {
		const [row] = await sql<{ status: string; content_enc: string }[]>`
			SELECT r.status, r.content_enc FROM directory.practitioner_contact_requests r
			JOIN directory.practitioners p ON p.id = r.practitioner_id
			WHERE p.national_id = ${UNCLAIMED.rpps}
			ORDER BY r.created_at DESC LIMIT 1
		`;
		expect(row?.status).toBe("new");
		expect(row?.content_enc).toMatch(/^enc:v1:/);
		for (const clear of ["Essaiak", email, "01 99", "CPS"]) {
			expect(row?.content_enc).not.toContain(clear);
		}
	} finally {
		await sql.end();
	}
	const ack = await waitForEmail(request, email, /Votre demande est bien reçue/);
	// The acknowledgment never repeats what was typed.
	expect(ack.text).not.toContain("renouvellement");
	const alert = await waitForEmail(
		request,
		"admin-alerts@example.test",
		/demande(s)? « Je suis ce praticien »/,
	);
	expect(alert.text).toContain("/fr/pro/admin/contacts");
	expect(alert.text).not.toContain("Essaiak");
	expect(alert.text).not.toContain(email);
});

test("administrators read a contact request (audited) and move it along", async ({
	browser,
	request,
	baseURL,
}) => {
	test.setTimeout(120_000);
	// One account for the rest of the file, administrator here and page owner next: password
	// sign-ins are limited to 5 a minute and the test server sees every spec as one client.
	const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
	const page = await context.newPage();
	const account = await createProAccount(page, request, {
		name: "Benoit Essaial",
		baseURL: baseURL as string,
		platformAdmin: true,
	});
	owner = { context, page, account };
	await page.goto("/fr/pro/admin/contacts");
	await expect(
		page.getByRole("heading", { level: 1, name: "Demandes « Je suis ce praticien »" }),
	).toBeVisible();
	await expectNoAxeViolations(page);
	await capture(page, "owner-admin-contacts");
	const row = page.getByRole("row", { name: new RegExp(UNCLAIMED.name, "i") }).first();
	await row.getByRole("button", { name: "Lire" }).click();
	await expect(row.getByText(contactEmail)).toBeVisible();
	await row.getByRole("button", { name: "Marquer comme recontactée" }).click();
	await expect(page.getByRole("tab", { name: /Recontactées \(\d+\)/ })).toBeVisible();
	await page.getByRole("tab", { name: /Recontactées/ }).click();
	await expect(
		page.getByRole("row", { name: new RegExp(UNCLAIMED.name, "i") }).first(),
	).toBeVisible();
	await expectNoAxeViolations(page);
});

test("a claimed page counts its views without cookies and keeps the opt-out", async ({
	browser,
	request,
}) => {
	test.setTimeout(150_000);
	ownedId = await resetPractitioner(OWNED.rpps);
	if (!owner) throw new Error("The administrator test must run first");
	const { account } = owner;
	const sql = testDb();
	const org = `e2e-owner-${randomUUID().slice(0, 8)}`;
	try {
		const [user] = await sql<{ id: string }[]>`
			SELECT id FROM directory."user" WHERE email = ${account.email}
		`;
		await sql`INSERT INTO directory.organization (id, name, slug) VALUES (${org}, 'Cabinet Essaial', ${org})`;
		await sql`
			INSERT INTO directory.member (id, organization_id, user_id, role)
			VALUES (${randomUUID()}, ${org}, ${user?.id ?? ""}, 'owner')
		`;
		await sql`
			UPDATE directory.practitioners SET claim_status = 'claimed', owner_org_id = ${org}
			WHERE id = ${ownedId}
		`;
		await sql`SELECT directory.refresh_practitioner(${[ownedId]}::integer[])`;
	} finally {
		await sql.end();
	}
	await revalidate(request, [`practitioner:${ownedId}`]);

	// The page sends one empty beacon, without cookies.
	const visitorContext = await browser.newContext();
	const visitor = await visitorContext.newPage();
	const beacon = visitor.waitForRequest((req) => req.url().includes(`/api/page-views/${ownedId}`));
	await visitor.goto(`/fr/praticien/${OWNED.slug}`);
	const block = visitor.getByRole("region", { name: "Page gérée par le praticien" });
	await expect(block).toBeVisible();
	const sent = await beacon;
	expect(sent.method()).toBe("POST");
	expect(sent.postData() ?? "").toBe("");
	expect(await sent.headerValue("cookie")).toBeNull();
	await expect(
		block.getByRole("link", { name: /ne souhaitez pas apparaître publiquement/ }),
	).toHaveAttribute("href", `/fr/praticien/${OWNED.slug}/retrait`);
	await expectNoAxeViolations(visitor);
	await capture(visitor, "owner-claimed-block", block);

	// A claimed page is removed by its owner, from the editor: the opt-out says so.
	await block.getByRole("link", { name: /ne souhaitez pas apparaître publiquement/ }).click();
	await expect(visitor.getByText("Cette page est gérée par son praticien")).toBeVisible();
	await expect(
		visitor.getByRole("link", { name: "Retirer ma page depuis mon espace praticien" }),
	).toHaveAttribute("href", "/fr/pro/page#editor-remove");
	await expectNoAxeViolations(visitor);
	await visitorContext.close();

	// The headless test browser is left out as a robot: count a desktop visit through the API.
	const post = (headers: Record<string, string>) =>
		request.post(`/api/page-views/${ownedId}`, {
			headers: {
				"user-agent": BROWSER_AGENT,
				"sec-fetch-site": "same-origin",
				"x-forwarded-for": `10.92.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
				...headers,
			},
		});
	const counted = await post({});
	expect(counted.status()).toBe(204);
	expect(counted.headers()["set-cookie"]).toBeUndefined();
	// Refused quietly below: another site's beacon, a robot, a visitor who asked not to be tracked.
	const views = async () => {
		const check = testDb();
		try {
			const [row] = await check<{ views: number }[]>`
				SELECT coalesce(sum(views), 0)::integer AS views FROM directory.page_view_days
				WHERE practitioner_id = ${ownedId}
			`;
			return row?.views ?? 0;
		} finally {
			await check.end();
		}
	};
	// Counted after the answer (Next.js `after`): wait for it.
	await expect.poll(views).toBeGreaterThanOrEqual(1);
	const before = await views();
	const refused: Record<string, string>[] = [
		{ "sec-fetch-site": "cross-site" },
		{ "user-agent": "curl/8.7.1" },
		{ "sec-gpc": "1" },
	];
	for (const headers of refused) {
		expect((await post(headers)).status()).toBe(204);
	}
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	expect(await views()).toBe(before);
});

test("the owner sees the statistics, the checklist and the dashboard summary", async () => {
	const page = owner?.page;
	if (!page) throw new Error("The owner test must run first");
	await page.goto("/fr/pro/statistiques");
	await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toBeVisible();
	const summary = page.getByRole("region", { name: "En bref" });
	await expect(summary.getByText("Consultations, 30 derniers jours")).toBeVisible();
	await expect(page.getByRole("img", { name: /Consultations par jour/ })).toBeVisible();
	await page.getByText("Voir les chiffres jour par jour").click();
	await expect(page.getByRole("table", { name: "Consultations par jour" })).toBeVisible();
	await expect(page.getByRole("table", { name: /par semaine/ })).toBeVisible();
	const checklist = page.getByRole("region", { name: "Ce qui manque à la page" });
	await expect(checklist.getByText("Photo", { exact: true })).toBeVisible();
	await expect(checklist.getByRole("link", { name: /Compléter \(Photo\)/ })).toHaveAttribute(
		"href",
		"/fr/pro/page",
	);
	await expect(page.getByText(/sans cookie ni identifiant/)).toBeVisible();
	await expectNoAxeViolations(page);
	await capture(page, "owner-stats");
	await capture(page, "owner-stats-checklist", checklist);

	await page.goto("/fr/pro/tableau-de-bord");
	const own = page.getByRole("region", { name: "Votre page" });
	await expect(own.getByText(/\d+ consultations? ces 30 derniers jours/)).toBeVisible();
	await expect(own.getByRole("link", { name: /Voir les statistiques/ })).toHaveAttribute(
		"href",
		"/fr/pro/statistiques",
	);
	await expect(own.getByRole("link", { name: /Partager la page/ })).toHaveAttribute(
		"href",
		"/fr/pro/partager",
	);

	// The claim entry page offers the same ways: the contact form and the opt-out, which for the
	// signed-in owner of the page leads to the editor's removal.
	const optOut = /ne souhaitez pas apparaître publiquement/;
	await page.goto(`/fr/pro/revendiquer?rpps=${UNCLAIMED.rpps}`);
	await expect(
		page.getByRole("link", { name: "Pas de carte CPS ? Contactez-nous" }),
	).toHaveAttribute("href", `/fr/praticien/${UNCLAIMED.slug}/c-est-moi`);
	await expect(page.getByRole("link", { name: optOut })).toHaveAttribute(
		"href",
		`/fr/praticien/${UNCLAIMED.slug}/retrait`,
	);
	await expectNoAxeViolations(page);
	await page.goto(`/fr/pro/revendiquer?rpps=${OWNED.rpps}`);
	await expect(page.getByRole("link", { name: optOut })).toHaveAttribute(
		"href",
		"/fr/pro/page#editor-remove",
	);
});

test("the share kit gives the link, the QR code files, the poster and a tracking-free badge", async ({
	request,
	baseURL,
}) => {
	const page = owner?.page;
	if (!page) throw new Error("The owner test must run first");
	await page.goto("/fr/pro/partager");
	await expect(page.getByRole("heading", { level: 1, name: "Partager ma page" })).toBeVisible();
	const url = `${new URL(baseURL as string).origin}/fr/praticien/${OWNED.slug}`;
	await expect(page.getByLabel("Adresse de la page")).toHaveValue(url);
	const linkSection = page.getByRole("region", { name: "Le lien de la page" });
	await linkSection.getByRole("button", { name: "Copier" }).click();
	await expect(linkSection.getByRole("status")).toHaveText("Copié dans le presse-papiers.");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

	await expect(page.getByRole("img", { name: `QR code vers ${url}` })).toBeVisible();
	const svg = page.waitForEvent("download");
	await page.getByRole("button", { name: "Télécharger en SVG" }).click();
	expect((await svg).suggestedFilename()).toMatch(/^apercura-.+-qr\.svg$/);
	const png = page.waitForEvent("download");
	await page.getByRole("button", { name: "Télécharger en PNG" }).click();
	expect((await png).suggestedFilename()).toMatch(/^apercura-.+-qr\.png$/);

	const snippet = await page.getByLabel("Code HTML du badge").inputValue();
	expect(snippet).toContain(`href="${url}"`);
	expect(snippet).toContain("/badges/apercura-fr.svg");
	expect(snippet).not.toMatch(/<script|onload|onclick/i);
	await expectNoAxeViolations(page);
	await capture(page, "owner-share");
	await capture(
		page,
		"owner-share-badge",
		page.getByRole("region", { name: "Le badge pour votre site" }),
	);

	const badge = await request.get("/badges/apercura-fr.svg");
	expect(badge.status()).toBe(200);
	expect(badge.headers()["content-type"]).toContain("image/svg+xml");
	expect(badge.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
	expect(badge.headers()["set-cookie"]).toBeUndefined();
	const body = await badge.text();
	expect(body).toContain("Retrouvez-moi sur");
	expect(body).not.toMatch(/<script|href=/i);

	await page.getByRole("link", { name: "Affiche A5" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "Affiche à imprimer" })).toBeVisible();
	const sheet = page.getByRole("article", { name: "Aperçu de l’affiche" });
	await expect(sheet.getByText("Retrouvez-moi sur Apercura")).toBeVisible();
	await expect(sheet.getByText("Dr Benoit Essaial", { exact: true })).toBeVisible();
	await expect(sheet.getByRole("img", { name: /QR code/ })).toBeVisible();
	await expectNoAxeViolations(page);
	await capture(page, "owner-poster-a5", sheet);
	// Printed, only the sheet remains.
	await page.emulateMedia({ media: "print" });
	await expect(page.getByRole("button", { name: "Imprimer l’affiche" })).toBeHidden();
	await expect(sheet).toBeVisible();
	await page.emulateMedia({ media: "screen" });
});
