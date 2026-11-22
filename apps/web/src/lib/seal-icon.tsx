import { BrandSeal } from "@apercura/ui";
import { ImageResponse } from "next/og";
import { PAPER_COLOR, THEME_COLOR } from "./seo";

/** Apercura's brand seal in paper white on the cover ink, as a square PNG. */
export function sealIcon(size: number) {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: THEME_COLOR,
				color: PAPER_COLOR,
			}}
		>
			<BrandSeal size={Math.round(size * 0.84)} />
		</div>,
		{ width: size, height: size },
	);
}
