// @ts-check
/**
 * The Valkey side of the cache handlers: entries, tag marks, timeouts and failure handling.
 *
 * Keys (`prefix` is `apercura:{build id}:`, so a deploy never serves a page of the previous
 * build, whose scripts are gone, and the old keys age out of the LRU):
 *
 *   {prefix}route:{Next.js key}        a page, route or fetch entry (./incremental.mjs)
 *   {prefix}data:{sha256 of the key}   a "use cache" entry (./data.mjs)
 *   {prefix}stale:{tag}                when the tag was last marked stale (ms since the epoch)
 *   {prefix}expired:{tag}              when entries with the tag expire (ms since the epoch)
 *
 * Tag marks follow Next.js's own handlers: `revalidateTag(tag, "max")` marks the tag stale now
 * and expired a year from now (entries are served once more while they are rendered again),
 * `revalidateTag(tag, { expire: 0 })` and `updateTag` expire it now (the next request waits for
 * a fresh render). An entry is stale when a tag's stale mark is later than the entry, expired
 * when a tag's expired mark is past and later than the entry. Marks carry no time to live:
 * every read of an entry reads its tags' marks, so under `allkeys-lru` a mark is always used
 * at least as recently as any entry it applies to and is evicted after them.
 *
 * Valkey is a cache, never a dependency: every command has a short timeout (150 ms by default);
 * an error or a timeout is a miss for a read and nothing for a write, and Valkey is left alone
 * for a second before the next try. Errors are logged at most once a minute per kind. A tag mark
 * that could not be written is kept in memory and written again every two seconds until it is.
 */
import { createHash } from "node:crypto";
import { pack, unpack } from "./codec.mjs";

/**
 * @typedef {object} CacheClient The commands the store uses (ioredis's names and signatures).
 * @property {string} status `ready` when commands can be sent.
 * @property {(key: string) => Promise<Buffer | null>} getBuffer
 * @property {(key: string, value: Buffer | string, ...args: any[]) => Promise<unknown>} set
 * @property {(...keys: string[]) => Promise<(string | null)[]>} mget
 * @property {(...keysAndValues: string[]) => Promise<unknown>} mset
 * @property {() => Promise<unknown>} ping
 */

/** @typedef {{ stale?: number, expired?: number }} TagMark */
/** @typedef {{ expire?: number }} TagDurations */
/** @typedef {(kind: string, message: string, error?: unknown) => void} CacheLog */

/** Milliseconds Valkey is left alone after a failed command. */
const BACKOFF_MS = 1000;
/** Milliseconds between two attempts to write the tag marks that failed. */
const RETRY_MS = 2000;
/** Tag mark keys kept for a retry, at most (a mark is a few dozen bytes). */
const MAX_UNSENT_MARKS = 100_000;
/** Marks of this process kept in memory, at most (older ones are read back from Valkey). */
const MAX_LOCAL_MARKS = 100_000;
/** A second mark of a tag with the same durations within this delay is a no-op. */
const DEDUPE_MS = 1000;
/** Entries larger than this, compressed, are not stored. */
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

/**
 * A log function that prints each kind of failure at most once per interval, with the number
 * of times it was left out since.
 * @param {{ intervalMs?: number, now?: () => number, sink?: (line: string) => void }} [options]
 * @returns {CacheLog}
 */
export function rateLimitedLog({
	intervalMs = 60_000,
	now = Date.now,
	sink = (line) => console.warn(line),
} = {}) {
	/** @type {Map<string, { at: number, skipped: number }>} */
	const last = new Map();
	return (kind, message, error) => {
		const at = now();
		const state = last.get(kind);
		if (state && at - state.at < intervalMs) {
			state.skipped += 1;
			return;
		}
		const skipped = state?.skipped ?? 0;
		last.set(kind, { at, skipped: 0 });
		const reason =
			error === undefined ? "" : `: ${error instanceof Error ? error.message : String(error)}`;
		const more = skipped > 0 ? ` (${skipped} more since the last report)` : "";
		sink(`[cache] ${message}${reason}${more}`);
	};
}

