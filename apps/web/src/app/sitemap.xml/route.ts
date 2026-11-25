import { connection } from "next/server";
import { FRANCE_SEGMENT } from "~/i18n/locales";
import { siteOrigin } from "~/lib/site-url";
import { sitemapIndexXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import { getSitemapChunks } from "~/server/queries/sitemap";

/**
 * Sitemap index, written by hand (Next.js generates sitemaps but no index): the
 * international home, then each open market's files under its segment (France:
 * `/sitemaps/fr/…`), its static pages first, then every non-empty chunk of the
 * read models. Rendered at request time (APP_URL and the data are runtime
 * values), cached.
 */
export async function GET() {
	await connection();
	const origin = siteOrigin();
	const chunks = hasDatabaseUrl() ? await getSitemapChunks() : [];
	const france = `${origin}/sitemaps/${FRANCE_SEGMENT}`;
	return xmlResponse(
		sitemapIndexXml([
			{ loc: `${origin}/sitemaps/international.xml` },
			{ loc: `${france}/pages-0.xml` },
			...chunks.map((chunk) => ({
				loc: `${france}/${chunk.kind}-${chunk.chunk}.xml`,
				lastmod: chunk.lastmod,
			})),
		]),
	);
}
