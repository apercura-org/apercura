import "server-only";
import { IMPORT_LOCK_KEY } from "@apercura/core";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { describeError } from "~/trpc/error-redaction";
import { recordAudit } from "../audit";
import { cacheTags } from "../cache-tags";
import { drainStorageDeletions } from "../claims/service";
import type { Executor, Transaction } from "../db-executor";
import { expireTag, type Revalidate } from "../refresh";
import type { StorageDriver } from "../storage";

/*
 * Data minimisation once a removal is confirmed (#116, GDPR art. 5(1)(c)): only the suppression
 * stays. `directory.purge_suppressed_practitioners` (migrations 0023 to 0025) does the deleting,
 * in the caller's transaction; this module runs it, records it in the platform audit log, then
 * does what the database cannot do itself: expiring the cache tags, rebuilding the listing
 * counts (or queueing that rebuild for `jobs:tick` while an import runs) and deleting the
 * storage objects.
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
	/** Claims deleted from the kept rows (all but the owner's verified one). */
	claims: number;
	/** Cache tags to expire: pages, listings and establishments, computed before the purge. */
	tags: string[];
};

const NOTHING: Purge = { deleted: 0, kept: 0, sites: 0, objects: 0, claims: 0, tags: [] };

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
	return { ...NOTHING, ...row?.purge };
}

/**
 * Appends a `practitioner.purge` event to the platform audit log when the purge found a
 * suppressed practitioner: who triggered it, on what (the removal request, or the account of
 * the owner), and the counts. Never a practitioner id, a name or a national id: the event
 * outlives the data it records the deletion of.
 */
export async function recordPurge(
	db: Executor,
	purge: Purge,
	entry: { actor: string; subjectType: string; subjectId: string; headers?: Headers },
) {
	if (purge.deleted + purge.kept === 0) return;
	await recordAudit(db, {
		...entry,
		action: "practitioner.purge",
		details: {
			deleted: purge.deleted,
			kept: purge.kept,
			sites: purge.sites,
			objects: purge.objects,
			claims: purge.claims,
		},
	});
}

/**
 * Whether an import holds its advisory lock (in this database), read from `pg_locks` without
 * taking it: a removal must not start then (see `removalTransaction` in `./service`), and taking
 * the lock, even for a moment, would make an import starting at that moment fail.
 */
export async function importRunning(db: Executor) {
	const [row] = await db.execute<{ running: boolean }>(sql`
		select exists (
			select 1 from pg_locks
			where locktype = 'advisory' and granted and objsubid = 1
				and database = (select oid from pg_database where datname = current_database())
				and classid = (${IMPORT_LOCK_KEY}::bigint >> 32)::oid
				and objid = (${IMPORT_LOCK_KEY}::bigint & 4294967295)::oid
		) as running
	`);
	return row?.running ?? false;
}

/** The rows of `directory.landing_refresh_requests`: the listings concerned and the sitemaps. */
function queuedTags(listingTags: readonly string[]) {
	return [...new Set([...listingTags, cacheTags.sitemap])];
}

/**
 * Leaves the rebuild of the listing counts to `jobs:tick landing-counts`, with the cache tags
 * to expire once it is done.
 */
export async function queueLandingRefresh(db: Executor, listingTags: readonly string[]) {
	await db.execute(sql`
		insert into directory.landing_refresh_requests (tag)
		values ${sql.join(
			queuedTags(listingTags).map((tag) => sql`(${tag})`),
			sql`, `,
		)}
		on conflict (tag) do nothing
	`);
}

/** Rebuilds the counts under the import's lock; false, without waiting, when an import holds it. */
async function rebuildUnderImportLock(
	tx: Transaction,
	listingTags: readonly string[],
): Promise<boolean> {
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
}

/**
 * Rebuilds the listing pages' counts (`directory.refresh_landing_pages`) unless an import is
 * running: it holds the lock, and may already have rebuilt them before this removal committed.
 * Then the rebuild is queued for `jobs:tick landing-counts` (`queueLandingRefresh`), and this
 * returns false. The listings drop the practitioner at once either way: they read
 * `practitioners` live.
 */
export async function refreshLandingCounts(db: Database, listingTags: readonly string[]) {
	const done = await db.transaction((tx) => rebuildUnderImportLock(tx, listingTags));
	if (!done) await queueLandingRefresh(db, listingTags);
	return done;
}

/** Rolls back the queued rebuild's transaction when an import holds the lock. */
class ImportHoldsLock extends Error {
	constructor() {
		super("IMPORT_HOLDS_LOCK");
		this.name = "ImportHoldsLock";
	}
}

/**
 * `jobs:tick landing-counts`: the queued rebuild, once no import holds the lock. The requests are
 * deleted before the rebuild, in its transaction: one queued while it runs waits for the next
 * tick, never goes unbuilt. Their tags are sent after the commit (`revalidate`, best effort).
 */
export async function runQueuedLandingRefresh(
	db: Database,
	revalidate: (tags: readonly string[]) => Promise<number>,
) {
	const [pending] = await db.execute<{ queued: number }>(
		sql`select count(*)::integer as queued from directory.landing_refresh_requests`,
	);
	const queued = pending?.queued ?? 0;
	// The import's lock is only tried when there is something to do.
	if (queued === 0) return { queued, rebuilt: false, revalidated: 0 };
	const tags = await db
		.transaction(async (tx) => {
			const rows = await tx.execute<{ tag: string }>(
				sql`delete from directory.landing_refresh_requests returning tag`,
			);
			const taken = [...rows].map((row) => row.tag);
			const listings = taken.filter((tag) => tag.startsWith("listing:"));
			if (taken.length === 0) return [];
			if (!(await rebuildUnderImportLock(tx, listings))) {
				// Rolled back with the deletion: the requests stay for the next tick.
				throw new ImportHoldsLock();
			}
			return taken;
		})
		.catch((error: unknown) => {
			if (error instanceof ImportHoldsLock) return null;
			throw error;
		});
	if (tags === null) return { queued, rebuilt: false, revalidated: 0 };
	return { queued, rebuilt: tags.length > 0, revalidated: await revalidate(tags) };
}

/**
 * After the transaction that purged: expires the pages' tags, rebuilds the listing counts
 * (queued for `jobs:tick` while an import runs, or when the rebuild fails), then expires the
 * listings and the sitemaps, and deletes the queued storage objects. Best effort past the
 * commit: a failure is logged, and `jobs:tick` (counts, objects) finishes the work.
 */
export async function afterPurge(
	db: Database,
	purge: Purge,
	options: { storage: StorageDriver | null; revalidate?: Revalidate },
) {
	const revalidate = options.revalidate ?? expireTag;
	const listings = purge.tags.filter((tag) => tag.startsWith("listing:"));
	for (const tag of purge.tags) if (!tag.startsWith("listing:")) revalidate(tag);
	const objects =
		purge.objects > 0 && options.storage
			? drainStorageDeletions(db, options.storage).catch((error: unknown) => {
					console.error(`Storage deletions left to jobs:tick: ${describeError(error)}`);
				})
			: null;
	if (purge.deleted + purge.kept > 0) {
		try {
			await refreshLandingCounts(db, listings);
		} catch (error) {
			console.error(`Listing counts left to jobs:tick: ${describeError(error)}`);
			await queueLandingRefresh(db, listings).catch((queueError: unknown) => {
				console.error(`Listing counts left to the next import: ${describeError(queueError)}`);
			});
		}
	}
	// After the rebuild, so a listing rendered again shows the new counts.
	for (const tag of listings) revalidate(tag);
	revalidate(cacheTags.sitemap);
	await objects;
}
