import { brandInks, paletteHex } from "../tokens";

/*
 * Apercura's logo, direction "Pin a": a round tile with one sharp corner (a map pin tipped onto
 * its point, and a geometric single-storey a), its counter a window holding the point of care.
 * The wordmark is Allo (ROND 25, opsz 32, wght 650, -0.02 em) outlined, its x-height centred on
 * the symbol. One 64-unit grid: 4 units are 1 px at the 16 px minimum size.
 *
 * Every rendering reads these constants: the header (`BrandSymbol`, `BrandLockup`), the site
 * icons, the Open Graph images, and the standalone files of docs/brand and apps/web/src/app/icon.svg
 * (`brand.test.ts` keeps those files equal to the builders below).
 */

/** The symbol's side, in grid units. */
export const BRAND_SYMBOL_SIZE = 64;

/** The lockup's width on the same 64-unit height. */
export const BRAND_LOCKUP_WIDTH = 326;

/** The wordmark's type size on the grid: its outlines are Allo set at 66 units. */
export const BRAND_WORDMARK_SIZE = 66;

/** The tile: one sharp corner and the round counter (even-odd). */
export const BRAND_SYMBOL_PATH =
	"M60 34V56a4 4 0 0 1-4 4H32A28 28 0 1 1 60 32ZM32 19a13 13 0 1 0 0 26a13 13 0 1 0 0-26Z";

/** The point of care, in the accent, centred in the counter. */
export const BRAND_SYMBOL_DOT = { cx: 32, cy: 32, r: 6 } as const;

