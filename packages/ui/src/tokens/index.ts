import { oklchToHex } from "./color";

/**
 * Apercura design tokens.
 *
 * The palette follows the printed-form grammar of a health booklet, set in a
 * quiet, near-neutral print: white paper, a pale neutral shade for secondary
 * areas, one cool graphite ink, and a single muted violet stamp. `theme.css`
 * declares the same values as CSS custom properties; a unit test keeps both in sync.
 *
 * Palette laws:
 * - text is always `ink` or `inkMuted` (never violet, never red body copy);
 * - `stamp*` is reserved for actions, verified pages and booked slots;
 * - `error*` is reserved for errors;
 * - nothing else is coloured (the map excepted).
 */
export const palette = {
	/** Page ground: pure white paper. */
	paper: "oklch(1 0 0)",
	/** Quiet neutral surface: openings, the footer, dialog title strips, hovered rows, skeletons. */
	paperShade: "oklch(0.975 0.003 255)",
	/** The print ink, a cool graphite: type, strong rules, field labels. */
	ink: "oklch(0.24 0.012 255)",
	/** Secondary text, hints and placeholders (still ≥ 4.5:1 on paper and shade). */
	inkMuted: "oklch(0.46 0.012 255)",
	/** Disabled controls (exempt from contrast, kept ≥ 3:1). */
	inkDisabled: "oklch(0.6 0.008 255)",
	/** Hairline rules and dotted leaders (decorative only). */
	ruleSoft: "oklch(0.88 0.006 255)",
	/** Input and control edges (≥ 3:1 on paper and shade). */
	fieldEdge: "oklch(0.56 0.01 255)",
	/** The stamp ink: action, verified, booked. */
	stamp: "oklch(0.42 0.09 290)",
	/** Pressed or hovered stamp. */
	stampStrong: "oklch(0.35 0.08 290)",
	/** Stamp wash behind verified and booked marks. */
	stampTint: "oklch(0.965 0.014 290)",
	/** Error ink. */
	error: "oklch(0.5 0.15 25)",
	/** Error wash behind invalid fields. */
	errorTint: "oklch(0.97 0.012 25)",
} as const;

export type PaletteToken = keyof typeof palette;

/** The same palette as `#rrggbb`, for consumers that cannot parse OKLCH (map styles, OG images). */
export const paletteHex = Object.fromEntries(
	Object.entries(palette).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<PaletteToken, string>;

/**
 * Map tints, derived from the neutral print so a map reads as part of the
 * booklet: white land, grey streets, muted water and parks, graphite labels.
 */
export const mapPalette = {
	land: palette.paper,
	landShade: "oklch(0.97 0.003 255)",
	park: "oklch(0.95 0.012 165)",
	water: "oklch(0.9 0.02 240)",
	building: "oklch(0.93 0.004 255)",
	road: "oklch(0.9 0.004 255)",
	roadCasing: "oklch(0.86 0.005 255)",
	roadMajorCasing: "oklch(0.76 0.006 255)",
	rail: "oklch(0.76 0.006 255)",
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
	lead: 1.25,
	title: 1.5,
} as const;

/** Minimum target size for any interactive element, in CSS pixels. */
export const minTargetSize = 44;

export { contrastRatio, oklchToHex, parseOklch, relativeLuminance } from "./color";
