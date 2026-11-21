import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";
import { sitemapIndexXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import { getSitemapChunks } from "~/server/queries/sitemap";

/**
 * Sitemap index, written by hand (Next.js generates sitemaps but no index):
 * the static pages, then every non-empty chunk of the read models.
 * Rendered at request time (APP_URL and the data are runtime values), cached.
 */
export async function GET() {
	await connection();
	const origin = siteOrigin();
	const chunks = hasDatabaseUrl() ? await getSitemapChunks() : [];
	return xmlResponse(
		sitemapIndexXml([
			{ loc: `${origin}/sitemaps/pages-0.xml` },
			...chunks.map((chunk) => ({
				loc: `${origin}/sitemaps/${chunk.kind}-${chunk.chunk}.xml`,
				lastmod: chunk.lastmod,
			})),
		]),
	);
}
