import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	contrastRatio,
	mapPaletteDarkHex,
	oklchToHex,
	palette,
	paletteDark,
	paletteHex,
	parseOklch,
	themes,
} from "./index";

const themeCss = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8");
const kebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

describe("token sources", () => {
	it.each(Object.entries(themes))(
		"declares every %s token in theme.css with the same value",
		(name, values) => {
			for (const [token, value] of Object.entries(values)) {
				expect(themeCss).toContain(`--${name}-${kebab(token)}: ${value};`);
			}
		},
	);

	it("points every colour utility at the light value, and both dark switches at the dark one", () => {
		for (const token of Object.keys(palette).map(kebab)) {
			expect(themeCss).toContain(`--color-${token}: var(--light-${token});`);
			// Once for the system preference, once for the stored choice.
			const dark = themeCss.split(`--color-${token}: var(--dark-${token});`).length - 1;
			expect(dark).toBe(2);
		}
	});

	it("declares no raw colour in theme.css that the TS palettes lack", () => {
		for (const name of ["light", "dark"] as const) {
			const declared = [...themeCss.matchAll(new RegExp(`--${name}-([a-z-]+): oklch`, "g"))]
				.map((match) => match[1])
				.filter((token) => token !== "overlay-shadow");
			expect(declared.sort()).toEqual(Object.keys(palette).map(kebab).sort());
		}
	});

	it("derives hex values for consumers that cannot parse OKLCH", () => {
		expect(paletteHex.paper).toBe("#ffffff");
		expect(paletteHex.ink).toBe(oklchToHex(palette.ink));
		expect(Object.values(paletteHex).every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
		expect(Object.values(mapPaletteDarkHex).every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
	});
});

describe("colour maths", () => {
	it("parses oklch() with optional alpha and percentages", () => {
		expect(parseOklch("oklch(0.24 0.012 255)")).toEqual({ l: 0.24, c: 0.012, h: 255 });
		expect(parseOklch("oklch(50% 0.1 20 / 40%)")).toEqual({ l: 0.5, c: 0.1, h: 20, alpha: 0.4 });
		expect(() => parseOklch("#fff")).toThrow();
	});

	it("matches known sRGB reference points", () => {
		expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
		expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
		expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
	});
});

/**
 * Every foreground/background pair the UI uses, with its WCAG 2.2 minimum:
 * 4.5 for text, 3 for large text, control edges and focus indicators.
 */
const PAIRS: Array<[string, keyof typeof palette, keyof typeof palette, number]> = [
	["body text on paper", "ink", "paper", 4.5],
	[
		"body text on the quiet shade (openings, footer, title strips, hovered rows)",
		"ink",
		"paperShade",
		4.5,
	],
	["secondary text and placeholders on paper", "inkMuted", "paper", 4.5],
	["secondary text on the quiet shade", "inkMuted", "paperShade", 4.5],
	["field and control edges on paper", "fieldEdge", "paper", 3],
	["field and control edges on the quiet shade", "fieldEdge", "paperShade", 3],
	["accent button label on the accent", "paper", "stamp", 4.5],
	["accent button label on the pressed accent", "paper", "stampStrong", 4.5],
	["accent text on paper (verified marks)", "stamp", "paper", 4.5],
	["accent text on the quiet shade", "stamp", "paperShade", 4.5],
	["accent text on the accent wash (verified badge)", "stamp", "stampTint", 4.5],
	["ink text on the accent wash", "ink", "stampTint", 4.5],
	["focus ring (accent) on paper", "stamp", "paper", 3],
	["focus ring (accent) on the quiet shade", "stamp", "paperShade", 3],
	["focus ring (accent) on the accent wash", "stamp", "stampTint", 3],
	["error text on paper", "error", "paper", 4.5],
	["error text on error wash", "error", "errorTint", 4.5],
	["ink text on error wash", "ink", "errorTint", 4.5],
	["error edge on paper", "error", "paper", 3],
	["paper type on ink (selected date, tooltip, block, today)", "paper", "ink", 4.5],
	["secondary text on the accent wash", "inkMuted", "stampTint", 4.5],
	["disabled text stays perceivable on paper", "inkDisabled", "paper", 3],
	["disabled text stays perceivable on the quiet shade", "inkDisabled", "paperShade", 3],
];

/** Restraint (issues 52 and 103): neutral ink, one accent, no saturated grounds, in both themes. */
describe.each(Object.entries(themes))("restraint (%s)", (_name, values) => {
	const chroma = (token: keyof typeof palette) => parseOklch(values[token]).c;

	it("keeps every neutral near-achromatic", () => {
		for (const token of [
			"paperShade",
			"ink",
			"inkMuted",
			"inkDisabled",
			"ruleSoft",
			"fieldEdge",
		] as const) {
			expect(chroma(token)).toBeLessThanOrEqual(0.015);
		}
	});

	it("keeps the single accent and the error ink calm", () => {
		expect(chroma("stamp")).toBeLessThanOrEqual(0.13);
		expect(chroma("error")).toBeLessThanOrEqual(0.16);
	});
});

describe("light ground", () => {
	it("keeps paper pure white", () => {
		expect(paletteHex.paper).toBe("#ffffff");
	});
});

describe.each(Object.entries(themes))("contrast (%s theme)", (_name, values) => {
	it.each(PAIRS)("%s: %s on %s ≥ %s:1", (_label, foreground, background, minimum) => {
		expect(contrastRatio(values[foreground], values[background])).toBeGreaterThanOrEqual(minimum);
	});
});

describe("dark theme", () => {
	it("is a dark ground with light ink, not an inverted white page", () => {
		expect(parseOklch(paletteDark.paper).l).toBeLessThan(0.25);
		expect(parseOklch(paletteDark.ink).l).toBeGreaterThan(0.9);
	});
});
