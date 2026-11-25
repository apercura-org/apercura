import { expect, type Page, test } from "@playwright/test";

/*
 * Keyboard focus stays visible on buttons of every intent, on paper and on the quiet shade:
 * reached with real Tab presses, the focused button prints a solid outline of at least 2 px.
 */

async function tabTo(page: Page, name: string) {
	for (let step = 0; step < 60; step++) {
		await page.keyboard.press("Tab");
		const focused = await page.evaluate(() => {
			const element = document.activeElement;
			return element instanceof HTMLButtonElement ? (element.textContent ?? "").trim() : "";
		});
		if (focused === name) return;
	}
	throw new Error(`Tab never reached the "${name}" button`);
}

async function focusOutline(page: Page) {
	return page.evaluate(() => {
		const element = document.activeElement as HTMLElement;
		const style = getComputedStyle(element);
		return {
			focusVisible: element.matches(":focus-visible"),
			style: style.outlineStyle,
			width: Number.parseFloat(style.outlineWidth),
		};
	});
}

const CASES = [
	{ surface: "quiet shade, stamp", path: "/fr", name: "Chercher" },
	{ surface: "quiet shade, ink", path: "/fr", name: "Autour de moi" },
	{ surface: "paper, stamp", path: "/fr/pro/connexion", name: "Se connecter" },
	{ surface: "paper, ink", path: "/fr/pro/connexion", name: "Se connecter avec une clé d’accès" },
] as const;

for (const { surface, path, name } of CASES) {
	test(`a Tab-focused button shows its focus ring (${surface})`, async ({ page }) => {
		await page.goto(path);
		await page.waitForLoadState("networkidle");
		await tabTo(page, name);
		const outline = await focusOutline(page);
		expect(outline.focusVisible).toBe(true);
		expect(outline.style).toBe("solid");
		expect(outline.width).toBeGreaterThanOrEqual(2);
	});
}
