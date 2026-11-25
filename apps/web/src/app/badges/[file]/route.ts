import { paletteHex } from "@apercura/ui/tokens";
import { getTranslations } from "next-intl/server";
import { LOCALES } from "~/i18n/locales";
import { badgeFile, badgeLocale, badgeSvg } from "~/lib/badge";

/**
 * The embeddable "Find me on Apercura" badge, one static SVG per locale
 * (`/badges/apercura-fr.svg`), prerendered at build time. Other sites embed it: it may be loaded
 * cross-origin, it sets no cookie, runs nothing and counts nothing.
 */
export function generateStaticParams() {
	return LOCALES.map((locale) => ({ file: badgeFile(locale) }));
}

export async function GET(_request: Request, { params }: RouteContext<"/badges/[file]">) {
	const { file } = await params;
	const locale = badgeLocale(file);
	if (!locale) return new Response("Not found", { status: 404 });
	const t = await getTranslations({ locale, namespace: "Share.badge" });
	const svg = badgeSvg(
		{ lead: t("lead"), brand: t("brand") },
		{
			paper: paletteHex.paper,
			ink: paletteHex.ink,
			inkMuted: paletteHex.inkMuted,
			edge: paletteHex.fieldEdge,
		},
	);
	return new Response(svg, {
		headers: {
			"content-type": "image/svg+xml; charset=utf-8",
			"cache-control": "public, max-age=86400, stale-while-revalidate=604800",
			// Embedded by other sites: readable cross-origin, inert if opened on its own.
			"cross-origin-resource-policy": "cross-origin",
			"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
			"x-content-type-options": "nosniff",
		},
	});
}
