"use client";

/*
 * A client component so that a practitioner page's React payload carries the RPPS, not the
 * drawing: the browser draws the same paths from the same number (seal-spec.ts is
 * deterministic). Drawn on the server, the paths took about 10 KB of every practitioner page's
 * payload, which the page cache stores again. The HTML still holds the drawn seal.
 */
import { SealMark } from "./seal-mark";
import { sealSpec } from "./seal-spec";

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
	return (
		<SealMark
			spec={sealSpec(rpps)}
			verified={verified}
			size={size}
			className={className}
			data-seal={rpps}
		/>
	);
}
