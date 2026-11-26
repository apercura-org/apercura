import { paletteHex } from "@apercura/ui/tokens";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { lockupHeightFor, OgLockup } from "~/lib/brand-image";
import { GUIDES, guideBySlug } from "~/lib/guides/catalog";
import { formatGuideDate } from "~/lib/guides/format";
import { OG_FONT_FAMILY } from "~/server/og/font-files";
import { ogFonts } from "~/server/og/fonts";

/**
 * The Open Graph image of a guide: `/og/guides/{slug}.png`, its title on the neutral print of
 * the profession images (`/og/[image]`), with the date of its last update. Prerendered at build
 * time, one per guide; the faces are read from the files the standalone build ships
 * (~/server/og/font-files).
 */
export function generateStaticParams() {
	return GUIDES.map((guide) => ({ file: `${guide.slug}.png` }));
}

const {
	paper: PAPER,
	paperShade: SHADE,
	ink: INK,
	inkMuted: INK_MUTED,
	ruleSoft: RULE,
} = paletteHex;

/** Long titles get a smaller size, so every title fits in three lines. */
const titleSize = (title: string) => (title.length > 70 ? 60 : title.length > 45 ? 68 : 80);

export async function GET(_request: Request, { params }: RouteContext<"/og/guides/[file]">) {
	const { file } = await params;
	const guide = file.endsWith(".png") ? guideBySlug(file.slice(0, -4)) : undefined;
	if (!guide) return new Response("Not found", { status: 404 });
	// Shared on French results and social networks, as the guides themselves: printed in French.
	const t = await getTranslations({ locale: "fr", namespace: "Guides" });
	const fonts = await ogFonts(["latin", "latin-ext"]);
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: PAPER,
				color: INK,
				fontFamily: OG_FONT_FAMILY,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", padding: "64px 80px 0" }}>
				<div
					style={{
						display: "flex",
						paddingBottom: 16,
						borderBottom: `2px solid ${RULE}`,
						fontSize: 26,
						fontWeight: 500,
						color: INK_MUTED,
						letterSpacing: 0,
					}}
				>
					{t("ogRunningHead")}
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "0 80px" }}>
				<div
					style={{
						display: "flex",
						maxWidth: 1040,
						fontSize: titleSize(guide.title),
						fontWeight: 600,
						letterSpacing: -1.5,
						lineHeight: 1.08,
					}}
				>
					{guide.title}
				</div>
				<div style={{ display: "flex" }}>
					<OgLockup height={lockupHeightFor(40)} />
				</div>
			</div>
			<div
				style={{
					display: "flex",
					padding: "28px 80px 32px",
					background: SHADE,
					borderTop: `2px solid ${RULE}`,
					fontSize: 28,
					fontWeight: 500,
					color: INK_MUTED,
				}}
			>
				{t("ogFooter", { date: formatGuideDate("fr", guide.updatedAt) })}
			</div>
		</div>,
		{ width: 1200, height: 630, fonts },
	);
}
