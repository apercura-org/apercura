import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	composite,
	contrastRatio,
	mapPaletteDarkHex,
	mapPaletteHex,
	mixSrgb,
	oklchToHex,
	type PaletteToken,
	paletteDarkHex,
	paletteHex,
	parseColor,
	parseHex,
	parseOklch,
	relativeLuminance,
	toHex,
} from "./index";

const themeCss = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8");
const builtCss = readFileSync(new URL("../astryx/built/apercura.css", import.meta.url), "utf8");

/** The built theme's own variables: the first `:scope` block of its `astryx-theme` layer. */
const builtTokens = (() => {
	const layer = builtCss.slice(builtCss.indexOf("@layer astryx-theme"));
	const start = layer.indexOf(":scope {");
	const block = layer.slice(start, layer.indexOf("\n  }", start));
	const tokens = new Map<string, string>();
	for (const match of block.matchAll(/(--[\w-]+): ([^;]+);/g)) {
		tokens.set(match[1] as string, (match[2] as string).trim());
	}
	return tokens;
})();

/** The `@theme inline` block of theme.css: the Tailwind names and what they alias. */
const aliases = (() => {
	const start = themeCss.indexOf("@theme inline {");
	const block = themeCss.slice(start, themeCss.indexOf("\n}", start));
	const entries = new Map<string, string>();
	for (const match of block.matchAll(/^\t(--[\w-]+): ([^;]+);/gm)) {
		const [, name, value] = match as unknown as [string, string, string];
		if (value !== "initial") entries.set(name, value.trim());
	}
	return entries;
})();

const referenced = (value: string) => [...value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);

type Mode = 0 | 1;
const MODES = [
	["light", 0],
	["dark", 1],
] as const;

/** A built variable's value in a mode: one side of its `light-dark()`, or the plain value. */
function built(name: string, mode: Mode): string {
	const value = builtTokens.get(name);
	if (value === undefined) throw new Error(`The built theme defines no ${name}`);
	const pair = /^light-dark\(([^,]+),\s*([^)]+)\)$/.exec(value);
	if (pair) return (pair[mode + 1] as string).trim();
	const alias = /^var\((--[\w-]+)\)$/.exec(value);
	if (alias) return built(alias[1] as string, mode);
	return value;
}

/** A Tailwind colour (`paper`, `stamp-strong`…) in a mode, as theme.css computes it. */
function color(name: string, mode: Mode): string {
	const value = aliases.get(`--color-${name}`);
	if (value === undefined) throw new Error(`theme.css declares no --color-${name}`);
	const mix = /^color-mix\(in srgb, var\((--[\w-]+)\), var\((--[\w-]+)\) (\d+)%\)$/.exec(value);
	if (mix) {
		const [, first, second, weight] = mix as unknown as [string, string, string, string];
		return mixSrgb(built(first, mode), built(second, mode), Number(weight) / 100);
	}
	const alias = /^var\((--[\w-]+)\)$/.exec(value);
	if (!alias) throw new Error(`Unexpected alias for --color-${name}: ${value}`);
	return built(alias[1] as string, mode);
}

/** What the eye sees: a translucent colour flattened over the surface. */
const opaque = (name: string, mode: Mode, ground = color("paper", mode)) =>
	composite(color(name, mode), ground);

const kebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

