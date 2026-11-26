import { cn } from "../recipes";
import {
	BRAND_LOCKUP_WIDTH,
	BRAND_SYMBOL_DOT,
	BRAND_SYMBOL_PATH,
	BRAND_SYMBOL_SIZE,
	BRAND_WORDMARK_PATH,
	brandLockupWidth,
} from "./geometry";

export interface BrandMarkProps {
	/** Rendered height in CSS pixels (16 at the least). */
	height?: number;
	className?: string;
}

/*
 * The ink is the current colour, so the mark follows the theme and the surface it sits on; the
 * dot takes the accent token (`--color-stamp`), and the current colour in forced colours.
 * Decorative: the link or heading around it carries the name.
 */
function Dot() {
	return <circle {...BRAND_SYMBOL_DOT} className="fill-stamp forced-colors:fill-current" />;
}

/** Apercura's symbol alone. */
export function BrandSymbol({ height = 24, className }: BrandMarkProps) {
	return (
		<svg
			viewBox={`0 0 ${BRAND_SYMBOL_SIZE} ${BRAND_SYMBOL_SIZE}`}
			width={height}
			height={height}
			aria-hidden="true"
			focusable="false"
			fill="currentColor"
			className={cn("shrink-0", className)}
		>
			<path fillRule="evenodd" d={BRAND_SYMBOL_PATH} />
			<Dot />
		</svg>
	);
}

/** Apercura's lockup: the symbol and the wordmark, drawn as paths (no web font involved). */
export function BrandLockup({ height = 24, className }: BrandMarkProps) {
	return (
		<svg
			viewBox={`0 0 ${BRAND_LOCKUP_WIDTH} ${BRAND_SYMBOL_SIZE}`}
			width={brandLockupWidth(height)}
			height={height}
			aria-hidden="true"
			focusable="false"
			fill="currentColor"
			className={cn("shrink-0", className)}
		>
			<path fillRule="evenodd" d={BRAND_SYMBOL_PATH} />
			<Dot />
			<path d={BRAND_WORDMARK_PATH} />
		</svg>
	);
}

/*
 * The wordmark as live text in the site's Allo (the preloaded web cut: roundness 25, optical
 * size 18, weights 400 to 700), set to look like the outlined lockup: weight 650, -0.02 em,
 * its x-height (1099/2048 em) matched to the outlines' (0.521 of the symbol) and centred on
 * the symbol, the gap to the symbol a quarter of its height less the a's side bearing
 * (61.5/2048 em). With a line box as tall as the symbol, Allo's ascent and descent
 * (1984 and 494/2048 em, the metrics every platform reads) put the baseline 0.0955 em below
 * the centred x-height: `top` lifts it back.
 */
const WORDMARK_TEXT = "apercura";
const XHEIGHT_RATIO = 0.5211 / (1099 / 2048);
const SIDE_BEARING = 61.5 / 2048;
const BASELINE_LIFT = 0.0955;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/**
 * Apercura's logo for the site's own pages: the symbol as inline SVG and the wordmark as text
 * in the web font, a few bytes instead of the lockup's outlines. Hidden from assistive
 * technology: the link around it carries the name. Off-site renderings (images, files) use the
 * outlined lockup.
 */
export function BrandLogo({ height = 24, className }: BrandMarkProps) {
	const fontSize = height * XHEIGHT_RATIO;
	return (
		<span aria-hidden="true" className={cn("inline-flex shrink-0 items-center", className)}>
			<BrandSymbol height={height} />
			<span
				translate="no"
				className="type-wordmark relative whitespace-nowrap"
				style={{
					fontSize: px(fontSize),
					lineHeight: px(height),
					marginInlineStart: px(height / 4 - SIDE_BEARING * fontSize),
					top: px(-BASELINE_LIFT * fontSize),
				}}
			>
				{WORDMARK_TEXT}
			</span>
		</span>
	);
}
