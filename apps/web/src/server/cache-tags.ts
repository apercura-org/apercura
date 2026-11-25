import { SITEMAP_CACHE_TAG } from "@apercura/core/revalidation";

/**
 * Cache tags shared with the import (`packages/etl`), which enqueues them in
 * `directory.invalidation_outbox` and sends them to `/api/revalidate`.
 *
 * Above 20,000 changes the import sends the coarse `{kind}:*` tags instead,
 * so every cached query tags itself with both the precise and the coarse tag.
 */
export const cacheTags = {
	practitioner: (id: number) => `practitioner:${id}`,
	/**
	 * Same key as `directory.landing_pages.key`: `{listing slug}:{place id | country}`,
	 * the country lowercase for a market-wide listing (`cardiologue:fr`, `kardiologie:at`).
	 */
	listing: (listingSlug: string, placeId: number | null, country = "FR") =>
		`listing:${listingSlug}:${placeId ?? country.toLowerCase()}`,
	site: (id: number) => `site:${id}`,
	place: (id: number) => `place:${id}`,
	/**
	 * Every sitemap query: expired when the app changes what is indexable, and sent by the
	 * import with any change.
	 */
	sitemap: SITEMAP_CACHE_TAG,
	coarse: {
		practitioner: "practitioner:*",
		listing: "listing:*",
		site: "site:*",
		place: "place:*",
	},
} as const;

/**
 * How `/api/revalidate` expires a tag. Pages and their data are marked stale (`max`): the
 * next visitor (or the cache warm-up) gets the old copy once and triggers the render, so an
 * import that touches 400,000 pages never makes every visitor wait. The sitemaps are expired
 * at once (`expire: 0`): the next request reads the new data. A crawler rarely comes back
 * for them, and the copy it would get otherwise is the one from before the import.
 */
export function revalidationProfile(tag: string): "max" | { expire: number } {
	return tag === cacheTags.sitemap ? { expire: 0 } : "max";
}
