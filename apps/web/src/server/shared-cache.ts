/**
 * The shared page cache (Valkey, `apps/web/cache-handler`) as the app's own code sees it.
 *
 * The cache handlers live outside the app's bundle (Next.js loads them from
 * `apps/web/cache-handler`), so they register themselves on a global symbol rather than being
 * imported: `/api/revalidate` asks it whether Valkey can take tag marks before applying any.
 */

/** Same symbol as `SHARED_CACHE_SYMBOL` in cache-handler/runtime.mjs. */
const SHARED_CACHE = Symbol.for("apercura.shared-cache");

type SharedCache = { ping: () => Promise<boolean> };

/**
 * Whether revalidated tags can be recorded now: false only when the Valkey cache is on and does
 * not answer. Without it (Next.js's own caches, or the handlers not loaded yet) there is nothing
 * to wait for.
 */
export async function sharedCacheWritable(scope: object = globalThis): Promise<boolean> {
	const cache = (scope as Record<symbol, SharedCache | undefined>)[SHARED_CACHE];
	if (!cache) return true;
	try {
		return await cache.ping();
	} catch {
		return false;
	}
}
