import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

type MapCatalog = { Map: Record<string, string> };

const catalog = (locale: string): MapCatalog =>
	JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

/*
 * MapLibre prints its own interface strings (the "Ctrl + scroll" hint, control
 * titles, accessible names): they come from the page's catalog, not MapLibre's
 * English defaults. The hospital of the SYNTHETIC fixtures is located by
 * FINESS+, so its practitioner page shows a map.
 */
const SLUG = "fanny-placebo-19999990088";

/** An empty style, so the map loads without the tile server. */
async function stubMapStyle(page: Page) {
	await page.route(/\/styles\//, (route) =>
		route.fulfill({
			json: {
				version: 8,
				sources: {},
				layers: [
					{ id: "background", type: "background", paint: { "background-color": "#eeeeee" } },
				],
			},
		}),
	);
}

for (const { locale, path } of [
	{ locale: "fr", path: `/praticien/${SLUG}` },
	{ locale: "de", path: `/de/behandler/${SLUG}` },
]) {
	test(`the map speaks ${locale}`, async ({ page }) => {
		const strings = catalog(locale).Map;
		await stubMapStyle(page);
		await page.goto(path);
		const map = page.locator(".apercura-map").first();
		await map.scrollIntoViewIfNeeded();
		await expect(map).toHaveAttribute("data-status", "ready");

		const hint = map.locator(".maplibregl-cooperative-gesture-screen");
		const desktop = await hint.locator(".maplibregl-desktop-message").textContent();
		expect([strings.scrollZoomWindows, strings.scrollZoomMac]).toContain(desktop);
		await expect(hint.locator(".maplibregl-mobile-message")).toHaveText(
			strings.twoFingers as string,
		);
		await expect(map.getByRole("button", { name: strings.zoomIn, exact: true })).toBeVisible();
		await expect(map.getByRole("button", { name: strings.zoomOut, exact: true })).toBeVisible();
		await expect(map.locator(".maplibregl-ctrl-attrib-button")).toHaveAttribute(
			"title",
			strings.toggleAttribution as string,
		);
		await expect(map.locator("canvas")).toHaveAttribute("aria-label", strings.map as string);
		// None of MapLibre's English defaults is left.
		await expect(map).not.toContainText("to zoom the map");
	});
}
