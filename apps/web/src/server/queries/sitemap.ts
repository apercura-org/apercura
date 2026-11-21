import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";

/*
 * Sitemaps are built from the read models: only indexable, canonical URLs that
 * answer 200, with `lastmod` = the content's last change. Each kind is split
 * in chunks by id range (ids `[k * 20,000, (k + 1) * 20,000)`), so a chunk
 * never holds more than 20,000 URLs and keeps its URLs as the data grows.
 */

export const SITEMAP_CHUNK = 20_000;

export const SITEMAP_KINDS = ["praticiens", "listes", "lieux", "etablissements"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export type SitemapChunk = { kind: SitemapKind; chunk: number; lastmod: string };
/** A path (French, no locale prefix) and its last change (ISO date). */
export type SitemapEntry = { path: string; lastmod: string };

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
	const sql = getSql();
	return sql<SitemapChunk[]>`
		SELECT 'praticiens' AS kind, practitioner_id / ${SITEMAP_CHUNK} AS chunk,
			to_char(max(content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
		FROM directory.practitioner_pages WHERE indexable
		GROUP BY 2
		UNION ALL
		SELECT 'listes', id / ${SITEMAP_CHUNK},
			to_char(max(content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
		FROM directory.landing_pages WHERE indexable
		GROUP BY 2
		UNION ALL
		SELECT 'lieux', place_id / ${SITEMAP_CHUNK},
			to_char(max(content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
		FROM directory.landing_pages WHERE indexable AND place_id IS NOT NULL
		GROUP BY 2
		UNION ALL
		SELECT 'etablissements', s.id / ${SITEMAP_CHUNK},
			to_char(max(greatest(s.updated_at, pg.content_updated_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
		FROM directory.sites s
		JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.practitioner_pages pg ON pg.practitioner_id = a.practitioner_id AND pg.indexable
		WHERE s.slug IS NOT NULL AND s.removed_at IS NULL
		GROUP BY 2
		ORDER BY 1, 2
	`;
}

/** The URLs of one chunk, ordered by id. */
export async function getSitemapEntries(kind: SitemapKind, chunk: number): Promise<SitemapEntry[]> {
	"use cache";
	cacheLife("hours");
	cacheTag(cacheTags.sitemap, ...tagsOf(kind));
	const sql = getSql();
	const from = chunk * SITEMAP_CHUNK;
	const to = from + SITEMAP_CHUNK;
	switch (kind) {
		case "praticiens":
			return sql<SitemapEntry[]>`
				SELECT '/praticien/' || slug AS path,
					to_char(content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.practitioner_pages
				WHERE indexable AND practitioner_id >= ${from} AND practitioner_id < ${to}
				ORDER BY practitioner_id
			`;
		case "listes":
			// The Paris city has no listing page: its department page stands for it.
			return sql<SitemapEntry[]>`
				SELECT '/' || lp.listing_slug || CASE
						WHEN p.id IS NULL THEN ''
						WHEN p.kind = 'department' THEN '/' || p.slug
						ELSE '/' || d.slug || '/' || p.slug
					END AS path,
					to_char(lp.content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.landing_pages lp
				LEFT JOIN directory.places p ON p.id = lp.place_id
				LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
				WHERE lp.indexable AND lp.id >= ${from} AND lp.id < ${to}
					AND (p.id IS NULL OR p.kind = 'department' OR d.id IS NOT NULL)
				ORDER BY lp.id
			`;
		case "lieux":
			// A place hub is indexable when at least one of its listing pages is.
			return sql<SitemapEntry[]>`
				SELECT CASE WHEN p.kind = 'department' THEN '/annuaire/' || p.slug
						ELSE '/annuaire/' || d.slug || '/' || p.slug END AS path,
					to_char(max(lp.content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS lastmod
				FROM directory.landing_pages lp
				JOIN directory.places p ON p.id = lp.place_id AND p.code <> '75056'
				LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
				WHERE lp.indexable AND lp.place_id >= ${from} AND lp.place_id < ${to}
					AND (p.kind = 'department' OR d.id IS NOT NULL)
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
					AND pg.indexable
				WHERE s.slug IS NOT NULL AND s.removed_at IS NULL AND s.id >= ${from} AND s.id < ${to}
				GROUP BY s.id, s.slug
				ORDER BY s.id
			`;
	}
}