describe("Tailwind names for the Astryx theme", () => {
	it("aliases every colour, corner, shadow and font to a variable the built theme defines", () => {
		expect(aliases.size).toBeGreaterThan(15);
		for (const [name, value] of aliases) {
			// The pill corner is geometry and the font features are Allo's, not theme values.
			if (name === "--radius-full" || name.endsWith("--font-feature-settings")) continue;
			const names = referenced(value);
			expect(names.length, `${name} names no Astryx variable`).toBeGreaterThan(0);
			for (const variable of names) {
				expect(builtTokens.has(variable as string), `${name} → ${variable}`).toBe(true);
			}
		}
	});

	it("names Astryx variables, not raw colours", () => {
		for (const [name, value] of aliases) {
			if (!name.startsWith("--color-")) continue;
			expect(value, name).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i);
		}
	});

	it("declares no second palette in theme.css", () => {
		expect(themeCss).not.toMatch(/--(light|dark)-[\w-]+:/);
		expect(themeCss).not.toMatch(/:\s*(#[0-9a-f]{3,8}|oklch\(|rgb\()/i);
	});

	it("loads the built theme on every page", () => {
		expect(themeCss).toContain('@import "../astryx/built/apercura.css";');
	});

	it("keeps the plain values for OG images, emails and the map equal to the built theme", () => {
		for (const [name, mode, values] of [
			["light", 0, paletteHex],
			["dark", 1, paletteDarkHex],
		] as const) {
			for (const token of Object.keys(values) as PaletteToken[]) {
				expect(values[token], `${name} ${token}`).toBe(opaque(kebab(token), mode));
			}
		}
	});
});

describe("colour maths", () => {
	it("parses oklch() with optional alpha and percentages", () => {
		expect(parseOklch("oklch(0.24 0.012 255)")).toEqual({ l: 0.24, c: 0.012, h: 255 });
		expect(parseOklch("oklch(50% 0.1 20 / 40%)")).toEqual({ l: 0.5, c: 0.1, h: 20, alpha: 0.4 });
		expect(() => parseOklch("#fff")).toThrow();
	});

	it("parses hex with optional alpha", () => {
		expect(parseHex("#fff")).toEqual({ r: 1, g: 1, b: 1, alpha: 1 });
		expect(parseHex("#00000080").alpha).toBeCloseTo(0.5, 2);
		expect(() => parseHex("#ggg")).toThrow();
		expect(toHex(parseColor("oklch(1 0 0)"))).toBe("#ffffff");
	});

	it("matches known sRGB reference points", () => {
		expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
		expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
		expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
		expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
	});

	it("flattens and mixes in sRGB", () => {
		expect(composite("#00000080", "#ffffff")).toBe("#7f7f7f");
		expect(mixSrgb("#000000", "#ffffff", 0.5)).toBe("#808080");
	});

	it("derives hex values for the map", () => {
		const all = [...Object.values(mapPaletteHex), ...Object.values(mapPaletteDarkHex)];
		expect(all.every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
	});
});

/**
 * Every foreground/background pair the UI uses, as Tailwind names, with its WCAG 2.2 minimum:
 * 4.5 for text, 3 for control edges and focus indicators. Disabled text is exempt (1.4.3) and
 * hairlines (`rule-soft`) are decorative: neither is listed.
 */
const PAIRS: Array<[string, string, string, number]> = [
	["body text on paper", "ink", "paper", 4.5],
	[
		"body text on the quiet shade (openings, footer, title strips, hovered rows)",
		"ink",
		"paper-shade",
		4.5,
	],
	["secondary text and placeholders on paper", "ink-muted", "paper", 4.5],
	["secondary text on the quiet shade", "ink-muted", "paper-shade", 4.5],
	["field and control edges on paper", "field-edge", "paper", 3],
	["field and control edges on the quiet shade", "field-edge", "paper-shade", 3],
	["accent button label on the accent", "paper", "stamp", 4.5],
	["accent button label on the hovered accent", "paper", "stamp-strong", 4.5],
	["accent text on paper (stamps, verified marks)", "stamp", "paper", 4.5],
	["accent text on the quiet shade", "stamp", "paper-shade", 4.5],
	["accent text on the accent wash (verified badge)", "stamp-ink", "stamp-tint", 4.5],
	["accent edge on the accent wash (verified badge)", "stamp", "stamp-tint", 3],
	["ink text on the accent wash (selection)", "ink", "stamp-tint", 4.5],
	["focus ring (accent) on paper", "stamp", "paper", 3],
	["focus ring (accent) on the quiet shade", "stamp", "paper-shade", 3],
	["error text on paper", "error", "paper", 4.5],
	["error text on the error wash", "error", "error-tint", 4.5],
	["ink text on the error wash", "ink", "error-tint", 4.5],
	["error edge on paper", "error", "paper", 3],
	["paper type on ink (selected date, block, today)", "paper", "ink", 4.5],
];

describe.each(MODES)("contrast (%s)", (_name, mode) => {
	it.each(PAIRS)("%s: %s on %s ≥ %s:1", (_label, foreground, background, minimum) => {
		const ground = opaque(background, mode);
		const ratio = contrastRatio(opaque(foreground, mode, ground), ground);
		expect(ratio).toBeGreaterThanOrEqual(minimum);
	});
});

describe("the two modes", () => {
	it("keeps a white surface in the light mode and a dark ground with light ink in the dark", () => {
		expect(color("paper", 0)).toBe("#ffffff");
		expect(relativeLuminance(color("paper", 1))).toBeLessThan(0.05);
		expect(relativeLuminance(color("ink", 1))).toBeGreaterThan(0.8);
	});
});