/**
 * The marks `revalidateTag` / `updateTag` leave on a tag, as Next.js's handlers compute them.
 * @param {TagMark | undefined} previous
 * @param {TagDurations | undefined} durations
 * @param {number} now
 * @returns {TagMark}
 */
export function nextMark(previous, durations, now) {
	if (durations) {
		return {
			...previous,
			stale: now,
			...(durations.expire !== undefined ? { expired: now + durations.expire * 1000 } : {}),
		};
	}
	return { ...previous, expired: now };
}

/**
 * Whether a tag mark expires an entry stored at `storedAt`.
 * @param {TagMark | undefined} mark
 * @param {number} storedAt
 * @param {number} now
 */
export function isExpired(mark, storedAt, now) {
	const expired = mark?.expired;
	return typeof expired === "number" && expired <= now && expired > storedAt;
}

/**
 * Whether a tag mark makes an entry stored at `storedAt` stale.
 * @param {TagMark | undefined} mark
 * @param {number} storedAt
 */
export function isStale(mark, storedAt) {
	const stale = mark?.stale;
	return typeof stale === "number" && stale > storedAt;
}

/** @param {string} value */
const sha256 = (value) => createHash("sha256").update(value).digest("base64url");

/** @param {string | null | undefined} value */
const number = (value) => {
	if (value === null || value === undefined || value === "") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

export class CacheStore {
	/** @type {CacheClient} */ #client;
	/** @type {string} */ #prefix;
	/** @type {number} */ #timeoutMs;
	/** @type {CacheLog} */ #log;
	/** @type {() => number} */ #now;
	#downUntil = 0;
	/** Marks written by this process, newest last: they win over what Valkey answers. */
	/** @type {Map<string, TagMark>} */ #local = new Map();
	/** Mark keys and values not yet written to Valkey. */
	/** @type {Map<string, string>} */ #unsent = new Map();
	/** @type {ReturnType<typeof setTimeout> | null} */ #retryTimer = null;
	/** @type {Map<string, { signature: string, at: number }>} */ #recent = new Map();

	/**
	 * @param {{ client: CacheClient, prefix: string, timeoutMs?: number, log?: CacheLog,
	 *   now?: () => number }} options
	 */
	constructor({ client, prefix, timeoutMs = 150, log = rateLimitedLog(), now = Date.now }) {
		this.#client = client;
		this.#prefix = prefix;
		this.#timeoutMs = timeoutMs;
		this.#log = log;
		this.#now = now;
	}

	get prefix() {
		return this.#prefix;
	}

	/**
	 * The key of an entry: `route` keys are Next.js's own (readable paths), `data` keys are
	 * hashed ("use cache" keys hold the function's serialized arguments).
	 * @param {"route" | "data"} kind
	 * @param {string} id
	 */
	key(kind, id) {
		return `${this.#prefix}${kind}:${kind === "data" ? sha256(id) : id}`;
	}

	/** @param {string} tag */
	#staleKey(tag) {
		return `${this.#prefix}stale:${tag}`;
	}

	/** @param {string} tag */
	#expiredKey(tag) {
		return `${this.#prefix}expired:${tag}`;
	}

	/**
	 * Runs a command with the store's timeout; throws when Valkey is not ready, is being left
	 * alone after a failure, fails or is too slow.
	 * @template T
	 * @param {string} name
	 * @param {() => Promise<T>} command
	 * @returns {Promise<T>}
	 */
	async #call(name, command) {
		if (this.#client.status !== "ready") throw new Error(`Valkey is ${this.#client.status}`);
		if (this.#now() < this.#downUntil) throw new Error("Valkey failed a moment ago");
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let timer;
		const timeout = new Promise((_resolve, reject) => {
			timer = setTimeout(
				() => reject(new Error(`${name} timed out after ${this.#timeoutMs} ms`)),
				this.#timeoutMs,
			);
		});
		try {
			return /** @type {T} */ (await Promise.race([command(), timeout]));
		} catch (error) {
			this.#downUntil = this.#now() + BACKOFF_MS;
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}

	/** Whether Valkey answers a PING within the timeout. */
	async ping() {
		try {
			await this.#call("PING", () => this.#client.ping());
			return true;
		} catch (error) {
			this.#log("ping", "Valkey does not answer", error);
			return false;
		}
	}

	/**
	 * A stored value, or undefined on a miss, an error or a value that does not decode.
	 * @param {"route" | "data"} kind
	 * @param {string} id
	 * @returns {Promise<unknown>}
	 */
	async read(kind, id) {
		const key = this.key(kind, id);
		/** @type {Buffer | null} */
		let stored;
		try {
			stored = await this.#call("GET", () => this.#client.getBuffer(key));
		} catch (error) {
			this.#log("read", "cache read skipped", error);
			return undefined;
		}
		if (!stored) return undefined;
		try {
			return await unpack(stored);
		} catch (error) {
			this.#log("decode", `cache entry ${key} does not decode, treated as a miss`, error);
			return undefined;
		}
	}

	/**
	 * Stores a value for `ttlSeconds` (none when 0: the LRU evicts it). False when it was not
	 * stored, for whatever reason; never throws.
	 * @param {"route" | "data"} kind
	 * @param {string} id
	 * @param {unknown} value
	 * @param {number} ttlSeconds
	 */
	async write(kind, id, value, ttlSeconds) {
		const key = this.key(kind, id);
		try {
			const packed = await pack(value);
			if (packed.length > MAX_ENTRY_BYTES) {
				this.#log("size", `cache entry ${key} is ${packed.length} bytes compressed, not stored`);
				return false;
			}
			const ttlMs = Math.round(ttlSeconds * 1000);
			await this.#call("SET", () =>
				ttlMs > 0 ? this.#client.set(key, packed, "PX", ttlMs) : this.#client.set(key, packed),
			);
			return true;
		} catch (error) {
			this.#log("write", "cache write skipped", error);
			return false;
		}
	}

	/**
	 * The marks of these tags: this process's own, else Valkey's. Tags never marked, or whose
	 * marks Valkey could not give, are absent.
	 * @param {readonly string[]} tags
	 * @returns {Promise<Map<string, TagMark>>}
	 */
	async tagMarks(tags) {
		/** @type {Map<string, TagMark>} */
		const marks = new Map();
		const unique = [...new Set(tags)];
		const remote = unique.filter((tag) => !this.#local.has(tag));
		if (remote.length > 0) {
			const keys = remote.flatMap((tag) => [this.#staleKey(tag), this.#expiredKey(tag)]);
			try {
				const values = await this.#call("MGET", () => this.#client.mget(...keys));
				remote.forEach((tag, index) => {
					const stale = number(values[index * 2]);
					const expired = number(values[index * 2 + 1]);
					if (stale !== undefined || expired !== undefined) {
						marks.set(tag, {
							...(stale !== undefined ? { stale } : {}),
							...(expired !== undefined ? { expired } : {}),
						});
					}
				});
			} catch (error) {
				this.#log("tags", "tag marks not read", error);
			}
			// Marks still waiting for Valkey, of tags this process no longer keeps in memory.
			if (this.#unsent.size > 0) {
				for (const tag of remote) {
					const stale = number(this.#unsent.get(this.#staleKey(tag)));
					const expired = number(this.#unsent.get(this.#expiredKey(tag)));
					if (stale === undefined && expired === undefined) continue;
					marks.set(tag, {
						...marks.get(tag),
						...(stale !== undefined ? { stale } : {}),
						...(expired !== undefined ? { expired } : {}),
					});
				}
			}
		}
		for (const tag of unique) {
			const mark = this.#local.get(tag);
			if (mark) marks.set(tag, mark);
		}
		return marks;
	}

	/**
	 * Marks tags as `revalidateTag` / `updateTag` asked (see `nextMark`). Applied to this
	 * process at once; written to Valkey now, or later if it fails. Never throws.
	 * @param {readonly string[]} tags
	 * @param {TagDurations | undefined} durations
	 * @returns {Promise<void>}
	 */
	async markTags(tags, durations) {
		const now = this.#now();
		const signature = JSON.stringify(durations ?? null);
		/** @type {string[]} */
		const pairs = [];
		for (const tag of new Set(tags)) {
			const recent = this.#recent.get(tag);
			// The incremental cache and the "use cache" handler are both told of every tag.
			if (recent && recent.signature === signature && now - recent.at < DEDUPE_MS) continue;
			this.#recent.set(tag, { signature, at: now });
			const mark = nextMark(this.#local.get(tag), durations, now);
			this.#remember(tag, mark);
			if (mark.stale !== undefined) pairs.push(this.#staleKey(tag), String(mark.stale));
			if (mark.expired !== undefined) pairs.push(this.#expiredKey(tag), String(mark.expired));
		}
		this.#pruneRecent(now);
		if (pairs.length === 0) return;
		try {
			await this.#call("MSET", () => this.#client.mset(...pairs));
		} catch (error) {
			this.#log("tags", "tag marks not written, will retry", error);
			this.#keepForRetry(pairs);
		}
	}

	/** Tag mark writes waiting for Valkey (tests, logs). */
	get unsentMarks() {
		return this.#unsent.size;
	}

	/**
	 * Writes the marks that failed. True when nothing is left to write.
	 * @returns {Promise<boolean>}
	 */
	async flushUnsent() {
		if (this.#unsent.size === 0) return true;
		const batch = [...this.#unsent];
		try {
			await this.#call("MSET", () => this.#client.mset(...batch.flat()));
		} catch (error) {
			this.#log("tags", `${batch.length} tag marks still not written`, error);
			return false;
		}
		// Only what was sent: a newer value written meanwhile stays for the next flush.
		for (const [key, value] of batch) {
			if (this.#unsent.get(key) === value) this.#unsent.delete(key);
		}
		return this.#unsent.size === 0;
	}

	/**
	 * @param {string} tag
	 * @param {TagMark} mark
	 */
	#remember(tag, mark) {
		this.#local.delete(tag);
		this.#local.set(tag, mark);
		// Oldest first; a forgotten mark is still in Valkey (or in the retry list).
		while (this.#local.size > MAX_LOCAL_MARKS) {
			const oldest = this.#local.keys().next().value;
			if (oldest === undefined) break;
			this.#local.delete(oldest);
		}
	}

	/** @param {number} now */
	#pruneRecent(now) {
		if (this.#recent.size < 10_000) return;
		for (const [tag, recent] of this.#recent) {
			if (now - recent.at >= DEDUPE_MS) this.#recent.delete(tag);
		}
	}

	/** @param {string[]} pairs */
	#keepForRetry(pairs) {
		for (let index = 0; index < pairs.length; index += 2) {
			const key = /** @type {string} */ (pairs[index]);
			this.#unsent.delete(key);
			this.#unsent.set(key, /** @type {string} */ (pairs[index + 1]));
		}
		let dropped = 0;
		while (this.#unsent.size > MAX_UNSENT_MARKS) {
			const oldest = this.#unsent.keys().next().value;
			if (oldest === undefined) break;
			this.#unsent.delete(oldest);
			dropped += 1;
		}
		if (dropped > 0) this.#log("dropped", `${dropped} unsent tag marks dropped (too many)`);
		this.#scheduleRetry();
	}

	#scheduleRetry() {
		if (this.#retryTimer) return;
		this.#retryTimer = setTimeout(async () => {
			this.#retryTimer = null;
			if (!(await this.flushUnsent())) this.#scheduleRetry();
		}, RETRY_MS);
		this.#retryTimer.unref?.();
	}
}