/** "apercura" in Allo, outlined on the lockup's grid (x from 80, baseline about 49). */
export const BRAND_WORDMARK_PATH =
	"m101.31 45.82q-.76 1.19-2.13 1.93-1.37.74-3.29 1.09-1.92.34-4.31.34-3.28 0-5.91-1.21-2.62-1.2-4.14-3.44-1.53-2.23-1.53-5.32 0-3.24 1.79-5.39 1.8-2.15 4.8-3.34 3-1.19 6.55-1.56 2.83-.3 4.68-.7 1.85-.41 2.78-1.04.92-.64.92-1.54v-.12q0-1.35-.79-2.34-.79-.98-2.14-1.52-1.36-.53-2.99-.53-1.63 0-3.22.37-1.59.37-2.92 1.19-1.33.83-2.22 2.23-.17.23-.4.36-.24.12-.52.13-.28 0-.54-.13-.08-.03-.58-.3-.5-.26-1.15-.59-.64-.33-1.14-.6-.49-.26-.57-.3-.26-.12-.42-.35-.16-.23-.19-.5-.04-.27.07-.54.81-2.26 3-3.96 2.18-1.71 5.15-2.66 2.97-.95 6.13-.95 3.18 0 5.74.85 2.56.85 4.41 2.38 1.84 1.53 2.83 3.61.98 2.07.98 4.51v21.56q0 .74-.33 1.07-.33.33-1.06.33-.17 0-.76 0-.6 0-1.39 0-.79 0-1.59 0-.8 0-1.38 0-.59 0-.75 0-.71 0-1.06-.32-.34-.32-.34-1.04v-1.66h-.07zm-12.87-6.78q0 1.14.68 2.03.67.88 1.9 1.38 1.23.49 2.85.49 2.33 0 4.07-.88 1.73-.88 2.68-2.4.94-1.51.94-3.36v-3.53q-.52.28-1.54.57-1.03.29-2.44.58-1.41.29-3.09.57-2.48.38-4.26 1.53-1.79 1.14-1.79 3.02zm27.66 22.37q-.79 0-1.15-.36-.36-.36-.36-1.16v-43.42q0-.71.32-1.02.31-.32 1.02-.32.15 0 .75 0 .6 0 1.41 0 .81 0 1.61 0 .8 0 1.38 0 .59 0 .75 0 .68 0 1.01.31.32.31.32.99v3.12h.02q1.12-1.67 2.8-2.78 1.69-1.12 3.66-1.68 1.98-.56 3.92-.56 4.2 0 7.54 2.3 3.33 2.29 5.26 6.23 1.92 3.93 1.92 8.86 0 4.95-1.94 8.91-1.94 3.95-5.28 6.27-3.34 2.31-7.55 2.31-2.14 0-4.07-.62-1.94-.62-3.52-1.87-1.58-1.24-2.63-3.09h-.04v16.06q0 .8-.36 1.16-.35.36-1.16.36-.17 0-.73 0-.55 0-1.32 0-.76 0-1.51 0-.76 0-1.32 0-.57 0-.75 0zm6.61-29.47q0 2.88 1.15 5.14 1.15 2.26 3.11 3.55 1.95 1.3 4.42 1.3 2.35 0 4.27-1.26 1.91-1.25 3.02-3.5 1.12-2.25 1.12-5.23 0-2.98-1.12-5.24-1.11-2.25-3.02-3.5-1.92-1.25-4.28-1.25-2.46 0-4.42 1.31-1.96 1.3-3.1 3.55-1.15 2.25-1.15 5.13zm58.12 11.33q-1.64 1.87-3.87 3.26-2.22 1.4-4.88 2.16-2.66.77-5.59.77-4.78 0-8.47-2.33-3.7-2.32-5.8-6.28-2.1-3.97-2.1-8.87 0-5 2.12-8.96 2.13-3.96 5.77-6.28 3.65-2.32 8.22-2.32 4.82 0 8.51 2.29 3.69 2.28 5.8 6.16 2.1 3.88 2.2 8.6v1.15q.04.88-.32 1.23-.37.35-1.24.35h-22.66q.12 2.44 1.2 4.37 1.07 1.93 2.95 3.06 1.88 1.12 4.41 1.12 2.01 0 3.88-.44 1.87-.44 3.5-1.24 1.63-.8 2.93-1.9.21-.18.46-.22.26-.04.5.05.25.09.42.33.05.08.36.47.32.39.71.88.38.49.68.89.29.39.35.46.14.19.2.41.05.23-.01.45-.07.21-.23.38zm-14.4-22.59q-2.1 0-3.77 1-1.68 1.01-2.74 2.79-1.06 1.79-1.31 4.1h16q-.25-2.29-1.35-4.07-1.11-1.78-2.87-2.8-1.77-1.02-3.96-1.02zm20.78 28.16q-.78 0-1.15-.36-.37-.35-.37-1.15v-30.75q0-.75.35-1.1.34-.36 1.11-.36.19 0 .74 0 .54 0 1.26 0 .72 0 1.45 0 .73 0 1.28 0 .54 0 .7 0 .78 0 1.11.36.34.35.34 1.1v4.4h.02q.61-1.87 1.76-3.19 1.16-1.32 2.77-2.01 1.61-.69 3.57-.69.49 0 1.14.08.65.08 1.15.17.44.06.71.22.27.16.39.46.13.3.07.75 0 .13-.04.62-.03.48-.09 1.12-.05.64-.1 1.28-.04.64-.07 1.12-.03.47-.06.64-.06.67-.38.96-.33.29-1.02.23-.25.01-.78-.05-.53-.06-1.16-.1-.64-.05-1.16-.05-2.03 0-3.46 1.19-1.42 1.2-2.18 3.13-.75 1.94-.75 4.15v16.31q0 .81-.36 1.16-.35.36-1.16.36-.17 0-.73 0-.56 0-1.33 0-.77 0-1.52 0-.74 0-1.31 0-.57 0-.74 0zm49.33-8.59q-1.02 2.56-3.14 4.65-2.12 2.09-5.06 3.32-2.94 1.24-6.37 1.24-3.52 0-6.56-1.34-3.03-1.34-5.3-3.73-2.27-2.39-3.55-5.56-1.27-3.18-1.27-6.85 0-3.7 1.27-6.89 1.28-3.19 3.55-5.59 2.27-2.4 5.3-3.74 3.04-1.34 6.56-1.34 3.38 0 6.26 1.2 2.89 1.2 4.99 3.25 2.1 2.05 3.15 4.59.23.44.25.76.01.32-.17.55-.18.23-.57.42-.13.06-.54.27-.41.22-.96.49-.54.27-1.08.55-.55.28-.96.49-.4.2-.51.27-.33.17-.63.15-.3-.01-.52-.16-.23-.16-.42-.43-.77-1.56-2.02-2.64-1.25-1.09-2.82-1.66-1.56-.57-3.33-.57-2.39 0-4.28 1.31-1.9 1.31-2.99 3.56-1.1 2.26-1.1 5.16 0 2.88 1.1 5.13 1.09 2.26 2.99 3.55 1.89 1.29 4.28 1.29 1.8 0 3.33-.61 1.53-.61 2.75-1.78 1.22-1.16 2.08-2.88.19-.29.44-.46.25-.17.56-.18.31-.01.67.19.14.07.54.3.41.23.97.53.56.3 1.11.6.54.3.96.53.41.24.54.31.39.19.57.43.18.23.17.54-.02.32-.24.78zm24.96 3.45q-1.85 2.66-4.51 4.21-2.67 1.55-5.85 1.55-3.45 0-6.12-1.64-2.67-1.65-4.22-4.66-1.54-3.01-1.54-7.11v-19.4q0-.8.36-1.16.36-.36 1.15-.36.19 0 .74 0 .56 0 1.33 0 .77 0 1.52 0 .75 0 1.31 0 .56 0 .73 0 .8 0 1.16.36.36.36.36 1.16v17.87q0 2.25.82 3.87.82 1.62 2.28 2.5 1.46.88 3.4.88 2 0 3.59-.97 1.58-.96 2.51-2.8.92-1.84.92-4.46v-16.89q0-.81.37-1.16.37-.36 1.16-.36.16 0 .73 0 .57 0 1.31 0 .75 0 1.5 0 .75 0 1.32 0 .58 0 .74 0 .78 0 1.14.36.36.35.36 1.15v30.69q0 .8-.35 1.16-.35.35-1.15.35-.14 0-.71 0-.57 0-1.32 0-.75 0-1.5 0-.76 0-1.33 0-.57 0-.73 0-.8 0-1.15-.36-.35-.36-.35-1.15l.02-3.63zm14.73 5.14q-.79 0-1.16-.36-.36-.35-.36-1.15v-30.75q0-.75.34-1.1.34-.36 1.12-.36.18 0 .73 0 .55 0 1.26 0 .72 0 1.45 0 .74 0 1.28 0 .54 0 .71 0 .77 0 1.1.36.34.35.34 1.1v4.4h.02q.61-1.87 1.77-3.19 1.15-1.32 2.76-2.01 1.62-.69 3.58-.69.48 0 1.13.08.65.08 1.15.17.45.06.71.22.27.16.4.46.12.3.07.75-.01.13-.05.62-.03.48-.08 1.12-.05.64-.1 1.28-.05.64-.08 1.12-.03.47-.05.64-.06.67-.39.96-.32.29-1.02.23-.25.01-.78-.05-.53-.06-1.16-.1-.63-.05-1.15-.05-2.04 0-3.46 1.19-1.42 1.2-2.18 3.13-.76 1.94-.76 4.15v16.31q0 .81-.35 1.16-.36.36-1.16.36-.18 0-.74 0-.56 0-1.33 0-.77 0-1.51 0-.75 0-1.32 0-.57 0-.73 0zm39.4-3.02q-.77 1.19-2.14 1.93-1.37.74-3.28 1.09-1.92.34-4.32.34-3.28 0-5.9-1.21-2.62-1.2-4.15-3.44-1.52-2.23-1.52-5.32 0-3.24 1.79-5.39 1.79-2.15 4.79-3.34 3.01-1.19 6.56-1.56 2.82-.3 4.68-.7 1.85-.41 2.77-1.04.92-.64.92-1.54v-.12q0-1.35-.79-2.34-.79-.98-2.14-1.52-1.35-.53-2.98-.53-1.64 0-3.23.37-1.59.37-2.92 1.19-1.32.83-2.21 2.23-.17.23-.41.36-.23.12-.51.13-.28 0-.54-.13-.08-.03-.58-.3-.5-.26-1.15-.59-.65-.33-1.14-.6-.49-.26-.58-.3-.26-.12-.41-.35-.16-.23-.2-.5-.03-.27.08-.54.81-2.26 2.99-3.96 2.18-1.71 5.15-2.66 2.98-.95 6.13-.95 3.18 0 5.74.85 2.56.85 4.41 2.38 1.85 1.53 2.84 3.61.98 2.07.98 4.51v21.56q0 .74-.33 1.07-.33.33-1.07.33-.16 0-.75 0-.6 0-1.39 0-.79 0-1.59 0-.8 0-1.39 0-.59 0-.75 0-.71 0-1.05-.32-.34-.32-.34-1.04v-1.66h-.07zm-12.88-6.78q0 1.14.68 2.03.68.88 1.91 1.38 1.23.49 2.84.49 2.34 0 4.07-.88 1.74-.88 2.68-2.4.95-1.51.95-3.36v-3.53q-.52.28-1.55.57-1.02.29-2.43.58-1.41.29-3.1.57-2.47.38-4.26 1.53-1.79 1.14-1.79 3.02z";

