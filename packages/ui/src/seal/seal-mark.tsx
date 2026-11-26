import { cn } from "../recipes";
import { bandPath, brandSealSpec, type SealSpec, ticksPath } from "./seal-spec";

export interface BrandSealProps {
	size?: number;
	className?: string;
}

/**
 * Apercura's own seal, drawn by the same engraving generator from a fixed brand
 * seed. Used on the home opening; practitioner pages always carry their RPPS seal instead.
 */
export function BrandSeal({ size = 88, className }: BrandSealProps) {
	return <SealMark spec={brandSealSpec()} size={size} className={className} data-seal="brand" />;
}

/** Draws a seal from its spec. Server-safe: the site icons draw the brand seal with it. */
export function SealMark({
	spec,
	verified = false,
	size,
	className,
	"data-seal": dataSeal,
}: {
	spec: SealSpec;
	verified?: boolean;
	size: number;
	className?: string;
	"data-seal": string;
}) {
	return (
		<svg
			viewBox="-50 -50 100 100"
			width={size}
			height={size}
			aria-hidden="true"
			focusable="false"
			className={cn("shrink-0 text-ink", className)}
			fill="none"
			stroke="currentColor"
			data-seal={dataSeal}
		>
			<circle
				r={48.5 - spec.outerWeight / 2}
				strokeWidth={spec.outerWeight}
				className={verified ? "text-stamp" : undefined}
				stroke="currentColor"
			/>
			{spec.doubleRing ? <circle r={44.5} strokeWidth={0.6} /> : null}
			<path d={ticksPath(spec)} strokeWidth={spec.tickWeight} strokeLinecap="butt" />
			{spec.bands.map((band) => (
				<g key={`${band.radius}-${band.waves}`} strokeWidth={band.weight} strokeLinejoin="round">
					<path d={bandPath(band)} />
					{band.braided ? <path d={bandPath({ ...band, phase: band.phase + Math.PI })} /> : null}
				</g>
			))}
			<circle
				r={spec.bossRadius}
				strokeWidth={1.2}
				fill={spec.bossFilled ? "currentColor" : "none"}
			/>
		</svg>
	);
}
