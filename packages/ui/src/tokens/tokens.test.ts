import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, oklchToHex, palette, paletteHex, parseOklch } from "./index";

const themeCss = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8");
const kebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

describe("token sources", () => {
	it("declares every TS palette token in theme.css with the same value", () => {
		for (const [name, value] of Object.entries(palette)) {
			expect(themeCss).toContain(`--color-${kebab(name)}: ${value};`);
		}
	});

	it("declares no colour in theme.css that the TS palette lacks", () => {
		const declared = [...themeCss.matchAll(/--color-([a-z-]+): oklch/g)].map((match) => match[1]);
		expect(declared.sort()).toEqual(Object.keys(palette).map(kebab).sort());
	});

	it("derives hex values for consumers that cannot parse OKLCH", () => {
		expect(paletteHex.paper).toBe("#ffffff");
		expect(paletteHex.ink).toBe(oklchToHex(palette.ink));
		expect(Object.values(paletteHex).every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
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
	["stamp label on stamp", "paper", "stamp", 4.5],
	["stamp label on pressed stamp", "paper", "stampStrong", 4.5],
	["stamp ink text on paper (verified marks)", "stamp", "paper", 4.5],
	["stamp ink text on the quiet shade", "stamp", "paperShade", 4.5],
	["stamp text on stamp wash (verified badge)", "stamp", "stampTint", 4.5],
	["ink text on stamp wash", "ink", "stampTint", 4.5],
	["focus ring (violet) on paper", "stamp", "paper", 3],
	["focus ring (violet) on the quiet shade", "stamp", "paperShade", 3],
	["focus ring (violet) on stamp wash", "stamp", "stampTint", 3],
	["error text on paper", "error", "paper", 4.5],
	["error text on error wash", "error", "errorTint", 4.5],
	["ink text on error wash", "ink", "errorTint", 4.5],
	["error edge on paper", "error", "paper", 3],
	["white type on ink (selected date, tooltip, block, today)", "paper", "ink", 4.5],
	["disabled text stays perceivable on paper", "inkDisabled", "paper", 3],
	["disabled text stays perceivable on the quiet shade", "inkDisabled", "paperShade", 3],
];

/** The quieter palette (issue 52): neutral ink, one muted accent, no saturated grounds. */
describe("restraint", () => {
	const chroma = (token: keyof typeof palette) => parseOklch(palette[token]).c;

	it("keeps paper pure white and every neutral near-achromatic", () => {
		expect(paletteHex.paper).toBe("#ffffff");
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

	it("keeps the single accent and the error ink muted", () => {
		expect(chroma("stamp")).toBeLessThanOrEqual(0.1);
		expect(chroma("error")).toBeLessThanOrEqual(0.16);
	});
});

describe("contrast", () => {
	it.each(PAIRS)("%s: %s on %s ≥ %s:1", (_label, foreground, background, minimum) => {
		expect(contrastRatio(palette[foreground], palette[background])).toBeGreaterThanOrEqual(minimum);
	});
});
