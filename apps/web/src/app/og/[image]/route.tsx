import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

/**
 * One static Open Graph image per profession (and one for listings), never one
 * per page: `/og/medecin.png`, `/og/chirurgien-dentiste.png`,
 * `/og/sage-femme.png`, `/og/annuaire.png`. Prerendered at build time.
 */
const IMAGES = ["medecin", "chirurgien-dentiste", "sage-femme", "annuaire"] as const;
type ImageName = (typeof IMAGES)[number];

export function generateStaticParams() {
	return IMAGES.map((image) => ({ image: `${image}.png` }));
}

const INK = "#003851";
const PAPER = "#ffffff";
const COVER_MUTED = "#c2d8e5";
const COVER_RULE = "#698ca0";

/** Static Archivo cuts (the variable fonts are WOFF2 only, which the image renderer cannot read). */
async function font(weight: 600 | 900) {
	return readFile(
		join(
			process.cwd(),
			`node_modules/@fontsource/archivo/files/archivo-latin-${weight}-normal.woff`,
		),
	);
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[image]">) {
	const { image } = await params;
	const name = image.replace(/\.png$/, "") as ImageName;
	if (!IMAGES.includes(name)) return new Response("Not found", { status: 404 });
	// Shared on French search results and social networks: printed in French.
	const t = await getTranslations({ locale: "fr", namespace: "OgImage" });
	const [black, semibold] = await Promise.all([font(900), font(600)]);
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: INK,
				color: PAPER,
				padding: "72px 80px 56px",
				fontFamily: "Archivo",
			}}
		>
			<div
				style={{
					display: "flex",
					fontSize: 30,
					fontWeight: 600,
					color: COVER_MUTED,
					letterSpacing: 3,
				}}
			>
				{t("runningHead").toUpperCase()}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
				<div
					style={{
						display: "flex",
						fontSize: 132,
						fontWeight: 900,
						letterSpacing: -4,
						lineHeight: 1,
					}}
				>
					{t("wordmark")}
				</div>
				<div style={{ display: "flex", fontSize: 52, fontWeight: 600, lineHeight: 1.15 }}>
					{t(`titles.${name}`)}
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<div style={{ display: "flex", height: 3, background: COVER_RULE }} />
				<div style={{ display: "flex", height: 1, background: COVER_RULE }} />
				<div
					style={{
						display: "flex",
						fontSize: 28,
						fontWeight: 600,
						color: COVER_MUTED,
						marginTop: 12,
					}}
				>
					{t("footer")}
				</div>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			fonts: [
				{ name: "Archivo", data: black, weight: 900, style: "normal" },
				{ name: "Archivo", data: semibold, weight: 600, style: "normal" },
			],
		},
	);
}
