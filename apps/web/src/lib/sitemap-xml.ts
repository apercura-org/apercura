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

export const xmlResponse = (body: string) =>
	new Response(body, {
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});

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
