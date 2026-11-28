import { parseColor, toHex } from "./color";

/**
 * Colour values for what cannot read the page's CSS variables.
 *
 * The interface's colours are defined once, in the Astryx theme (`../astryx/apercura.ts`); the
 * page paints from its built variables. What draws outside the page needs plain values: Open
 * Graph images, emails, the browser's `theme-color`, the map's style, the logo files. This module
 * holds them, as `#rrggbb`. `tokens.test.ts` checks that every UI value below is the built
 * theme's, light and dark (a translucent one flattened over the surface), so the two cannot
 * drift; rebuild the theme and update them together.
 *
 * Palette laws:
 * - running text is `ink` or `inkMuted` (never red body copy); inside a stamp, the stamp's ink;
 * - `stamp*` (the violet accent) is reserved for stamps, actions, booked slots and focus;
 * - `error*` is reserved for errors;
 * - nothing else is coloured (the map excepted).
 */
export const paletteHex = {
	/** The surface (`--color-background-surface`): white. */
	paper: "#ffffff",
	/** The quiet muted ground (`--color-background-muted`). */
	paperShade: "#f0f1f2",
	/** Type (`--color-text-primary`). */
	ink: "#000000",
	/** Secondary text, hints and placeholders (`--color-text-secondary`). */
	inkMuted: "#444850",
	/** Disabled controls (`--color-text-disabled`). */
	inkDisabled: "#8e929c",
	/** Hairlines (`--color-border`, translucent, flattened over the surface). */
	ruleSoft: "#ebebeb",
	/** Field and control edges (`--color-border-emphasized`). */
	fieldEdge: "#82868e",
	/** The accent (`--color-accent`). */
	stamp: "#554da0",
	/** The hovered accent (`stamp-strong` in theme.css: 15 % of the ink mixed in). */
	stampStrong: "#484188",
	/** The accent wash (`--color-accent-muted`). */
	stampTint: "#d2d3e5",
	/** Error ink (`--color-text-error`). */
	error: "#a4292b",
	/** Error wash (`--color-error-muted`, flattened over the surface). */
	errorTint: "#eacdca",
} as const;

export type PaletteToken = keyof typeof paletteHex;

/** The same roles in the dark mode (the dark browser theme colour, the dark map). */
export const paletteDarkHex = {
	paper: "#24262a",
	paperShade: "#1a1c1f",
	ink: "#ffffff",
	inkMuted: "#9a9ea7",
	inkDisabled: "#51545d",
	ruleSoft: "#3a3c40",
	fieldEdge: "#70757c",
	stamp: "#a39ff8",
	stampStrong: "#b1adf9",
	stampTint: "#423887",
	error: "#f2b5af",
	errorTint: "#584142",
} as const satisfies Record<PaletteToken, string>;

/**
 * The logo's two inks, per theme. The logo files are fixed artwork (`docs/brand`, the favicon),
 * so they keep their own graphite rather than following the interface's text colour; the light
 * accent is the theme's accent seed.
 */
export const brandInks = {
	light: { ink: "#191d24", accent: "#554da0" },
	dark: { ink: "#eceff2", accent: "#b0aff5" },
} as const;

/**
 * Map tints, on the page's grounds so a map reads as part of the page: the surface for land,
 * grey streets, muted water and parks, the page's ink for labels.
 */
export const mapPalette = {
	land: paletteHex.paper,
	landShade: "oklch(0.97 0.003 260)",
	park: "oklch(0.95 0.012 165)",
	water: "oklch(0.9 0.02 240)",
	building: "oklch(0.93 0.004 260)",
	road: "oklch(0.9 0.004 260)",
	roadCasing: "oklch(0.86 0.005 260)",
	roadMajorCasing: "oklch(0.76 0.006 260)",
	rail: "oklch(0.76 0.006 260)",
	boundary: paletteHex.fieldEdge,
	label: paletteHex.ink,
	labelMuted: paletteHex.inkMuted,
	labelHalo: paletteHex.paper,
} as const;

/** The same map on the dark surface: graphite land, slightly lighter streets, light labels. */
export const mapPaletteDark = {
	land: paletteDarkHex.paper,
	landShade: "oklch(0.25 0.008 260)",
	park: "oklch(0.3 0.025 165)",
	water: "oklch(0.33 0.035 240)",
	building: "oklch(0.3 0.008 260)",
	road: "oklch(0.36 0.008 260)",
	roadCasing: "oklch(0.31 0.008 260)",
	roadMajorCasing: "oklch(0.45 0.01 260)",
	rail: "oklch(0.45 0.01 260)",
	boundary: paletteDarkHex.fieldEdge,
	label: paletteDarkHex.ink,
	labelMuted: paletteDarkHex.inkMuted,
	labelHalo: paletteDarkHex.paper,
} as const satisfies Record<keyof typeof mapPalette, string>;

const hex = (value: string) => toHex(parseColor(value));

/** The map tints as `#rrggbb`, for MapLibre's style. */
export const mapPaletteHex = Object.fromEntries(
	Object.entries(mapPalette).map(([name, value]) => [name, hex(value)]),
) as Record<keyof typeof mapPalette, string>;

export const mapPaletteDarkHex = Object.fromEntries(
	Object.entries(mapPaletteDark).map(([name, value]) => [name, hex(value)]),
) as Record<keyof typeof mapPalette, string>;

export {
	composite,
	contrastRatio,
	mixSrgb,
	oklchToHex,
	parseColor,
	parseHex,
	parseOklch,
	relativeLuminance,
	toHex,
} from "./color";
