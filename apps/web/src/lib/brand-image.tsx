import {
	BRAND_SYMBOL_SIZE,
	BRAND_WORDMARK_SIZE,
	brandAppIconSvg,
	brandLockupSvg,
	brandLockupWidth,
	brandTileSvg,
} from "@apercura/ui/brand";
import { ImageResponse } from "next/og";

/*
 * The logo in the images the server draws (site icons, Open Graph cards). The renderer takes
 * the standalone SVG as an image, so every PNG is drawn from the same geometry as the header
 * and the files of docs/brand.
 */

const dataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const LOCKUP = dataUrl(brandLockupSvg("light"));

/**
 * The lockup in the light inks, `height` pixels high, for an Open Graph card
 * (`lockupHeightFor` gives the height whose wordmark matches a type size).
 */
export function OgLockup({ height }: { height: number }) {
	return (
		// biome-ignore lint/performance/noImgElement: rendered to a PNG by next/og, not a page.
		<img
			src={LOCKUP}
			alt=""
			width={brandLockupWidth(height)}
			height={height}
			style={{ width: brandLockupWidth(height), height }}
		/>
	);
}

/** The lockup height whose wordmark is set at `fontSize` pixels. */
export const lockupHeightFor = (fontSize: number) =>
	Math.round((fontSize * BRAND_SYMBOL_SIZE) / BRAND_WORDMARK_SIZE);

function squarePng(svg: string, size: number) {
	const src = dataUrl(svg);
	return new ImageResponse(
		// biome-ignore lint/performance/noImgElement: rendered to a PNG by next/og, not a page.
		<img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />,
		{ width: size, height: size },
	);
}

/** The site icon: the symbol on white paper, edge to edge of its grid. */
export function siteIconPng(size: number) {
	return squarePng(brandTileSvg(), size);
}

/** The app icon (home screens, maskable manifest icons): the symbol inside the safe zone. */
export function appIconPng(size: number) {
	return squarePng(brandAppIconSvg(), size);
}
