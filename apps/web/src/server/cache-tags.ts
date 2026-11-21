/**
 * Cache tags shared with the import (`packages/etl`), which enqueues them in
 * `directory.invalidation_outbox` and sends them to `/api/revalidate`.
 *
 * Above 20,000 changes the import sends the coarse `{kind}:*` tags instead,
 * so every cached query tags itself with both the precise and the coarse tag.
 */
export const cacheTags = {
	practitioner: (id: number) => `practitioner:${id}`,
	/** Same key as `directory.landing_pages.key`: `{listing slug}:{place id | fr}`. */
	listing: (listingSlug: string, placeId: number | null) =>
		`listing:${listingSlug}:${placeId ?? "fr"}`,
	site: (id: number) => `site:${id}`,
	place: (id: number) => `place:${id}`,
	coarse: {
		practitioner: "practitioner:*",
		listing: "listing:*",
		site: "site:*",
		place: "place:*",
	},
} as const;
