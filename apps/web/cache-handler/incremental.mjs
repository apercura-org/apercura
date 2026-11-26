// @ts-check
/**
 * The incremental cache handler (`cacheHandler` in next.config.ts): rendered pages (HTML, RSC
 * payload and segments), route handlers' responses and fetch results.
 *
 * With Valkey on (./runtime.mjs), entries live in Valkey only, bounded by its `maxmemory` and
 * LRU policy: nothing is written to `.next/server/route-cache` any more. A page whose tag was
 * marked stale is served once more while Next.js renders it again (its tag marks are copied
 * into Next.js's manifest, which its incremental cache reads); one whose tag expired is a miss.
 * Any Valkey failure is a miss: Next.js renders the page, as on its first visit.
 *
 * With Valkey off, every call goes to Next.js's file system cache, as without this handler,
 * with two guards: a write that fails (full or read-only disk) is dropped quietly, and no page
 * is written to a disk short of space (CACHE_DISK_MIN_FREE_MB). Pages are then served from its
 * memory LRU or rendered: never an error.
 *
 * Next.js creates one instance per request; the connection is the process's (./runtime.mjs).
 */
import {
	copyMarksToNext,
	diskGuard,
	log,
	markInNext,
	nextFileSystemCache,
	sharedStore,
	valkeyConfig,
} from "./runtime.mjs";
import { isExpired, isStale } from "./store.mjs";

/** Next.js's header listing a page's or route's tags. */
const TAGS_HEADER = "x-next-cache-tags";

/**
 * @typedef {import("next/dist/server/lib/incremental-cache").CacheHandlerContext} CacheHandlerContext
 * @typedef {import("next/dist/server/lib/incremental-cache").CacheHandlerValue} CacheHandlerValue
 * @typedef {import("next/dist/server/response-cache/types").IncrementalCacheValue} IncrementalCacheValue
 */

/**
 * @typedef {object} StoredEntry
 * @property {number} lastModified
 * @property {any} value
 * @property {any} [cacheControl]
 * @property {string[]} [tags] A fetch entry's tags (pages and routes carry theirs in a header).
 */

/**
 * The tags an entry is invalidated by.
 * @param {StoredEntry} stored
 * @param {any} ctx
 * @returns {string[]}
 */
export function entryTags(stored, ctx) {
	const value = stored.value;
	if (value?.kind === "FETCH") return [...(ctx?.tags ?? []), ...(ctx?.softTags ?? [])];
	const header = value?.headers?.[TAGS_HEADER];
	if (typeof header === "string" && header) return header.split(",");
	return [];
}

/*
 * Values are stored and given back whole, as Next.js's own memory cache in front of the disk
 * does (its disk copy leaves out the RSC payload of a partially prerendered page, which every
 * page is with Cache Components: read back from the disk alone, such a page is a miss).
 */

/**
 * How long Valkey keeps an entry: its `expire` (Next.js treats it as gone after that anyway),
 * else no time limit, and the LRU evicts it.
 * @param {any} data
 * @param {any} ctx
 */
export function ttlSeconds(data, ctx) {
	const expire = ctx?.cacheControl?.expire;
	if (typeof expire === "number" && Number.isFinite(expire) && expire > 0) return expire;
	if (data?.kind === "FETCH" && typeof data.revalidate === "number" && data.revalidate > 0) {
		// A fetch entry may be served stale for a while: twice its revalidate time.
		return data.revalidate * 2;
	}
	return 0;
}

export default class ApercuraCacheHandler {
	/** @type {any} */ #fallback = null;

	/** @param {CacheHandlerContext} ctx */
	constructor(ctx) {
		if (!valkeyConfig()) {
			const FileSystemCache = nextFileSystemCache();
			this.#fallback = new FileSystemCache({
				...ctx,
				flushToDisk: Boolean(ctx.flushToDisk) && diskGuard.mayWrite(ctx.serverDistDir),
			});
		}
	}

	/**
	 * @param {string} key
	 * @param {any} ctx
	 * @returns {Promise<CacheHandlerValue | null>}
	 */
	async get(key, ctx) {
		if (this.#fallback) {
			try {
				return await this.#fallback.get(key, ctx);
			} catch (error) {
				log("disk-read", "page cache read failed, treated as a miss", error);
				return null;
			}
		}
		const store = await sharedStore();
		if (!store) return null;
		const stored = /** @type {StoredEntry | undefined} */ (await store.read("route", key));
		if (!stored || typeof stored.lastModified !== "number") return null;
		const value = stored.value;
		if (!value) return null;
		const tags = entryTags(stored, ctx);
		if (tags.length > 0) {
			const marks = await store.tagMarks(tags);
			if (marks.size > 0) {
				const now = Date.now();
				for (const mark of marks.values()) {
					if (isExpired(mark, stored.lastModified, now)) return null;
				}
				const stale = [...marks.values()].some((mark) => isStale(mark, stored.lastModified));
				// Next.js serves it stale, and renders it again, once its manifest knows the
				// marks; if it cannot be told, a fresh render rather than an outdated page.
				if (stale && !copyMarksToNext(marks)) return null;
			}
		}
		return {
			lastModified: stored.lastModified,
			value,
			...(stored.cacheControl ? { cacheControl: stored.cacheControl } : {}),
		};
	}

	/**
	 * @param {string} key
	 * @param {IncrementalCacheValue | null} data
	 * @param {any} ctx
	 */
	async set(key, data, ctx) {
		if (this.#fallback) {
			try {
				await this.#fallback.set(key, data, ctx);
			} catch (error) {
				diskGuard.failed(error);
				log("disk-write", "page not written to the disk cache (served as usual)", error);
			}
			return;
		}
		if (!data || data.kind === "IMAGE") return;
		const store = await sharedStore();
		if (!store) return;
		/** @type {StoredEntry} */
		const entry = {
			lastModified: Date.now(),
			value: data,
			...(!ctx?.fetchCache && ctx?.cacheControl ? { cacheControl: ctx.cacheControl } : {}),
			...(ctx?.fetchCache && ctx.tags ? { tags: ctx.tags } : {}),
		};
		await store.write("route", key, entry, ttlSeconds(data, ctx));
	}

	/**
	 * @param {string | string[]} tags
	 * @param {{ expire?: number }} [durations]
	 */
	async revalidateTag(tags, durations) {
		const list = typeof tags === "string" ? [tags] : tags;
		if (this.#fallback) return this.#fallback.revalidateTag(list, durations);
		if (list.length === 0) return;
		markInNext(list, durations);
		const store = await sharedStore();
		await store?.markTags(list, durations);
	}

	resetRequestCache() {
		this.#fallback?.resetRequestCache?.();
	}
}
