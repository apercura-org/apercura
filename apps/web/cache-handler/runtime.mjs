// @ts-check
/**
 * What the two cache handlers share in the server process: whether Valkey is on, the one
 * connection and store, the build id, and the few Next.js internals the handlers fall back to.
 *
 * Valkey is used when, at run time, CACHE_REDIS_URL is set, NODE_ENV is `production` and this
 * is not `next build` (whose prerenders keep Next.js's own caches). Otherwise both handlers hand
 * every call to Next.js's built-in ones, exactly as without a custom handler: the file system
 * cache (`.next/server`, plus a 50 MB memory LRU) and the in-memory "use cache" handler.
 *
 *   CACHE_REDIS_URL          redis://host:6379 (rediss:// for TLS); unset or empty: off
 *   CACHE_REDIS_PASSWORD     optional, overrides the URL's password
 *   CACHE_REDIS_TIMEOUT_MS   connect and command timeout, default 150
 *   CACHE_DISK_MIN_FREE_MB   without Valkey: pages are no longer written to disk while the
 *                            disk has less free space than this (default 1024, 0: always)
 */
import { existsSync, readFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { CacheStore, nextMark, rateLimitedLog } from "./store.mjs";

const require = createRequire(import.meta.url);

/** Shared by every copy of this module, and read by `/api/revalidate` (src/server/shared-cache.ts). */
export const SHARED_CACHE_SYMBOL = Symbol.for("apercura.shared-cache");

export const log = rateLimitedLog();

/**
 * @typedef {{ url: string, password: string | undefined, timeoutMs: number }} ValkeyConfig
 */

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function integer(value, fallback, min, max) {
	if (value === undefined || value.trim() === "") return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * Valkey's settings, or null when the handlers keep Next.js's own caches.
 * @param {Record<string, string | undefined>} [env]
 * @returns {ValkeyConfig | null}
 */
export function valkeyConfig(env = process.env) {
	const url = env.CACHE_REDIS_URL?.trim();
	if (!url) return null;
	if (env.NODE_ENV !== "production") return null;
	if (env.NEXT_PHASE === "phase-production-build") return null;
	return {
		url,
		password: env.CACHE_REDIS_PASSWORD?.trim() || undefined,
		timeoutMs: integer(env.CACHE_REDIS_TIMEOUT_MS, 150, 10, 10_000),
	};
}

/**
 * The build id of the server this module runs in: `.next/BUILD_ID` in its working directory
 * (`apps/web`, for `next start` as for the standalone server). Null when there is none.
 * @param {readonly string[]} [candidates]
 * @returns {string | null}
 */
export function readBuildId(
	candidates = [path.join(/* turbopackIgnore: true */ process.cwd(), ".next", "BUILD_ID")],
) {
	for (const candidate of candidates) {
		try {
			const id = readFileSync(candidate, "utf8").trim();
			if (id) return id;
		} catch {
			// Next candidate.
		}
	}
	return null;
}

/**
 * @typedef {object} SharedCache
 * @property {Promise<CacheStore | null>} store
 * @property {() => Promise<boolean>} ping Whether Valkey answers (`/api/revalidate` asks
 *   before applying tags, so the import retries rather than loses them).
 */

/**
 * A connection with the settings above: short timeouts, no offline queue, no retry of a
 * command, reconnection in the background.
 * @param {ValkeyConfig} config
 */
export async function createValkeyClient(config) {
	const { Redis } = await import("ioredis");
	const client = new Redis(config.url, {
		...(config.password ? { password: config.password } : {}),
		connectionName: "apercura-web",
		connectTimeout: config.timeoutMs,
		commandTimeout: config.timeoutMs,
		// Fail at once while disconnected rather than queue: a miss is better than a wait.
		enableOfflineQueue: false,
		maxRetriesPerRequest: 0,
		// Reconnect in the background, up to every 5 seconds.
		retryStrategy: (times) => Math.min(100 * 2 ** Math.min(times, 6), 5000),
		// Concurrent requests' commands share round trips.
		enableAutoPipelining: true,
	});
	// Without a listener, a connection error would crash the process.
	client.on("error", (error) => log("connection", "Valkey connection error", error));
	return client;
}

/**
 * @param {ValkeyConfig} config
 * @returns {Promise<CacheStore | null>}
 */
async function connect(config) {
	const buildId = readBuildId();
	if (!buildId) {
		log("build-id", "no .next/BUILD_ID found: the Valkey cache is off");
		return null;
	}
	const client = await createValkeyClient(config);
	// The first request waits for the connection, a timeout at most, rather than miss.
	await new Promise((resolve) => {
		const timer = setTimeout(resolve, config.timeoutMs);
		client.once("ready", () => {
			clearTimeout(timer);
			resolve(undefined);
		});
	});
	return new CacheStore({
		client,
		prefix: `apercura:${buildId}:`,
		timeoutMs: config.timeoutMs,
		log,
	});
}

/**
 * The process's Valkey store, created on first use; null when Valkey is off.
 * @returns {Promise<CacheStore | null>}
 */
export function sharedStore() {
	const holder = /** @type {Record<symbol, SharedCache | undefined>} */ (
		/** @type {unknown} */ (globalThis)
	);
	const existing = holder[SHARED_CACHE_SYMBOL];
	if (existing) return existing.store;
	const config = valkeyConfig();
	if (!config) return Promise.resolve(null);
	const store = connect(config).catch((error) => {
		log("connect", "Valkey cache not started", error);
		return null;
	});
	holder[SHARED_CACHE_SYMBOL] = {
		store,
		ping: async () => {
			const ready = await store;
			return ready ? ready.ping() : false;
		},
	};
	return store;
}

/**
 * Next.js's in-process tag manifest, which its incremental cache reads to serve a page whose
 * tag is stale once more while it renders it again. Only when it is the very module the
 * server loaded (already in require's cache): a copy of it would be read by nobody.
 * @returns {Map<string, { stale?: number, expired?: number }> | null}
 */
export function nextTagsManifest() {
	try {
		const resolved = require.resolve(
			/* turbopackIgnore: true */ "next/dist/server/lib/incremental-cache/tags-manifest.external.js",
		);
		return require.cache[resolved]?.exports?.tagsManifest ?? null;
	} catch {
		return null;
	}
}

/** Tags this process copied into Next.js's manifest, oldest first (it is kept bounded). */
const copiedTags = new Set();
const MAX_COPIED_TAGS = 50_000;

/**
 * Copies tag marks into Next.js's manifest. False when the manifest is out of reach.
 * @param {Map<string, { stale?: number, expired?: number }>} marks
 */
export function copyMarksToNext(marks) {
	const manifest = nextTagsManifest();
	if (!manifest) return false;
	for (const [tag, mark] of marks) {
		manifest.set(tag, { ...manifest.get(tag), ...mark });
		copiedTags.delete(tag);
		copiedTags.add(tag);
	}
	while (copiedTags.size > MAX_COPIED_TAGS) {
		const oldest = copiedTags.values().next().value;
		copiedTags.delete(oldest);
		manifest.delete(oldest);
	}
	return true;
}

/**
 * Applies `revalidateTag`'s marks to Next.js's manifest too, as its own handlers do, so this
 * process sees them at once.
 * @param {readonly string[]} tags
 * @param {{ expire?: number } | undefined} durations
 */
export function markInNext(tags, durations) {
	const manifest = nextTagsManifest();
	if (!manifest) return;
	const now = Date.now();
	/** @type {Map<string, { stale?: number, expired?: number }>} */
	const marks = new Map();
	for (const tag of tags) marks.set(tag, nextMark(manifest.get(tag), durations, now));
	copyMarksToNext(marks);
}

/**
 * Next.js's file system cache (the default `cacheHandler`).
 * @returns {any}
 */
export function nextFileSystemCache() {
	return require(/* turbopackIgnore: true */ "next/dist/server/lib/incremental-cache/file-system-cache.js")
		.default;
}

/**
 * Next.js's in-memory "use cache" handler (the default `cacheHandlers.default`).
 * @param {number} maxSize
 * @returns {import("next/dist/server/lib/cache-handlers/types").CacheHandler}
 */
export function nextDefaultCacheHandler(maxSize) {
	return require(/* turbopackIgnore: true */ "next/dist/server/lib/cache-handlers/default.js").createDefaultCacheHandler(
		maxSize,
	);
}

/** Codes of a write that failed for lack of room or rights. */
const NO_ROOM = new Set(["ENOSPC", "EDQUOT", "EROFS", "EACCES", "EPERM"]);

/**
 * Without Valkey: whether pages may still be written to the disk. A free space below
 * CACHE_DISK_MIN_FREE_MB (checked at most every 10 seconds, off the request path), or a write
 * that just failed for lack of room or rights, stops the writes for a while: pages are then
 * kept in memory only, and served as usual.
 */
export class DiskGuard {
	#minFreeBytes;
	#now;
	#statfs;
	#checkedAt = Number.NEGATIVE_INFINITY;
	#checking = false;
	#lowSpace = false;
	#blockedUntil = 0;

	/**
	 * @param {{ minFreeBytes: number, now?: () => number,
	 *   statfs?: (dir: string) => Promise<{ bavail: number | bigint, bsize: number | bigint }> }} options
	 */
	constructor({ minFreeBytes, now = Date.now, statfs: stat = statfs }) {
		this.#minFreeBytes = minFreeBytes;
		this.#now = now;
		this.#statfs = stat;
	}

	/** @param {string | undefined} dir */
	mayWrite(dir) {
		const now = this.#now();
		if (now < this.#blockedUntil) return false;
		if (this.#minFreeBytes > 0 && dir && !this.#checking && now - this.#checkedAt >= 10_000) {
			this.#checking = true;
			this.#checkedAt = now;
			const target = existsSync(dir) ? dir : path.dirname(dir);
			this.#statfs(target)
				.then((stats) => {
					const free = Number(stats.bavail) * Number(stats.bsize);
					const low = free < this.#minFreeBytes;
					if (low && !this.#lowSpace) {
						log(
							"disk",
							`less than ${Math.round(this.#minFreeBytes / 1048576)} MB free: pages are no longer written to disk`,
						);
					}
					this.#lowSpace = low;
				})
				.catch(() => {
					// Unknown: leave the last answer.
				})
				.finally(() => {
					this.#checking = false;
				});
		}
		return !this.#lowSpace;
	}

	/** @param {unknown} error */
	failed(error) {
		const code = /** @type {{ code?: string }} */ (error)?.code;
		if (code && NO_ROOM.has(code)) this.#blockedUntil = this.#now() + 60_000;
	}
}

export const diskGuard = new DiskGuard({
	minFreeBytes: integer(process.env.CACHE_DISK_MIN_FREE_MB, 1024, 0, 10_000_000) * 1024 * 1024,
});
