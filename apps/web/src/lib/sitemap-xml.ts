import { LOCALE_PREFIXES } from "~/i18n/locales";

/** XML of sitemaps and sitemap indexes (sitemaps.org 0.9), without changefreq or priority. */

const escapeXml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export function sitemapIndexXml(entries: { loc: string; lastmod?: string }[]): string {
	const items = entries
		.map(
			(entry) =>
				`<sitemap><loc>${escapeXml(entry.loc)}</loc>${
					entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""
				}</sitemap>`,
		)
		.join("\n");
	return `${HEADER}<sitemapindex xmlns="${NAMESPACE}">\n${items}\n</sitemapindex>\n`;
}

export function urlSetXml(entries: { loc: string; lastmod?: string }[]): string {
	const items = entries
		.map(
			(entry) =>
				`<url><loc>${escapeXml(entry.loc)}</loc>${
					entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""
				}</url>`,
		)
		.join("\n");
	return `${HEADER}<urlset xmlns="${NAMESPACE}">\n${items}\n</urlset>\n`;
}

/**
 * Sitemaps change with every import: browsers ask again on every visit and a shared cache
 * keeps one five minutes at most (`max-age=3600` let any cache serve the index from before an
 * import for an hour).
 */
export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=300";

export const xmlResponse = (body: string) =>
	new Response(body, {
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control": SITEMAP_CACHE_CONTROL,
		},
	});

/** A French path of the directory (`/praticien/…`, `/` for the home) under France's segment. */
export const francePath = (path: string) =>
	path === "/" ? LOCALE_PREFIXES.fr : `${LOCALE_PREFIXES.fr}${path}`;

/** Indexable pages that do not come from the read models, as French paths. */
export const STATIC_PATHS = [
	"/",
	"/pro",
	"/annuaire",
	"/a-propos",
	"/open-source",
	"/donnees",
	"/accessibilite",
	"/confidentialite",
	"/mentions-legales",
	"/conditions",
] as const;
