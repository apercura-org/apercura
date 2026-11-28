/**
 * The Apercura theme for Astryx, and the one source of the interface's colour, radius, type and
 * motion. Build it with `bun run --cwd packages/ui theme:build`, which writes `apercura.css` and
 * `apercura.js` beside this file; `theme:check` fails when they are stale.
 *
 * Astryx's Neutral theme draws the interface: its grey page body under white surfaces and cards,
 * its borders, its elevation scale, its corners and its control states. Apercura adds only its
 * brand on top: the violet accent, the Allo typeface, 18 px body text, 44 px targets and the 3 px
 * accent focus ring. The colours come from Astryx's palette generator, seeded with the brand's
 * three inks; the recipe is pinned so an upgrade cannot shift a shade.
 *
 * Every colour compiles to `light-dark()`: the page's `color-scheme` picks the side, and
 * `theme.css` sets it from the visitor's choice (`data-theme`) or the system. The Tailwind
 * utilities the app writes (`bg-paper`, `text-ink`, `border-field-edge`…) are aliases of these
 * variables, declared in `theme.css`; `tokens.test.ts` checks the aliases and the contrast pairs
 * against the built output.
 */
import { themePalette } from "@astryxdesign/core/palette";
import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

const family =
	'var(--font-allo, "Allo"), var(--font-allo-ext, "Allo"), "Allo Fallback", ui-sans-serif, system-ui, sans-serif';
const fallbacks = '"Allo Fallback", ui-sans-serif, system-ui, sans-serif';

const generated = themePalette({
	// The practitioner's stamp: action, verified, booked, focus.
	accent: "#554da0",
	// A cool graphite (hue ~260, low chroma) for grounds, text and rules.
	neutral: "#6b6f78",
	// Red is for errors only.
	danger: "#b33736",
	recipe: "astryx-oklch-v2",
});

/**
 * The palette also lifts secondary text, in the dark mode, on the tinted parts of a few
 * components. Each lift compiles to a long run of per-mode selectors (about 20 KB a component),
 * and the built theme loads on every page: only the components the app renders keep theirs (the
 * selected row of a menu or a select).
 */
const usedComponents = new Set(["item"]);
const palette = {
	...generated,
	components: Object.fromEntries(
		Object.entries(generated.components ?? {}).filter(([name]) => usedComponents.has(name)),
	),
} as typeof generated;

export const colorModes = ["light", "dark"] as const;

export const apercuraTheme = defineTheme({
	name: "apercura",
	extends: neutralTheme,
	palette,
	// 18 px body text, the floor on patient surfaces; headings step up by 1.2.
	typography: {
		scale: { base: 18, ratio: 1.2 },
		body: { family: "Allo", fallbacks },
		heading: { family: "Allo", fallbacks },
	},
	// Calm motion: 150 ms colour transitions, 180 ms overlays.
	motion: { fast: 150, medium: 180, slow: 240, ratio: 0.75 },
	tokens: {
		"--font-family-body": family,
		"--font-family-heading": family,

		/*
		 * Field and control edges, where the edge is the control's only boundary: lifted from the
		 * generated `#d2d4d8` / `#51545d` (1.5:1 and 2:1 on the surface) to 3:1 on the surface and
		 * on the muted ground, in both modes (WCAG 2.2, 1.4.11).
		 */
		"--color-border-emphasized": ["#82868e", "#70757c"],

		// Every target at least 44 px; the search row's fields are 52 px.
		"--size-element-sm": "44px",
		"--size-element-md": "44px",
		"--size-element-lg": "52px",

		// The focus ring: a 3 px accent outline, 2 px off the element (a surface may re-colour it).
		"--focus-outline-width": "3px",
		"--focus-outline-offset": "2px",
		"--focus-outline-color": "var(--focus-ring, var(--color-accent))",
	},
});
