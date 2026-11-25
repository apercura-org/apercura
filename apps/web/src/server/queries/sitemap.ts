import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import {
	SITEMAP_KINDS,
	type SitemapChunk,
	type SitemapEntry,
	type SitemapKind,
	selectSitemapChunks,
	selectSitemapEntries,
} from "./sitemap-sql";

/*
 * The sitemaps' cached queries (the SQL lives in `./sitemap-sql`, shared with the cache
 * warm-up). Cached for hours and expired with the read models they list.
 */

export {
	SITEMAP_CHUNK,
	SITEMAP_KINDS,
	type SitemapChunk,
	type SitemapEntry,
	type SitemapKind,
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
	cacheLife("hours");
	cacheTag(cacheTags.sitemap, ...SITEMAP_KINDS.flatMap(tagsOf));
	return selectSitemapChunks(getSql());
}

/** The URLs of one chunk, ordered by id. */
export async function getSitemapEntries(kind: SitemapKind, chunk: number): Promise<SitemapEntry[]> {
	"use cache";
	cacheLife("hours");
	cacheTag(cacheTags.sitemap, ...tagsOf(kind));
	return selectSitemapEntries(getSql(), kind, chunk);
}
