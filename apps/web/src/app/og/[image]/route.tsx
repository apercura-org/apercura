import { paletteHex } from "@apercura/ui/tokens";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { ogFonts } from "~/server/og/fonts";

/**
 * One static Open Graph image per profession (and one for listings):
 * `/og/medecin.png`, `/og/chirurgien-dentiste.png`, `/og/sage-femme.png`,
 * `/og/infirmier.png`, `/og/annuaire.png`. Prerendered at build time. Practitioner
 * pages have their own (`/og/praticien/{slug}.png`), with these as the fallback.
 */
const IMAGES = ["medecin", "chirurgien-dentiste", "sage-femme", "infirmier", "annuaire"] as const;
type ImageName = (typeof IMAGES)[number];

export function generateStaticParams() {
	return IMAGES.map((image) => ({ image: `${image}.png` }));
}

/** The neutral print: white paper, graphite ink, hairlines and the quiet shade. No stamp: nothing here is an action. */
const {
	paper: PAPER,
	paperShade: SHADE,
	ink: INK,
	inkMuted: INK_MUTED,
	ruleSoft: RULE,
} = paletteHex;

export async function GET(_request: Request, { params }: RouteContext<"/og/[image]">) {
	const { image } = await params;
	const name = image.replace(/\.png$/, "") as ImageName;
	if (!IMAGES.includes(name)) return new Response("Not found", { status: 404 });
	// Shared on French search results and social networks: printed in French.
	const t = await getTranslations({ locale: "fr", namespace: "OgImage" });
	const fonts = await ogFonts();
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
				fontFamily: "Archivo",
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
						letterSpacing: 1.5,
					}}
				>
					{t("runningHead").toUpperCase()}
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "0 80px" }}>
				<div
					style={{
						display: "flex",
						fontSize: 112,
						fontWeight: 600,
						letterSpacing: -3,
						lineHeight: 1,
					}}
				>
					{t("wordmark")}
				</div>
				<div
					style={{
						display: "flex",
						maxWidth: 940,
						fontSize: 48,
						fontWeight: 500,
						lineHeight: 1.2,
					}}
				>
					{t(`titles.${name}`)}
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
				{t("footer")}
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			fonts,
		},
	);
}
