import { BrandSeal } from "@apercura/ui";
import { ImageResponse } from "next/og";
import { INK_COLOR, PAPER_COLOR } from "./seo";

/** Apercura's brand seal in graphite ink on white paper, as a square PNG. */
export function sealIcon(size: number) {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: PAPER_COLOR,
				color: INK_COLOR,
			}}
		>
			<BrandSeal size={Math.round(size * 0.84)} />
		</div>,
		{ width: size, height: size },
	);
}
