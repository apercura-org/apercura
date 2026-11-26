import { oklchToHex } from "./color";

/**
 * Apercura design tokens.
 *
 * A health booklet's printed form: white paper (a deep graphite ground in the dark theme),
 * near-black type, fine neutral rules, and a single violet reserved for the practitioners' stamps
 * and the primary action. `theme.css` declares the same values
 * as CSS custom properties (`--light-*`, `--dark-*`); a unit test keeps both in sync.
 *
 * Palette laws:
 * - running text is `ink` or `inkMuted` (never red body copy); inside a stamp, the stamp's ink;
 * - `stamp*` (the violet ink) is reserved for stamps, actions, booked slots and focus;
 * - `error*` is reserved for errors;
 * - nothing else is coloured (the map excepted).
 */
export const palette = {
	/** Page ground: pure white. */
	paper: "oklch(1 0 0)",
	/** Quiet neutral surface: openings, the footer, title strips, hovered rows, skeletons. */
	paperShade: "oklch(0.977 0.003 260)",
	/** The ink, a cool graphite: type, strong rules, field labels. */
	ink: "oklch(0.23 0.014 260)",
	/** Secondary text, hints and placeholders (still ≥ 4.5:1 on paper and shade). */
	inkMuted: "oklch(0.47 0.014 260)",
	/** Disabled controls (exempt from contrast, kept ≥ 3:1). */
	inkDisabled: "oklch(0.6 0.01 260)",
	/** The printed form rules: hairlines between rows and fields (decorative only). */
	ruleSoft: "oklch(0.885 0.007 260)",
	/** Input and control edges (≥ 3:1 on paper and shade). */
	fieldEdge: "oklch(0.6 0.012 260)",
	/** The one accent, an indigo violet: action, verified, booked, the focus ring. (Token name kept from v1.) */
	stamp: "oklch(0.47 0.13 285)",
	/** Hovered or pressed accent. */
	stampStrong: "oklch(0.4 0.12 285)",
	/** Accent wash behind verified and booked marks. */
	stampTint: "oklch(0.965 0.016 285)",
	/** Error ink. */
	error: "oklch(0.52 0.16 25)",
	/** Error wash behind invalid fields. */
	errorTint: "oklch(0.97 0.013 25)",
} as const;

/**
 * The dark theme: the same roles on a dark graphite ground. The accent turns light, so the
 * label on an accent button (`paper`) is dark. Same contrast floors as the light theme.
 */
export const paletteDark = {
	paper: "oklch(0.2 0.01 260)",
	paperShade: "oklch(0.235 0.011 260)",
	ink: "oklch(0.95 0.005 260)",
	inkMuted: "oklch(0.77 0.012 260)",
	inkDisabled: "oklch(0.59 0.01 260)",
	ruleSoft: "oklch(0.34 0.013 262)",
	fieldEdge: "oklch(0.6 0.012 260)",
	stamp: "oklch(0.78 0.1 285)",
	stampStrong: "oklch(0.85 0.075 285)",
	stampTint: "oklch(0.28 0.04 285)",
	error: "oklch(0.74 0.14 25)",
	errorTint: "oklch(0.27 0.045 25)",
} as const satisfies Record<keyof typeof palette, string>;

export type PaletteToken = keyof typeof palette;

/** The two themes by name. */
export const themes = { light: palette, dark: paletteDark } as const;
export type ThemeName = keyof typeof themes;

/** The same palette as `#rrggbb`, for consumers that cannot parse OKLCH (map styles, OG images). */
export const paletteHex = Object.fromEntries(
	Object.entries(palette).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<PaletteToken, string>;

/** The dark theme as `#rrggbb` (the dark browser theme colour, the dark map). */
export const paletteDarkHex = Object.fromEntries(
	Object.entries(paletteDark).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<PaletteToken, string>;

/**
 * Map tints, derived from the neutral palette so a map reads as part of the page: white
 * land, grey streets, muted water and parks, graphite labels.
 */
export const mapPalette = {
	land: palette.paper,
	landShade: "oklch(0.97 0.003 260)",
	park: "oklch(0.95 0.012 165)",
	water: "oklch(0.9 0.02 240)",
	building: "oklch(0.93 0.004 260)",
	road: "oklch(0.9 0.004 260)",
	roadCasing: "oklch(0.86 0.005 260)",
	roadMajorCasing: "oklch(0.76 0.006 260)",
	rail: "oklch(0.76 0.006 260)",
	boundary: palette.fieldEdge,
	label: palette.ink,
	labelMuted: palette.inkMuted,
	labelHalo: palette.paper,
} as const;

/** The same map on the dark ground: graphite land, slightly lighter streets, light labels. */
export const mapPaletteDark = {
	land: paletteDark.paper,
	landShade: "oklch(0.225 0.01 260)",
	park: "oklch(0.26 0.025 165)",
	water: "oklch(0.3 0.035 240)",
	building: "oklch(0.25 0.008 260)",
	road: "oklch(0.31 0.008 260)",
	roadCasing: "oklch(0.27 0.008 260)",
	roadMajorCasing: "oklch(0.4 0.01 260)",
	rail: "oklch(0.4 0.01 260)",
	boundary: paletteDark.fieldEdge,
	label: paletteDark.ink,
	labelMuted: paletteDark.inkMuted,
	labelHalo: paletteDark.paper,
} as const satisfies Record<keyof typeof mapPalette, string>;

export const mapPaletteHex = Object.fromEntries(
	Object.entries(mapPalette).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<keyof typeof mapPalette, string>;

export const mapPaletteDarkHex = Object.fromEntries(
	Object.entries(mapPaletteDark).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<keyof typeof mapPalette, string>;

/** Font families. The app loads the faces; these names must match its `@font-face` rules. */
export const fonts = {
	/** Allo (variable, wght 400–700, SIL OFL 1.1): headings, labels, the wordmark. */
	display: "Allo",
	/** Allo again, with the tailed l and serifed I (cv03, cv04): body copy and numerals. */
	body: "Allo",
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
