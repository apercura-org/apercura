// @ts-check
/**
 * The "use cache" handler (`cacheHandlers.default` and `.remote` in next.config.ts): the
 * results of the cached queries (src/server/queries).
 *
 * With Valkey on (./runtime.mjs), entries live in Valkey and behave as Next.js's in-memory
 * handler does in production: an entry is dropped past its `revalidate` time (so a sitemap
 * never lags more than its five minutes, src/server/queries/sitemap.ts), one with a stale tag
 * is served once more while it is computed again, one with an expired tag is a miss, and an
 * `expire: 0` entry (dynamic) is not stored. The request's implicit tags are checked here too
 * (`getExpiration` answers Infinity, as the interface asks of a handler that does so). Any
 * Valkey failure is a miss, and the query runs.
 *
 * With Valkey off, every call goes to Next.js's in-memory handler (50 MB), as without this one.
 */
import { log, markInNext, nextDefaultCacheHandler, sharedStore, valkeyConfig } from "./runtime.mjs";
import { isExpired, isStale } from "./store.mjs";

/**
 * @typedef {import("next/dist/server/lib/cache-handlers/types").CacheHandler} CacheHandler
 * @typedef {import("next/dist/server/lib/cache-handlers/types").CacheEntry} CacheEntry
 */

/**
 * @typedef {object} StoredData
 * @property {string[]} tags
 * @property {number} stale
 * @property {number} timestamp Next.js's own creation time (its clock).
 * @property {number} expire
 * @property {number} revalidate
 * @property {number} storedAt When `set` was called (Date.now, the clock of the tag marks).
 * @property {Buffer} value
 */

/** Next.js's default `cacheMaxMemorySize`, which sizes its in-memory handler. */
const NEXT_MEMORY_CACHE_BYTES = 50 * 1024 * 1024;

/** Next.js's clock for `timestamp`. */
const nextNow = () => performance.timeOrigin + performance.now();

/**
 * @param {ReadableStream<Uint8Array>} stream
 * @returns {Promise<Buffer>}
 */
async function readAll(stream) {
	/** @type {Uint8Array[]} */
	const chunks = [];
	const reader = stream.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

/**
 * @param {Buffer} buffer
 * @returns {ReadableStream<Uint8Array>}
 */
function streamOf(buffer) {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(buffer));
			controller.close();
		},
	});
}

/**
 * Seconds Valkey keeps an entry: until it is dropped anyway (`revalidate`, within `expire`).
 * @param {{ revalidate: number, expire: number }} entry
 */
export function dataTtlSeconds(entry) {
	const limits = [entry.revalidate, entry.expire].filter(
		(value) => typeof value === "number" && Number.isFinite(value) && value > 0,
	);
	return limits.length > 0 ? Math.min(...limits) : 0;
}

/**
 * A "use cache" handler backed by Valkey (`sharedStore`), as described above.
 * @param {{ store: () => Promise<import("./store.mjs").CacheStore | null>,
 *   now?: () => number, wallNow?: () => number }} options
 * @returns {CacheHandler}
 */
export function createValkeyDataHandler({ store, now = nextNow, wallNow = Date.now }) {
	/** Sets in progress: a `get` of the same key waits for them (the interface requires it). */
	/** @type {Map<string, Promise<void>>} */
	const pending = new Map();

	return {
		async get(cacheKey, softTags) {
			const inProgress = pending.get(cacheKey);
			if (inProgress) await inProgress;
			const cache = await store();
			if (!cache) return undefined;
			const stored = /** @type {StoredData | undefined} */ (await cache.read("data", cacheKey));
			if (!stored || !Buffer.isBuffer(stored.value)) return undefined;
			if (now() > stored.timestamp + stored.revalidate * 1000) return undefined;
			let revalidate = stored.revalidate;
			const tags = [...stored.tags, ...softTags];
			if (tags.length > 0) {
				const marks = await cache.tagMarks(tags);
				const at = wallNow();
				for (const mark of marks.values()) {
					if (isExpired(mark, stored.storedAt, at)) return undefined;
				}
				if ([...marks.values()].some((mark) => isStale(mark, stored.storedAt))) revalidate = -1;
			}
			return {
				value: streamOf(stored.value),
				tags: stored.tags,
				stale: stored.stale,
				timestamp: stored.timestamp,
				expire: stored.expire,
				revalidate,
			};
		},

		async set(cacheKey, pendingEntry) {
			const storedAt = wallNow();
			/** @type {() => void} */
			let done = () => {};
			const marker = new Promise((resolve) => {
				done = () => resolve(undefined);
			});
			pending.set(cacheKey, /** @type {Promise<void>} */ (marker));
			try {
				const entry = await pendingEntry;
				const value = await readAll(entry.value);
				// Dynamic: computed again on every read, never served from a store.
				if (entry.expire === 0) return;
				const cache = await store();
				if (!cache) return;
				/** @type {StoredData} */
				const stored = {
					tags: entry.tags,
					stale: entry.stale,
					timestamp: entry.timestamp,
					expire: entry.expire,
					revalidate: entry.revalidate,
					storedAt,
					value,
				};
				await cache.write("data", cacheKey, stored, dataTtlSeconds(entry));
			} catch (error) {
				// A failed or partial computation: nothing is stored, the next read computes it.
				log("data-set", "cache entry not stored", error);
			} finally {
				if (pending.get(cacheKey) === marker) pending.delete(cacheKey);
				done();
			}
		},

		async refreshTags() {
			// Tag marks are read with each entry.
		},

		async getExpiration() {
			// The implicit tags are checked in `get`.
			return Number.POSITIVE_INFINITY;
		},

		async updateTags(tags, durations) {
			if (tags.length === 0) return;
			markInNext(tags, durations);
			const cache = await store();
			await cache?.markTags(tags, durations);
		},
	};
}

/** @type {CacheHandler} */
const handler = valkeyConfig()
	? createValkeyDataHandler({ store: sharedStore })
	: nextDefaultCacheHandler(NEXT_MEMORY_CACHE_BYTES);

export default handler;
