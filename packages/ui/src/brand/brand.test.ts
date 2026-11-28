import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandInks, paletteHex } from "../tokens";
import {
	BRAND_COLORS,
	BRAND_LOCKUP_WIDTH,
	BRAND_SYMBOL_SIZE,
	type BrandVariant,
	brandAppIconSvg,
	brandFaviconSvg,
	brandLockupSvg,
	brandLockupWidth,
	brandSymbolSvg,
} from "./geometry";

const repo = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const VARIANTS: BrandVariant[] = ["light", "dark", "mono"];

describe("the logo files", () => {
	it("are the builders' output, so no file drifts from the geometry", () => {
		for (const variant of VARIANTS) {
			expect(read(`docs/brand/apercura-symbol-${variant}.svg`), variant).toBe(
				brandSymbolSvg(variant),
			);
			expect(read(`docs/brand/apercura-lockup-${variant}.svg`), variant).toBe(
				brandLockupSvg(variant),
			);
		}
		expect(read("docs/brand/apercura-app-icon.svg")).toBe(brandAppIconSvg());
		expect(read("apps/web/src/app/icon.svg")).toBe(brandFaviconSvg());
	});

	it("print only the logo's two inks, the light accent being the theme's", () => {
		expect(BRAND_COLORS.light).toEqual(brandInks.light);
		expect(BRAND_COLORS.dark).toEqual(brandInks.dark);
		expect(brandInks.light.accent).toBe(paletteHex.stamp);
		expect(brandSymbolSvg("mono")).not.toMatch(/#[0-9a-f]{3,6}/i);
		const favicon = brandFaviconSvg();
		expect(favicon).toContain("prefers-color-scheme:dark");
		for (const color of [
			brandInks.light.ink,
			brandInks.light.accent,
			brandInks.dark.ink,
			brandInks.dark.accent,
		]) {
			expect(favicon).toContain(color);
		}
	});

	it("keep the lockup's proportions at every height", () => {
		expect(brandLockupWidth(BRAND_SYMBOL_SIZE)).toBe(BRAND_LOCKUP_WIDTH);
		expect(brandLockupWidth(24)).toBe(122.25);
		expect(brandLockupSvg("light")).toContain(`viewBox="0 0 ${BRAND_LOCKUP_WIDTH} 64"`);
	});

	it("keeps the app icon's symbol inside a maskable icon's safe zone", () => {
		// The safe zone is a centred circle of 40 % of the side; the symbol's farthest point is
		// its sharp corner, (60, 60) on the grid, scaled by 0.6 around the centre.
		expect(brandAppIconSvg()).toContain('transform="translate(12.8 12.8) scale(0.6)"');
		const corner = Math.hypot(60 - 32, 60 - 32) * 0.6;
		expect(corner / BRAND_SYMBOL_SIZE).toBeLessThan(0.4);
	});
});
