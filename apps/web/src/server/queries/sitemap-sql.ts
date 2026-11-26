import type { Sql } from "@apercura/db";

/*
 * The sitemaps' queries, without the cache: the sitemap routes run them through the cached
 * functions of `./sitemap`, the cache warm-up (`jobs:tick warm`, outside Next.js) directly, so
 * both walk the same URLs.
 *
 * Sitemaps are built from the read models: only indexable, canonical URLs that answer 200,
 * with `lastmod` = the content's last change. Each kind is split in chunks by id range (ids
 * `[k * 20,000, (k + 1) * 20,000)`), so a chunk never holds more than 20,000 URLs and keeps
 * its URLs as the data grows. Each market has its own files (`/sitemaps/{market}/…`): a
 * chunk counts and lists one market's rows only, as internal (French) paths that the routes
 * turn into the market's public paths (`marketPagePath`).
 */

export const SITEMAP_CHUNK = 20_000;

export const SITEMAP_KINDS = ["praticiens", "listes", "lieux", "etablissements"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

/** The markets with sitemaps, by their path segment. */
export const SITEMAP_MARKETS = ["fr", "at", "gb", "cz", "es"] as const;
export type SitemapMarket = (typeof SITEMAP_MARKETS)[number];

/** A non-empty chunk of a market: its latest change and how many URLs it lists. */
export type SitemapChunk = {
	market: SitemapMarket;
	kind: SitemapKind;
	chunk: number;
	lastmod: string;
	urls: number;
};
/** A path (internal French form, no locale prefix) and its last change (ISO date). */
export type SitemapEntry = { path: string; lastmod: string };

/** The cities whose page is their department's (Paris, Wien) never get a URL of their own. */
const NOT_CITY = (alias: string) =>
	`NOT (${alias}.country = 'FR' AND ${alias}.code = '75056') AND NOT (${alias}.country = 'AT' AND ${alias}.code = '90001')`;

/** Non-empty chunks of every kind and market, with the latest change in each. */
export function selectSitemapChunks(sql: Sql): Promise<SitemapChunk[]> {
	return sql<SitemapChunk[]>`
		SELECT lower(country) AS market, 'praticiens' AS kind,
			practitioner_id / ${SITEMAP_CHUNK} AS chunk,
			to_char(max(content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod,
			count(*)::integer AS urls
		FROM directory.practitioner_pages WHERE indexable
		GROUP BY 1, 3
		UNION ALL
		SELECT lower(lp.country), 'listes', lp.id / ${SITEMAP_CHUNK},
			to_char(max(lp.content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
			count(*)::integer
		FROM directory.landing_pages lp
		LEFT JOIN directory.places p ON p.id = lp.place_id
		WHERE lp.indexable AND (p.id IS NULL OR (${sql.unsafe(NOT_CITY("p"))}))
		GROUP BY 1, 3
		UNION ALL
		SELECT lower(lp.country), 'lieux', lp.place_id / ${SITEMAP_CHUNK},
			to_char(max(lp.content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
			count(DISTINCT lp.place_id)::integer
		FROM directory.landing_pages lp
		JOIN directory.places p ON p.id = lp.place_id AND ${sql.unsafe(NOT_CITY("p"))}
		WHERE lp.indexable
		GROUP BY 1, 3
		UNION ALL
		SELECT lower(pg.country), 'etablissements', s.id / ${SITEMAP_CHUNK},
			to_char(max(greatest(s.updated_at, pg.content_updated_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
			count(DISTINCT s.id)::integer
		FROM directory.sites s
		JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.practitioner_pages pg ON pg.practitioner_id = a.practitioner_id AND pg.indexable
		WHERE s.slug IS NOT NULL AND s.removed_at IS NULL
		GROUP BY 1, 3
		ORDER BY 1 DESC, 2, 3
	`;
}

/** The URLs of one chunk of a market, ordered by id. */
export function selectSitemapEntries(
	sql: Sql,
	market: SitemapMarket,
	kind: SitemapKind,
	chunk: number,
): Promise<SitemapEntry[]> {
	const from = chunk * SITEMAP_CHUNK;
	const to = from + SITEMAP_CHUNK;
	const country = market.toUpperCase();
	switch (kind) {
		case "praticiens":
			return sql<SitemapEntry[]>`
				SELECT '/praticien/' || slug AS path,
					to_char(content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.practitioner_pages
				WHERE indexable AND country = ${country}
					AND practitioner_id >= ${from} AND practitioner_id < ${to}
				ORDER BY practitioner_id
			`;
		case "listes":
			// The Paris and Wien cities have no listing page: their department page stands for
			// them (`/{listing}/75-paris/paris` answers 308), so they are never listed.
			return sql<SitemapEntry[]>`
				SELECT '/' || lp.listing_slug || CASE
						WHEN p.id IS NULL THEN ''
						WHEN p.kind IN ('department', 'region') THEN '/' || p.slug
						ELSE '/' || d.slug || '/' || p.slug
					END AS path,
					to_char(lp.content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.landing_pages lp
				LEFT JOIN directory.places p ON p.id = lp.place_id
				LEFT JOIN directory.places d ON d.country = p.country AND d.kind = 'department'
					AND d.code = p.department_code
				WHERE lp.indexable AND lp.country = ${country} AND lp.id >= ${from} AND lp.id < ${to}
					AND (p.id IS NULL OR (${sql.unsafe(NOT_CITY("p"))}))
					AND (p.id IS NULL OR p.kind IN ('department', 'region') OR d.id IS NOT NULL)
				ORDER BY lp.id
			`;
		case "lieux":
			// A place hub is indexable when at least one of its listing pages is.
			return sql<SitemapEntry[]>`
				SELECT CASE WHEN p.kind IN ('department', 'region') THEN '/annuaire/' || p.slug
						ELSE '/annuaire/' || d.slug || '/' || p.slug END AS path,
					to_char(max(lp.content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id AND (${sql.unsafe(NOT_CITY("p"))})
				LEFT JOIN directory.places d ON d.country = p.country AND d.kind = 'department'
					AND d.code = p.department_code
				WHERE lp.indexable AND lp.country = ${country}
					AND lp.place_id >= ${from} AND lp.place_id < ${to}
					AND (p.kind IN ('department', 'region') OR d.id IS NOT NULL)
				GROUP BY p.id, p.kind, p.slug, d.slug
				ORDER BY p.id
			`;
		case "etablissements":
			return sql<SitemapEntry[]>`
				SELECT '/etablissement/' || s.slug AS path,
					to_char(max(greatest(s.updated_at, pg.content_updated_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
						AS lastmod
				FROM directory.sites s
				JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL AND NOT a.hidden
					AND a.practice_kind IN ('office', 'health_center', 'hospital')
				JOIN directory.practitioner_pages pg ON pg.practitioner_id = a.practitioner_id
					AND pg.indexable AND pg.country = ${country}
				WHERE s.slug IS NOT NULL AND s.removed_at IS NULL AND s.id >= ${from} AND s.id < ${to}
				GROUP BY s.id, s.slug
				ORDER BY s.id
			`;
	}
}
