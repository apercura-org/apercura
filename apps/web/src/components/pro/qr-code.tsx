"use client";

import QRCode from "qrcode";
import { useMemo } from "react";

/** A QR code drawn as ink squares on paper (no external image, no innerHTML). */
export function QrCode({
	value,
	label,
	size = 208,
}: {
	value: string;
	label: string;
	size?: number;
}) {
	const path = useMemo(() => {
		const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
		let d = "";
		for (let row = 0; row < modules.size; row++) {
			for (let col = 0; col < modules.size; col++) {
				if (modules.get(row, col)) {
					d += `M${col + 4} ${row + 4}h1v1h-1z`;
				}
			}
		}
		return { d, size: modules.size + 8 };
	}, [value]);

	return (
		<svg
			role="img"
			aria-label={label}
			viewBox={`0 0 ${path.size} ${path.size}`}
			width={size}
			height={size}
			shapeRendering="crispEdges"
			className="border-[1.5px] border-ink bg-paper text-ink"
		>
			<rect width={path.size} height={path.size} className="fill-paper" />
			<path d={path.d} fill="currentColor" />
		</svg>
	);
}
