import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";
import { sitemapIndexXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import { getSitemapChunks, SITEMAP_MARKETS } from "~/server/queries/sitemap";

/**
 * Sitemap index, written by hand (Next.js generates sitemaps but no index): the
 * international home, then each open market's files under its segment
 * (`/sitemaps/fr/…`, `/sitemaps/at/…`; Switzerland's under each of its languages', `/sitemaps/ch/…`,
 * `/sitemaps/ch-fr/…`, `/sitemaps/ch-it/…`), its static pages first, then every
 * non-empty chunk of its read models. Rendered at request time (APP_URL and the
 * data are runtime values), cached.
 */
export async function GET() {
	await connection();
	const origin = siteOrigin();
	const chunks = hasDatabaseUrl() ? await getSitemapChunks() : [];
	return xmlResponse(
		sitemapIndexXml([
			{ loc: `${origin}/sitemaps/international.xml` },
			...SITEMAP_MARKETS.flatMap((market) => [
				{ loc: `${origin}/sitemaps/${market}/pages-0.xml` },
				...chunks
					.filter((chunk) => chunk.market === market)
					.map((chunk) => ({
						loc: `${origin}/sitemaps/${market}/${chunk.kind}-${chunk.chunk}.xml`,
						lastmod: chunk.lastmod,
					})),
			]),
		]),
	);
}
