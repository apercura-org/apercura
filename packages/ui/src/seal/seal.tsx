import { cn } from "../recipes";
import { bandPath, sealSpec, ticksPath } from "./seal-spec";

export interface SealProps {
	/** RPPS number the seal is derived from. */
	rpps: string;
	/** Verified pages print the outer ring in stamp violet. */
	verified?: boolean;
	/** Rendered size in CSS pixels. */
	size?: number;
	className?: string;
}

/**
 * The practitioner's seal: a deterministic engraved mark derived from the RPPS.
 * Decorative (the page heading names the practitioner), so hidden from assistive technology.
 */
export function Seal({ rpps, verified = false, size = 88, className }: SealProps) {
	const spec = sealSpec(rpps);
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
			data-seal={rpps}
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
