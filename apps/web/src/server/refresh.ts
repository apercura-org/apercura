import "server-only";
import type { Sql } from "@apercura/db";
import { revalidateTag } from "next/cache";
import { cacheTags } from "./cache-tags";

export type Revalidate = (tag: string) => void;

/**
 * Expires a cache tag at once (`expire: 0`): the next visit renders fresh
 * data. Outside a Next.js request (tests, scripts) there is no cache to
 * expire, and Next.js throws an invariant error: ignored there.
 */
export const expireTag: Revalidate = (tag) => {
	try {
		revalidateTag(tag, { expire: 0 });
	} catch (error) {
		if (!(error instanceof Error && error.message.includes("static generation store missing"))) {
			throw error;
		}
	}
};

/**
 * Rebuilds the read models of some practitioners (indexable flag, page,
 * search document) after an app-side change, then expires their cache tags:
 * the practitioner pages, the listings and establishments that show them.
 */
export async function refreshPractitioners(
	sql: Sql,
	ids: readonly number[],
	revalidate: Revalidate = expireTag,
): Promise<string[]> {
	const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
	if (unique.length === 0) return [];
	const [row] = await sql<{ tags: string[] }[]>`
		SELECT directory.refresh_practitioner(${unique}::integer[]) AS tags
	`;
	const tags = row?.tags ?? [];
	for (const tag of tags) revalidate(tag);
	// Sitemaps list indexable pages: an owner edit or a withheld page changes them.
	revalidate(cacheTags.sitemap);
	return tags;
}
