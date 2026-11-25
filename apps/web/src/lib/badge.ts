import { LOCALES, type Locale } from "~/i18n/locales";
import { escapeXml } from "./qr";

/** The badge's size in CSS pixels: what the snippet's `width` and `height` say. */
export const BADGE_WIDTH = 216;
export const BADGE_HEIGHT = 56;

/** `/badges/apercura-{locale}.svg`, one static file per interface locale. */
export function badgeFile(locale: Locale): string {
	return `apercura-${locale}.svg`;
}

export function badgeLocale(file: string): Locale | null {
	const match = /^apercura-([a-z]{2})\.svg$/.exec(file);
	const locale = match?.[1];
	return locale && (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : null;
}

/**
 * The "Find me on Apercura" badge: a printed label in the booklet's ink on white paper, framed by
 * a hairline. Pure SVG: no script, no external font or image, nothing that calls back.
 */
export function badgeSvg(
	text: { lead: string; brand: string },
	colors: { paper: string; ink: string; inkMuted: string; edge: string },
): string {
	const lead = escapeXml(text.lead);
	const brand = escapeXml(text.brand);
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" role="img" aria-label="${lead} ${brand}">`,
		`<title>${lead} ${brand}</title>`,
		`<rect x="0.5" y="0.5" width="${BADGE_WIDTH - 1}" height="${BADGE_HEIGHT - 1}" rx="2" fill="${colors.paper}" stroke="${colors.edge}"/>`,
		`<circle cx="28" cy="28" r="15" fill="none" stroke="${colors.ink}" stroke-width="1.5"/>`,
		`<circle cx="28" cy="28" r="10.5" fill="none" stroke="${colors.ink}" stroke-width="0.75"/>`,
		`<circle cx="28" cy="28" r="2.5" fill="${colors.ink}"/>`,
		`<text x="54" y="23" font-family="Allo, Arial, Helvetica, sans-serif" font-size="12" fill="${colors.inkMuted}">${lead}</text>`,
		`<text x="54" y="42" font-family="Allo, Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="${colors.ink}">${brand}</text>`,
		"</svg>",
	].join("");
}
