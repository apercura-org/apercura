import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { axeViolations } from "./axe";
import {
	bookThroughPanel,
	firstFreeCell,
	manageLink,
	ownClientAddress,
	panel,
	patient,
} from "./booking-helpers";
import { BOOKING_PRACTITIONERS } from "./booking-seed";

/*
 * The manage page (`/rdv#t=…`) from the confirmation email: the token only ever travels in the
 * URL fragment and in POST bodies, and nothing reachable by GET changes an appointment.
 */

const { manage } = BOOKING_PRACTITIONERS;

test.describe.configure({ mode: "default" });

test.beforeEach(async ({ page }) => {
	await ownClientAddress(page);
});

/** Status of the appointment behind a manage token (only its SHA-256 is stored). */
async function statusOf(token: string): Promise<string | undefined> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is required");
	}
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		const hash = createHash("sha256").update(token, "utf8").digest("hex");
		const [row] = await sql<{ status: string }[]>`
			select status from care.appointments where manage_token_hash = ${hash}
		`;
		return row?.status;
	} finally {
		await sql.end();
	}
}

test("without a token, or with a wrong one, the page says so honestly", async ({ page }) => {
	await page.goto("/rdv");
	await expect(page.getByRole("heading", { name: "Ce lien est incomplet" })).toBeVisible();
	await page.goto(`/rdv#t=${"A".repeat(43)}`);
	await expect(page.getByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Chercher un praticien" })).toHaveAttribute(
		"href",
		"/recherche",
	);
	expect(await axeViolations(page)).toEqual([]);
});

test("the page sends no referrer, is never indexed and loads no third-party script", async ({
	page,
	request,
}) => {
	const response = await request.get("/rdv");
	expect(response.status()).toBe(200);
	expect(response.headers()["referrer-policy"]).toBe("no-referrer");
	expect(response.headers()["x-robots-tag"]).toContain("noindex");
	const html = await response.text();
	expect(html).toMatch(/<meta name="referrer" content="no-referrer"/);
	expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);

	const origins = new Set<string>();
	page.on("request", (entry) => origins.add(new URL(entry.url()).origin));
	await page.goto(`/rdv#t=${"A".repeat(43)}`);
	await expect(page.getByRole("heading", { name: "Ce lien ne fonctionne plus" })).toBeVisible();
	const own = new URL(page.url()).origin;
	expect([...origins].filter((origin) => origin !== own && origin !== "null")).toEqual([]);
});

test("a patient moves then cancels an appointment from the email link", async ({ page }) => {
	const who = patient("manage");
	await bookThroughPanel(page, { slug: manage.slug, who });
	await expect(
		panel(page).getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
	).toBeVisible();
	const link = await manageLink(page.request, who.email);
	expect(link.path).toMatch(/^\/rdv#t=/);

	await page.goto(link.path);
	await expect(page.getByRole("heading", { name: "Votre rendez-vous", level: 1 })).toBeVisible();
	await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();
	await expect(page.getByText("Alexis Fictif")).toBeVisible();
	await expect(page.getByRole("link", { name: "Dr Claire Essaiac" })).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);

	await page.getByRole("button", { name: "Déplacer le rendez-vous" }).click();
	await expect(page.getByRole("heading", { name: "Choisissez un nouvel horaire" })).toBeVisible();
	// The current time is never offered again: shown, marked and spoken as such.
	const current = page.locator('[role="gridcell"][aria-label$=", votre horaire actuel"]');
	await expect(current).toHaveCount(1);
	await expect(current).toHaveAttribute("aria-disabled", "true");
	await expect(current).toContainText("actuel");
	await expect(page.getByText(/Votre horaire actuel, .* est marqué « actuel »/)).toBeVisible();
	const cell = firstFreeCell(page);
	await cell.click();
	expect(await axeViolations(page)).toEqual([]);
	await page.getByRole("button", { name: /^Déplacer au / }).click();
	await expect(page.getByText(/Votre rendez-vous est déplacé/)).toBeVisible();

	await page.getByRole("button", { name: "Annuler le rendez-vous" }).click();
	const confirm = page.getByRole("alertdialog", { name: "Annuler ce rendez-vous ?" });
	await expect(confirm).toBeVisible();
	expect(await axeViolations(page)).toEqual([]);
	await confirm.getByRole("button", { name: "Oui, annuler" }).click();
	await expect(page.getByText(/Votre rendez-vous est annulé/)).toBeVisible();
	await expect(page.getByText("Annulé par vous")).toBeVisible();
	await expect(page.getByRole("button", { name: "Annuler le rendez-vous" })).toHaveCount(0);
	expect(await statusOf(link.token)).toBe("cancelled_by_patient");
});

test("a GET never changes an appointment", async ({ page, request }) => {
	const who = patient("scanner");
	await bookThroughPanel(page, { slug: manage.slug, who });
	await expect(
		panel(page).getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
	).toBeVisible();
	const link = await manageLink(page.request, who.email);
	expect(await statusOf(link.token)).toBe("confirmed");

	// What a mail scanner does: fetch the link (the fragment never leaves the client)…
	expect((await request.get(link.path)).status()).toBe(200);
	expect((await request.get(`/rdv?t=${link.token}`)).status()).toBe(200);
	// …or even guess the procedures: tRPC serves mutations by POST only.
	const input = encodeURIComponent(JSON.stringify({ json: { token: link.token } }));
	for (const procedure of ["cancel", "get", "confirm", "slots", "reschedule"]) {
		const response = await request.get(`/api/trpc/booking.manage.${procedure}?input=${input}`);
		expect(response.ok()).toBe(false);
	}
	expect(await statusOf(link.token)).toBe("confirmed");
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("the manage page reads well and stays usable", async ({ page }) => {
		const who = patient("manage-mobile");
		await bookThroughPanel(page, { slug: manage.slug, who });
		await expect(
			panel(page).getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
		).toBeVisible();
		const link = await manageLink(page.request, who.email);
		await page.goto(link.path);
		await expect(page.getByText("Confirmé", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Déplacer le rendez-vous" }).click();
		await expect(firstFreeCell(page)).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
});
