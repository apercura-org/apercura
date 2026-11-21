import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";
import { STATIC_PATHS, urlSetXml, xmlResponse } from "~/lib/sitemap-xml";
import { hasDatabaseUrl } from "~/server/db";
import { getSitemapEntries, SITEMAP_KINDS, type SitemapKind } from "~/server/queries/sitemap";

const FILE = /^([a-z]+)-(\d{1,6})\.xml$/;

/** One sitemap chunk: `/sitemaps/{kind}-{chunk}.xml` (at most 20,000 URLs). */
export async function GET(_request: Request, { params }: RouteContext<"/sitemaps/[file]">) {
	await connection();
	const { file } = await params;
	const match = FILE.exec(file);
	const kind = match?.[1];
	const chunk = Number(match?.[2]);
	const origin = siteOrigin();
	if (kind === "pages" && chunk === 0) {
		return xmlResponse(urlSetXml(STATIC_PATHS.map((path) => ({ loc: `${origin}${path}` }))));
	}
	if (!kind || !(SITEMAP_KINDS as readonly string[]).includes(kind) || !hasDatabaseUrl()) {
		return new Response("Not found", { status: 404 });
	}
	const entries = await getSitemapEntries(kind as SitemapKind, chunk);
	if (entries.length === 0) return new Response("Not found", { status: 404 });
	return xmlResponse(
		urlSetXml(entries.map((entry) => ({ loc: `${origin}${entry.path}`, lastmod: entry.lastmod }))),
	);
}
