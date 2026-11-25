import "server-only";
import { IMPORT_LOCK_KEY } from "@apercura/core";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { cacheTags } from "../cache-tags";
import { drainStorageDeletions } from "../claims/service";
import type { Executor } from "../db-executor";
import { expireTag, type Revalidate } from "../refresh";
import type { StorageDriver } from "../storage";

/*
 * Data minimisation once a removal is confirmed (#116, GDPR art. 5(1)(c)): only the suppression
 * stays. `directory.purge_suppressed_practitioners` (migration 0023) does the deleting, in the
 * caller's transaction; this module runs it and then what the database cannot do itself:
 * expiring the cache tags, rebuilding the listing counts and deleting the storage objects.
 */

/** What `directory.purge_suppressed_practitioners` did. */
export type Purge = {
	/** Practitioner rows deleted. */
	deleted: number;
	/** Rows kept bare, held by an agenda or their owner's claim. */
	kept: number;
	/** Sites deleted because nobody linked to them any more. */
	sites: number;
	/** Storage objects queued in `directory.storage_deletions`. */
	objects: number;
	/** Cache tags to expire: pages, listings and establishments, computed before the purge. */
	tags: string[];
};

const NOTHING: Purge = { deleted: 0, kept: 0, sites: 0, objects: 0, tags: [] };

/**
 * Deletes what is stored about the given practitioners when a suppression covers them (and
 * nothing otherwise). Idempotent; run it in the transaction that adds the suppression.
 */
export async function purgeSuppressed(db: Executor, ids: readonly number[]): Promise<Purge> {
	const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
	if (unique.length === 0) return NOTHING;
	const [row] = await db.execute<{ purge: Purge }>(sql`
		select directory.purge_suppressed_practitioners(
			array[${sql.join(
				unique.map((id) => sql`${id}`),
				sql`, `,
			)}]::integer[]
		) as purge
	`);
	return row?.purge ?? NOTHING;
}

/**
 * Rebuilds the listing pages' counts (`directory.refresh_landing_pages`) unless an import is
 * running: it holds the lock, and rebuilds them itself before it commits. Returns false when it
 * left them to the import. The listings drop the practitioner at once either way: they read
 * `practitioners` live.
 */
export async function refreshLandingCounts(db: Database, listingTags: readonly string[]) {
	return db.transaction(async (tx) => {
		const [lock] = await tx.execute<{ locked: boolean }>(
			sql`select pg_try_advisory_xact_lock(${IMPORT_LOCK_KEY}) as locked`,
		);
		if (!lock?.locked) return false;
		await tx.execute(sql`select directory.refresh_landing_pages(null)`);
		// The caller expires these itself: keep the import's drain from sending them again.
		if (listingTags.length > 0) {
			await tx.execute(sql`
				delete from directory.invalidation_outbox
				where run_id is null and tag in (${sql.join(
					listingTags.map((tag) => sql`${tag}`),
					sql`, `,
				)})
			`);
		}
		return true;
	});
}

/**
 * After the transaction that purged: expires the tags (and the sitemaps), rebuilds the listing
 * counts and deletes the queued storage objects. Best effort past the commit: a failure is
 * logged, and the next import (counts) or `jobs:tick` (objects) finishes the work.
 */
export async function afterPurge(
	db: Database,
	purge: Purge,
	options: { storage: StorageDriver | null; revalidate?: Revalidate },
) {
	const revalidate = options.revalidate ?? expireTag;
	for (const tag of purge.tags) revalidate(tag);
	revalidate(cacheTags.sitemap);
	const listings = purge.tags.filter((tag) => tag.startsWith("listing:"));
	const steps: Promise<unknown>[] = [];
	if (purge.deleted + purge.kept > 0) {
		steps.push(
			refreshLandingCounts(db, listings).catch((error: unknown) => {
				console.error(`Listing counts left to the next import: ${String(error)}`);
			}),
		);
	}
	if (purge.objects > 0 && options.storage) {
		const storage = options.storage;
		steps.push(
			drainStorageDeletions(db, storage).catch((error: unknown) => {
				console.error(`Storage deletions left to jobs:tick: ${String(error)}`);
			}),
		);
	}
	await Promise.all(steps);
}
