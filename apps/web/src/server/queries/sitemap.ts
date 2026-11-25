import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import {
	SITEMAP_KINDS,
	type SitemapChunk,
	type SitemapEntry,
	type SitemapKind,
	type SitemapMarket,
	selectSitemapChunks,
	selectSitemapEntries,
} from "./sitemap-sql";

/*
 * The sitemaps' cached queries (the SQL lives in `./sitemap-sql`, shared with the cache
 * warm-up). Expired with the read models they list and at once by the `sitemap` tag, which
 * the import sends with any change.
 */

/**
 * Five minutes at most, whatever happens to the tags. The in-memory "use cache" handler of
 * a production server drops an entry past its `revalidate`, so a sitemap can never lag
 * behind the data longer than that, even when a revalidation does not reach it (issue #97:
 * Next.js compares cache entries and tag marks taken from two different clocks). A query
 * per sitemap file every five minutes, when it is requested, is cheap.
 */
const SITEMAP_CACHE_LIFE = { stale: 300, revalidate: 300, expire: 3600 };

export {
	SITEMAP_CHUNK,
	SITEMAP_KINDS,
	SITEMAP_MARKETS,
	type SitemapChunk,
	type SitemapEntry,
	type SitemapKind,
	type SitemapMarket,
} from "./sitemap-sql";

const tagsOf = (kind: SitemapKind) =>
	kind === "praticiens"
		? [cacheTags.coarse.practitioner]
		: kind === "etablissements"
			? [cacheTags.coarse.site, cacheTags.coarse.practitioner]
			: [cacheTags.coarse.listing, cacheTags.coarse.place];

/** Non-empty chunks of every kind, with the latest change in each. */
export async function getSitemapChunks(): Promise<SitemapChunk[]> {
	"use cache";
	cacheLife(SITEMAP_CACHE_LIFE);
	cacheTag(cacheTags.sitemap, ...SITEMAP_KINDS.flatMap(tagsOf));
	return selectSitemapChunks(getSql());
}

/** The URLs of one chunk of a market, ordered by id. */
export async function getSitemapEntries(
	market: SitemapMarket,
	kind: SitemapKind,
	chunk: number,
): Promise<SitemapEntry[]> {
	"use cache";
	cacheLife(SITEMAP_CACHE_LIFE);
	cacheTag(cacheTags.sitemap, ...tagsOf(kind));
	return selectSitemapEntries(getSql(), market, kind, chunk);
}
