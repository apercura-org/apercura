import { oklchToHex } from "./color";

/**
 * Apercura design tokens.
 *
 * The palette follows the printed-form grammar of a health booklet: white paper,
 * one petrol-blue print ink, and a single violet stamp ink. `theme.css` declares
 * the same values as CSS custom properties; a unit test keeps both in sync.
 *
 * Palette laws:
 * - text is always `ink`, `inkMuted` or `coverInk` (never violet, never red body copy);
 * - `stamp*` is reserved for actions, verified pages and booked slots;
 * - `error*` is reserved for errors;
 * - nothing else is coloured.
 */
export const palette = {
	/** Page ground: pure white paper. */
	paper: "oklch(1 0 0)",
	/** Very light print tint for hovered rows, skeletons and sunk areas. */
	paperShade: "oklch(0.975 0.008 235)",
	/** The print ink: type, rules, field labels. */
	ink: "oklch(0.32 0.07 235)",
	/** Secondary text, hints and placeholders (still ≥ 4.5:1 on paper and shade). */
	inkMuted: "oklch(0.46 0.05 235)",
	/** Disabled controls (exempt from contrast, kept ≥ 3:1). */
	inkDisabled: "oklch(0.62 0.03 235)",
	/** Hairline rules and dotted leaders (decorative only). */
	ruleSoft: "oklch(0.84 0.025 235)",
	/** Input and control edges (≥ 3:1 on paper). */
	fieldEdge: "oklch(0.55 0.05 235)",
	/** Solid cover bands carrying whole regions. */
	cover: "oklch(0.32 0.07 235)",
	/** Type on cover bands. */
	coverInk: "oklch(1 0 0)",
	/** Secondary type on cover bands. */
	coverMuted: "oklch(0.87 0.03 235)",
	/** Rules printed on cover bands (decorative). */
	coverRule: "oklch(0.62 0.05 235)",
	/** The stamp ink: action, verified, booked. */
	stamp: "oklch(0.45 0.17 295)",
	/** Pressed or hovered stamp. */
	stampStrong: "oklch(0.38 0.16 295)",
	/** Stamp wash behind verified and booked marks. */
	stampTint: "oklch(0.96 0.03 295)",
	/** Error ink. */
	error: "oklch(0.5 0.19 27)",
	/** Error wash behind invalid fields. */
	errorTint: "oklch(0.97 0.02 27)",
} as const;

export type PaletteToken = keyof typeof palette;

/** The same palette as `#rrggbb`, for consumers that cannot parse OKLCH (map styles, OG images). */
export const paletteHex = Object.fromEntries(
	Object.entries(palette).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<PaletteToken, string>;

/**
 * Map tints, derived from the print ink so a map reads as part of the booklet:
 * paper land, pale ink water, white streets with ruled casings, ink labels.
 */
export const mapPalette = {
	land: palette.paper,
	landShade: "oklch(0.965 0.008 235)",
	park: "oklch(0.95 0.012 200)",
	water: "oklch(0.9 0.03 235)",
	building: "oklch(0.93 0.01 235)",
	road: palette.paper,
	roadCasing: "oklch(0.82 0.02 235)",
	roadMajorCasing: "oklch(0.7 0.035 235)",
	rail: "oklch(0.72 0.02 235)",
	boundary: palette.fieldEdge,
	label: palette.ink,
	labelMuted: palette.inkMuted,
	labelHalo: palette.paper,
} as const;

export const mapPaletteHex = Object.fromEntries(
	Object.entries(mapPalette).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<keyof typeof mapPalette, string>;

/** Font families. The app loads the faces; these names must match its `@font-face` rules. */
export const fonts = {
	/** Archivo (variable, wdth 62–125 %, wght 100–900): headers, labels, wordmark. */
	display: "Archivo Variable",
	/** Atkinson Hyperlegible Next (variable, wght 200–800): body copy and numerals. */
	body: "Atkinson Hyperlegible Next Variable",
} as const;

/** Type roles, in rem. Patient-facing body copy never goes below `body` (18 px). */
export const typeScale = {
	folio: 0.875,
	meta: 1,
	body: 1.125,
	lead: 1.375,
	title: 1.75,
} as const;

/** Minimum target size for any interactive element, in CSS pixels. */
export const minTargetSize = 44;

export { contrastRatio, oklchToHex, parseOklch, relativeLuminance } from "./color";
