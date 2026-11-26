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
