"use client";

import { useMemo } from "react";
import { qrPath } from "~/lib/qr";

/** A QR code drawn as ink squares on a light quiet zone, in both themes (no external image, no innerHTML). */
export function QrCode({
	value,
	label,
	size = 208,
	className = "border border-ink",
}: {
	value: string;
	label: string;
	/** Pixels, or any CSS length (`"60mm"` on the printed poster). */
	size?: number | string;
	className?: string;
}) {
	const path = useMemo(() => qrPath(value), [value]);

	return (
		<svg
			role="img"
			aria-label={label}
			viewBox={`0 0 ${path.size} ${path.size}`}
			// A CSS length (`48cqw` on the poster) only works as a style, not as an SVG attribute.
			width={typeof size === "number" ? size : undefined}
			height={typeof size === "number" ? size : undefined}
			style={typeof size === "string" ? { width: size, height: size } : undefined}
			shapeRendering="crispEdges"
			// Always dark modules on a light quiet zone, whatever the theme: scanners expect it.
			className={`${className} scheme-light bg-paper text-ink`}
		>
			<rect width={path.size} height={path.size} className="fill-paper" />
			<path d={path.d} fill="currentColor" />
		</svg>
	);
}
