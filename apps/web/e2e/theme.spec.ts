import { expect, type Page, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The colour theme (light, dark or the system's) and the language picker. The theme is a
 * device preference applied before the first paint by /theme.js, a same-origin static file:
 * the pages themselves stay the same static, cacheable HTML for everyone.
 */

const PUBLIC = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const PRACTITIONER = "/fr/praticien/camille-exemple-19999990013";

/** The page's ground colour, as painted. */
const ground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const themeAttribute = (page: Page) =>
	page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test("/theme.js is a static same-origin script", async ({ request }) => {
	const response = await request.get("/theme.js");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain("text/javascript");
	expect(response.headers()["cache-control"]).toContain("public");
	expect(await response.text()).toContain("apercura-theme");
});

test("pages load /theme.js in the head, before any content", async ({ request }) => {
	for (const path of ["/", "/fr", PRACTITIONER, "/fr/pro/connexion"]) {
		const html = await (await request.get(path)).text();
		const head = html.slice(0, html.indexOf("</head>"));
		expect(head, path).toContain('<script src="/theme.js"></script>');
	}
});

test("the system decides by default, the choice is remembered and applied before paint", async ({
	page,
	request,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/fr");
	expect(await themeAttribute(page)).toBeNull();
	const darkGround = await ground(page);
	await page.emulateMedia({ colorScheme: "light" });
	const lightGround = await ground(page);
	expect(darkGround).not.toBe(lightGround);

	const theme = page.getByRole("radiogroup", { name: "Thème" });
	await expect(theme.getByRole("radio", { name: "Système" })).toBeChecked();
	await theme.getByText("Sombre").click();
	await expect(theme.getByRole("radio", { name: "Sombre" })).toBeChecked();
	expect(await themeAttribute(page)).toBe("dark");
	expect(await ground(page)).toBe(darkGround);

	// Another page, with the system still light: dark from the first paint, before hydration.
	await page.goto(PRACTITIONER, { waitUntil: "commit" });
	await page.waitForSelector("body");
	expect(await themeAttribute(page)).toBe("dark");
	await page.waitForLoadState("load");
	expect(await ground(page)).toBe(darkGround);
	await expect(page.getByRole("radio", { name: "Sombre" })).toBeChecked();

	// The choice never reaches the server: the page is the same cacheable HTML.
	const response = await request.get(PRACTITIONER);
	expect(response.headers()["cache-control"]).toBe(PUBLIC);

	await page.getByRole("radiogroup", { name: "Thème" }).getByText("Clair").click();
	expect(await themeAttribute(page)).toBe("light");
	await page.emulateMedia({ colorScheme: "dark" });
	expect(await ground(page)).toBe(lightGround);

	await page.getByRole("radiogroup", { name: "Thème" }).getByText("Système").click();
	expect(await themeAttribute(page)).toBeNull();
	expect(await ground(page)).toBe(darkGround);
	await page.reload();
	expect(await themeAttribute(page)).toBeNull();
});

test("the theme switch is a keyboard radio group", async ({ page }) => {
	await page.goto("/fr/a-propos");
	const system = page.getByRole("radio", { name: "Système" });
	await system.focus();
	await page.keyboard.press("ArrowLeft");
	await expect(page.getByRole("radio", { name: "Sombre" })).toBeChecked();
	await expect(page.getByRole("radio", { name: "Sombre" })).toBeFocused();
	expect(await themeAttribute(page)).toBe("dark");
	expect(await axeViolations(page)).toEqual([]);
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false, colorScheme: "dark" });

	test("the system's theme applies and the switch, which needs JavaScript, is hidden", async ({
		page,
	}) => {
		await page.goto("/fr");
		await expect(page.getByRole("radiogroup", { name: "Thème" })).toBeHidden();
		const darkGround = await ground(page);
		expect(darkGround).not.toBe("rgb(255, 255, 255)");
		// The language picker still opens and its links still work.
		const nav = page.getByRole("navigation", { name: "Langue" });
		await nav.locator("summary").click();
		await nav.getByRole("link", { name: "English" }).click();
		await expect(page).toHaveURL(/\/fr-en$/);
	});
});

test("the language picker opens from the keyboard, lists every language and closes on Escape", async ({
	page,
}) => {
	await page.goto(PRACTITIONER);
	const nav = page.getByRole("navigation", { name: "Langue" });
	const toggle = nav.locator("summary");
	// A native disclosure, named after the current language.
	await expect(toggle).toHaveAccessibleName("Langue : Français");
	await toggle.focus();
	await page.keyboard.press("ArrowDown");
	const french = nav.getByRole("link", { name: "Français" });
	await expect(french).toBeFocused();
	await expect(french).toHaveAttribute("aria-current", "true");
	await page.keyboard.press("ArrowDown");
	await expect(nav.getByRole("link", { name: "English" })).toBeFocused();
	await page.keyboard.press("End");
	await expect(nav.getByRole("link", { name: "Italiano" })).toBeFocused();
	expect(await axeViolations(page)).toEqual([]);
	await page.keyboard.press("Escape");
	await expect(toggle).toBeFocused();
	await expect(nav.getByRole("link", { name: "English" })).toBeHidden();

	// Enter on the toggle opens it natively; the English link leads to the same page in English.
	await page.keyboard.press("Enter");
	await nav.getByRole("link", { name: "English" }).click();
	await expect(page).toHaveURL(/\/fr-en\/practitioner\/camille-exemple-19999990013$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
