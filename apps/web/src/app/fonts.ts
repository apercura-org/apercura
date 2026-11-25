import localFont from "next/font/local";

/*
 * Allo (SIL OFL 1.1, src/fonts/allo/OFL.txt), self-hosted: the files are vendored and served
 * from this origin, nothing is fetched elsewhere. Cut down by src/fonts/allo/build.sh to
 * weights 400–700, the latin and latin-ext subsets (Fontsource's unicode ranges, latin-ext
 * carries the names latin lacks: ł, ő, ș…). `font-display: swap`; the latin file is
 * preloaded, latin-ext loads only on a page that needs it. The metric-matched fallback is
 * declared in ./fonts.css. The families are read through `--font-allo` and
 * `--font-allo-ext` by the theme (packages/ui/src/styles/theme.css).
 */

export const alloLatin = localFont({
	src: "../fonts/allo/allo-latin.woff2",
	weight: "400 700",
	style: "normal",
	display: "swap",
	preload: true,
	variable: "--font-allo",
	adjustFontFallback: false,
	declarations: [
		{
			prop: "unicode-range",
			value:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
		},
	],
});

export const alloLatinExt = localFont({
	src: "../fonts/allo/allo-latin-ext.woff2",
	weight: "400 700",
	style: "normal",
	display: "swap",
	preload: false,
	variable: "--font-allo-ext",
	adjustFontFallback: false,
	declarations: [
		{
			prop: "unicode-range",
			value:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
		},
	],
});

/** Class names for `<html>`: they declare `--font-allo` and `--font-allo-ext`. */
export const fontVariables = `${alloLatin.variable} ${alloLatinExt.variable}`;
