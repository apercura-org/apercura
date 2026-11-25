import { connection } from "next/server";
import { FRANCE_SEGMENT } from "~/i18n/locales";
import { guidePaths } from "~/lib/guides/catalog";
import { siteOrigin } from "~/lib/site-url";
import { francePath, STATIC_PATHS, urlSetXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import { getSitemapEntries, SITEMAP_KINDS, type SitemapKind } from "~/server/queries/sitemap";

const FILE = /^([a-z]+)-(\d{1,6})\.xml$/;

/**
 * One sitemap chunk of a market: `/sitemaps/{market}/{kind}-{chunk}.xml` (at most 20,000
 * URLs), its indexable pages only. France (`fr`) is the only open market.
 */
export async function GET(
	_request: Request,
	{ params }: RouteContext<"/sitemaps/[market]/[file]">,
) {
	await connection();
	const { market, file } = await params;
	if (market !== FRANCE_SEGMENT) return new Response("Not found", { status: 404 });
	const match = FILE.exec(file);
	const kind = match?.[1];
	const chunk = Number(match?.[2]);
	const origin = siteOrigin();
	if (kind === "pages" && chunk === 0) {
		// The static pages, then the guides with the date of their last change.
		return xmlResponse(
			urlSetXml([
				...STATIC_PATHS.map((path) => ({ loc: `${origin}${francePath(path)}` })),
				...guidePaths().map((guide) => ({
					loc: `${origin}${francePath(guide.path)}`,
					lastmod: guide.lastmod,
				})),
			]),
		);
	}
	if (!kind || !(SITEMAP_KINDS as readonly string[]).includes(kind) || !hasDatabaseUrl()) {
		return new Response("Not found", { status: 404 });
	}
	const entries = await getSitemapEntries(kind as SitemapKind, chunk);
	if (entries.length === 0) return new Response("Not found", { status: 404 });
	return xmlResponse(
		urlSetXml(
			entries.map((entry) => ({
				loc: `${origin}${francePath(entry.path)}`,
				lastmod: entry.lastmod,
			})),
		),
	);
}
