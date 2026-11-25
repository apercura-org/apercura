import { connection } from "next/server";
import { FRANCE_SEGMENT } from "~/i18n/locales";
import { guidePaths } from "~/lib/guides/catalog";
import { siteOrigin } from "~/lib/site-url";
import { MARKET_STATIC_PATHS, marketPagePath, urlSetXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import {
	getSitemapEntries,
	SITEMAP_KINDS,
	SITEMAP_MARKETS,
	type SitemapKind,
	type SitemapMarket,
} from "~/server/queries/sitemap";

const FILE = /^([a-z]+)-(\d{1,6})\.xml$/;

/**
 * One sitemap chunk of a market: `/sitemaps/{market}/{kind}-{chunk}.xml` (at most 20,000
 * URLs), its indexable pages only, at the market's public paths. France (`fr`) and Austria
 * (`at`) are open.
 */
export async function GET(
	_request: Request,
	{ params }: RouteContext<"/sitemaps/[market]/[file]">,
) {
	await connection();
	const { market, file } = await params;
	if (!(SITEMAP_MARKETS as readonly string[]).includes(market)) {
		return new Response("Not found", { status: 404 });
	}
	const segment = market as SitemapMarket;
	const match = FILE.exec(file);
	const kind = match?.[1];
	const chunk = Number(match?.[2]);
	const origin = siteOrigin();
	if (kind === "pages" && chunk === 0) {
		// The static pages, then the guides with the date of their last change.
		return xmlResponse(
			urlSetXml([
				...MARKET_STATIC_PATHS[segment].map((path) => ({
					loc: `${origin}${marketPagePath(segment, path)}`,
				})),
				// The guides are French articles: France's sitemap only.
				...(segment === FRANCE_SEGMENT ? guidePaths() : []).map((guide) => ({
					loc: `${origin}${marketPagePath(segment, guide.path)}`,
					lastmod: guide.lastmod,
				})),
			]),
		);
	}
	if (!kind || !(SITEMAP_KINDS as readonly string[]).includes(kind) || !hasDatabaseUrl()) {
		return new Response("Not found", { status: 404 });
	}
	const entries = await getSitemapEntries(segment, kind as SitemapKind, chunk);
	if (entries.length === 0) return new Response("Not found", { status: 404 });
	return xmlResponse(
		urlSetXml(
			entries.map((entry) => ({
				loc: `${origin}${marketPagePath(segment, entry.path)}`,
				lastmod: entry.lastmod,
			})),
		),
	);
}
