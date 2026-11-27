/**
 * The Apercura theme for Astryx: the booklet's tokens (`../tokens`) mapped onto Astryx's roles,
 * on top of Astryx's Neutral theme. Build it with `bun run --cwd packages/ui theme:build`, which
 * writes `apercura.css` and `apercura.js` beside this file; `theme:check` fails when they are
 * stale.
 *
 * Every colour is a `[light, dark]` pair, compiled to `light-dark()`: the page's `color-scheme`
 * picks the side, and `theme.css` sets it from the visitor's choice (`data-theme`) or the system,
 * as it does for the Tailwind tokens. The pairs come from `palette` and `paletteDark`, so the two
 * systems cannot drift.
 */
import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { paletteDark as dark, palette as light, radii } from "../tokens";

type Role = keyof typeof light;
const pair = (role: Role): [string, string] => [light[role], dark[role]];

/** The modal scrim: a fixed graphite at 45 %, the same in both themes. */
const scrim = "oklch(0.23 0.014 260 / 0.45)";
/** The one overlay shadow (`--shadow-overlay` in theme.css). */
const overlayShadow =
	"0 12px 32px -12px light-dark(oklch(0.23 0.03 260 / 0.16), oklch(0 0 0 / 0.5)), 0 2px 6px -2px light-dark(oklch(0.23 0.03 260 / 0.16), oklch(0 0 0 / 0.5))";
const family =
	'var(--font-allo, "Allo"), var(--font-allo-ext, "Allo"), "Allo Fallback", ui-sans-serif, system-ui, sans-serif';

// Astryx's own roles, as the component overrides below write them.
const ink = "var(--color-text-primary)";
const inkMuted = "var(--color-text-secondary)";
const inkDisabled = "var(--color-text-disabled)";
const paper = "var(--color-background-surface)";
const rule = "var(--color-border)";
const body = "1.125rem";

export const colorModes = ["light", "dark"] as const;

export const apercuraTheme = defineTheme({
	name: "apercura",
	extends: neutralTheme,
	// 18 px body text, the floor on patient surfaces; headings step up by 1.2.
	typography: {
		scale: { base: 18, ratio: 1.2 },
		body: { family: "Allo", fallbacks: '"Allo Fallback", ui-sans-serif, system-ui, sans-serif' },
		heading: {
			family: "Allo",
			fallbacks: '"Allo Fallback", ui-sans-serif, system-ui, sans-serif',
		},
	},
	// Calm motion: 150 ms colour transitions, 180 ms overlays.
	motion: { fast: 150, medium: 180, slow: 240, ratio: 0.75 },
	tokens: {
		"--font-family-body": family,
		"--font-family-heading": family,

		// Grounds: white paper (deep graphite in dark), the quiet shade for muted regions.
		"--color-background-surface": pair("paper"),
		"--color-background-body": pair("paper"),
		"--color-background-card": pair("paper"),
		"--color-background-popover": pair("paper"),
		"--color-background-muted": pair("paperShade"),

		// The one accent: action, verified, booked, focus.
		"--color-accent": pair("stamp"),
		"--color-accent-muted": pair("stampTint"),
		"--color-text-accent": pair("stamp"),
		"--color-icon-accent": pair("stamp"),
		"--color-on-accent": pair("paper"),

		// Ink.
		"--color-text-primary": pair("ink"),
		"--color-text-secondary": pair("inkMuted"),
		"--color-text-disabled": pair("inkDisabled"),
		"--color-icon-primary": pair("ink"),
		"--color-icon-secondary": pair("inkMuted"),
		"--color-icon-disabled": pair("inkDisabled"),

		// Rules: hairlines between rows, the control edge around fields and outline buttons.
		"--color-border": pair("ruleSoft"),
		"--color-border-emphasized": pair("fieldEdge"),

		// Red is for errors only.
		"--color-error": pair("error"),
		"--color-error-muted": pair("errorTint"),
		"--color-text-error": pair("error"),
		"--color-on-error": pair("paper"),
		"--color-on-error-muted": pair("error"),

		"--color-overlay": scrim,
		"--color-skeleton": pair("paperShade"),

		// One scale of soft corners: 6 px marks, 10 px controls, 14 px panels.
		"--radius-inner": `${radii.mark}px`,
		"--radius-element": `${radii.field}px`,
		"--radius-container": `${radii.panel}px`,
		"--radius-page": `${radii.panel}px`,

		// One shadow, for what floats.
		"--shadow-low": overlayShadow,
		"--shadow-med": overlayShadow,
		"--shadow-high": overlayShadow,

		// Every target at least 44 px; the search row's fields are 52 px.
		"--size-element-sm": "44px",
		"--size-element-md": "44px",
		"--size-element-lg": "52px",

		// The focus ring: a 3 px accent outline, 2 px off the element.
		"--focus-outline-width": "3px",
		"--focus-outline-offset": "2px",
		"--focus-outline-color": "var(--focus-ring, var(--color-accent))",
	},
	// The booklet's controls. Ink, not the accent, marks a choice that is not a booking: a ticked
	// box, a chosen radio, a switch that is on, the selected tab.
	components: {
		"checkbox-input": { base: { gap: "12px", minHeight: "44px", alignItems: "center" } },
		"checkbox-indicator": {
			base: {
				width: "24px",
				height: "24px",
				borderWidth: "2px",
				borderStyle: "solid",
				borderColor: ink,
				borderRadius: `${radii.mark}px`,
				backgroundColor: paper,
				color: paper,
			},
			checked: { backgroundColor: ink, borderColor: ink, color: paper },
			disabled: { borderColor: inkDisabled },
		},
		"checkbox-label": { base: { fontSize: body, fontWeight: "400", color: ink } },
		"radio-list": { base: { gap: "0px" } },
		"radio-list-item": { base: { minHeight: "44px", gap: "12px" } },
		"radio-indicator": {
			base: {
				width: "24px",
				height: "24px",
				borderWidth: "2px",
				borderStyle: "solid",
				borderColor: ink,
				backgroundColor: paper,
			},
			checked: { borderColor: ink, backgroundColor: paper },
			disabled: { borderColor: inkDisabled },
		},
		"radio-indicator-dot": { base: { width: "12px", height: "12px", backgroundColor: ink } },
		switch: {
			base: {
				width: "48px",
				height: "28px",
				borderWidth: "2px",
				borderStyle: "solid",
				borderColor: ink,
				backgroundColor: paper,
			},
			checked: { backgroundColor: ink, borderColor: ink },
			disabled: { borderColor: inkDisabled },
		},
		"switch-thumb": {
			base: { width: "20px", height: "20px", backgroundColor: ink },
			checked: { backgroundColor: paper },
		},
		"switch-field": { base: { minHeight: "44px", gap: "12px", alignItems: "center" } },
		"switch-label": { base: { fontSize: body, fontWeight: "400", color: ink } },
		tab: {
			base: {
				minHeight: "44px",
				paddingInline: "16px",
				fontSize: "1rem",
				fontWeight: "500",
				color: inkMuted,
			},
			selected: { color: ink, fontWeight: "600" },
		},
		"tab-indicator": { base: { height: "2px", backgroundColor: ink } },
		tooltip: {
			base: {
				backgroundColor: ink,
				color: paper,
				borderRadius: `${radii.field}px`,
				paddingBlock: "6px",
				paddingInline: "12px",
				fontSize: "1rem",
			},
		},
		popover: {
			base: {
				borderRadius: `${radii.panel}px`,
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: rule,
				backgroundColor: paper,
			},
		},
	},
});