/** The two inks of the logo, per theme; `mono` draws everything in the current colour. */
export type BrandVariant = "light" | "dark" | "mono";

export const BRAND_COLORS: Record<BrandVariant, { ink: string; accent: string }> = {
	light: brandInks.light,
	dark: brandInks.dark,
	mono: { ink: "currentColor", accent: "currentColor" },
};

/** The lockup's width for a given height (CSS pixels or units), to two decimals. */
export function brandLockupWidth(height: number): number {
	return Math.round(((height * BRAND_LOCKUP_WIDTH) / BRAND_SYMBOL_SIZE) * 100) / 100;
}

const dot = (fill?: string) => {
	const { cx, cy, r } = BRAND_SYMBOL_DOT;
	return `<circle cx="${cx}" cy="${cy}" r="${r}"${fill ? ` fill="${fill}"` : ""}/>`;
};

const symbolBody = ({ ink, accent }: { ink: string; accent: string }) =>
	`<path fill="${ink}" fill-rule="evenodd" d="${BRAND_SYMBOL_PATH}"/>${dot(accent)}`;

const document = (width: number, body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${BRAND_SYMBOL_SIZE}" role="img"><title>Apercura</title>${body}</svg>\n`;

/** The symbol as a standalone SVG file. */
export function brandSymbolSvg(variant: BrandVariant): string {
	return document(BRAND_SYMBOL_SIZE, symbolBody(BRAND_COLORS[variant]));
}

/** The lockup (symbol and wordmark) as a standalone SVG file. */
export function brandLockupSvg(variant: BrandVariant): string {
	const colors = BRAND_COLORS[variant];
	return document(
		BRAND_LOCKUP_WIDTH,
		`${symbolBody(colors)}<path fill="${colors.ink}" d="${BRAND_WORDMARK_PATH}"/>`,
	);
}

/**
 * The favicon: the symbol in the light inks, the dark ones when the browser is in a dark scheme
 * (the browser's, not the site's theme choice, which a favicon cannot read).
 */
export function brandFaviconSvg(): string {
	const { light, dark } = BRAND_COLORS;
	const style =
		`<style>path{fill:${light.ink}}circle{fill:${light.accent}}` +
		`@media (prefers-color-scheme:dark){path{fill:${dark.ink}}circle{fill:${dark.accent}}}</style>`;
	return document(
		BRAND_SYMBOL_SIZE,
		`${style}<path fill-rule="evenodd" d="${BRAND_SYMBOL_PATH}"/>${dot()}`,
	);
}

/**
 * The symbol on white paper. `inset` is the share of the side left around the symbol's grid on
 * each edge: 0 for the site icons (the grid's own 4-unit margin), 0.2 for the app icon, whose
 * symbol then sits inside the 80 % safe zone of a maskable icon (its farthest point, the sharp
 * corner, is 37 % of the side from the centre).
 */
export function brandTileSvg(inset = 0): string {
	const scale = 1 - 2 * inset;
	const offset = Math.round(BRAND_SYMBOL_SIZE * inset * 100) / 100;
	const body = symbolBody(BRAND_COLORS.light);
	const symbol =
		inset === 0
			? body
			: `<g transform="translate(${offset} ${offset}) scale(${scale})">${body}</g>`;
	return document(
		BRAND_SYMBOL_SIZE,
		`<rect width="${BRAND_SYMBOL_SIZE}" height="${BRAND_SYMBOL_SIZE}" fill="${paletteHex.paper}"/>${symbol}`,
	);
}

/** The app icon: the symbol on paper with the maskable safe-zone padding. */
export function brandAppIconSvg(): string {
	return brandTileSvg(0.2);
}
