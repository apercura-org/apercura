import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApercuraCacheHandler, { entryTags, ttlSeconds } from "./incremental.mjs";
import { nextTagsManifest, SHARED_CACHE_SYMBOL } from "./runtime.mjs";
import { CacheStore } from "./store.mjs";
import { FakeClient } from "./test-client";

const require = createRequire(import.meta.url);
const MANIFEST = "next/dist/server/lib/incremental-cache/tags-manifest.external.js";

const holder = globalThis as unknown as Record<symbol, unknown>;
const KEY = "/route-cache/APP_PAGE/0123/$/fr/praticien/dr-test";
const YEAR = 365 * 24 * 3600;

function page(tags = "practitioner:1,place:2,_N_T_/fr/praticien/dr-test") {
	return {
		kind: "APP_PAGE" as const,
		html: "<!DOCTYPE html><h1>Dr Test</h1>",
		rscData: Buffer.from('0:["$","h1",null,{"children":"Dr Test"}]'),
		postponed: undefined,
		status: 200,
		headers: { "x-next-cache-tags": tags },
		segmentData: new Map([["/_tree", Buffer.from("tree")]]),
	};
}

/** A page as Next.js hands it over (its enums are plain strings at run time). */
const asValue = (value: unknown) => value as never;

const pageCtx = { kind: "APP_PAGE", isFallback: false, isRoutePPREnabled: false };
const setCtx = { cacheControl: { revalidate: 2_592_000, expire: YEAR } };

function withValkey() {
	const client = new FakeClient();
	const store = new CacheStore({ client, prefix: "apercura:test:", log: () => {} });
	holder[SHARED_CACHE_SYMBOL] = { store: Promise.resolve(store), ping: () => store.ping() };
	vi.stubEnv("CACHE_REDIS_URL", "redis://valkey:6379");
	vi.stubEnv("NODE_ENV", "production");
	return {
		client,
		store,
		handler: () => new ApercuraCacheHandler({ revalidatedTags: [], _requestHeaders: {} }),
	};
}

afterEach(() => {
	delete holder[SHARED_CACHE_SYMBOL];
	vi.unstubAllEnvs();
	nextTagsManifest()?.clear();
});

describe("incremental cache handler, with Valkey", () => {
	beforeEach(() => {
		// As in the server, where Next.js loaded its tag manifest long before any request.
		require(MANIFEST);
	});

	it("stores a page in Valkey and gives it back as Next.js stored it", async () => {
		const { client, handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		const stored = client.data.get(`apercura:test:route:${KEY}`);
		expect(Buffer.isBuffer(stored)).toBe(true);
		expect(client.ttls.get(`apercura:test:route:${KEY}`)).toBe(YEAR * 1000);
		const hit = await handler().get(KEY, pageCtx);
		expect(hit?.value).toEqual(page());
		expect(hit?.cacheControl).toEqual(setCtx.cacheControl);
		expect(typeof hit?.lastModified).toBe("number");
	});

	it("misses a page whose tag expired since it was stored", async () => {
		const { handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await handler().revalidateTag("practitioner:1", { expire: 0 });
		expect(await handler().get(KEY, pageCtx)).toBeNull();
	});

	it("serves a page whose tag is stale, and tells Next.js so it renders it again", async () => {
		const { handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await handler().revalidateTag(["place:2"], { expire: YEAR });
		nextTagsManifest()?.clear();
		const hit = await handler().get(KEY, pageCtx);
		expect(hit?.value?.kind).toBe("APP_PAGE");
		// Copied from Valkey into the manifest Next.js reads to mark the entry stale.
		expect(nextTagsManifest()?.get("place:2")?.stale).toBeGreaterThan(hit?.lastModified ?? 0);
	});

	it("reads the marks a previous process left in Valkey", async () => {
		const { client, handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		await new Promise((resolve) => setTimeout(resolve, 5));
		client.data.set("apercura:test:expired:place:2", String(Date.now()));
		expect(await handler().get(KEY, pageCtx)).toBeNull();
	});

	it("ignores tags of other pages", async () => {
		const { handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await handler().revalidateTag("practitioner:2", { expire: 0 });
		expect((await handler().get(KEY, pageCtx))?.value?.kind).toBe("APP_PAGE");
	});

	it("is a miss, never an error, when Valkey fails", async () => {
		const { client, handler } = withValkey();
		await handler().set(KEY, asValue(page()), setCtx);
		client.failing = true;
		expect(await handler().get(KEY, pageCtx)).toBeNull();
		await expect(handler().set(KEY, asValue(page()), setCtx)).resolves.toBeUndefined();
		await expect(handler().revalidateTag("practitioner:1", { expire: 0 })).resolves.toBeUndefined();
	});

	it("writes nothing to the disk", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "apercura-cache-"));
		try {
			const { client } = withValkey();
			const handler = new ApercuraCacheHandler({
				revalidatedTags: [],
				_requestHeaders: {},
				serverDistDir: dir,
				flushToDisk: true,
			});
			await handler.set(KEY, asValue(page()), setCtx);
			expect(client.data.size).toBe(1);
			expect(require("node:fs").readdirSync(dir)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("incremental cache handler, entry rules", () => {
	it("reads a page's tags from its header and a fetch's from the request", () => {
		expect(entryTags({ lastModified: 1, value: page("a,b") }, pageCtx)).toEqual(["a", "b"]);
		expect(
			entryTags({ lastModified: 1, value: { kind: "FETCH" } }, { tags: ["t"], softTags: ["s"] }),
		).toEqual(["t", "s"]);
		expect(entryTags({ lastModified: 1, value: { kind: "APP_ROUTE", headers: {} } }, {})).toEqual(
			[],
		);
	});

	it("keeps the RSC payload of a partially prerendered page, as Next.js's memory cache does", async () => {
		const { handler } = withValkey();
		await handler().set(KEY, asValue(page()), { ...setCtx, isRoutePPREnabled: true });
		const hit = await handler().get(KEY, { ...pageCtx, isRoutePPREnabled: true });
		expect(hit?.value).toEqual(page());
	});

	it("keeps an entry until its expire time, or leaves it to the LRU", () => {
		expect(ttlSeconds(page(), { cacheControl: { revalidate: 60, expire: 3600 } })).toBe(3600);
		expect(ttlSeconds(page(), { cacheControl: { revalidate: false } })).toBe(0);
		expect(ttlSeconds({ kind: "FETCH", revalidate: 30 }, { fetchCache: true })).toBe(60);
	});
});

describe("incremental cache handler, without Valkey", () => {
	function failingFs(code: string) {
		const fail = async () => {
			throw Object.assign(new Error(`${code}: cannot write`), { code });
		};
		return {
			existsSync: () => false,
			readFile: async () => {
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
			},
			readFileSync: () => {
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
			},
			writeFile: fail,
			mkdir: fail,
			stat: fail,
		};
	}

	it("is Next.js's file system cache, unchanged", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "apercura-cache-"));
		try {
			const nodeFs = require("node:fs");
			const fs = {
				existsSync: nodeFs.existsSync,
				readFile: (file: string, encoding?: BufferEncoding) =>
					nodeFs.promises.readFile(file, encoding),
				readFileSync: nodeFs.readFileSync,
				writeFile: (file: string, data: string | Buffer) => nodeFs.promises.writeFile(file, data),
				mkdir: (dir: string) => nodeFs.promises.mkdir(dir, { recursive: true }),
				stat: (file: string) => nodeFs.promises.stat(file),
			};
			const handler = new ApercuraCacheHandler({
				fs: fs as never,
				serverDistDir: path.join(dir, "server"),
				flushToDisk: true,
				revalidatedTags: [],
				_requestHeaders: {},
			});
			await handler.set(KEY, asValue(page()), setCtx);
			// Where Next.js writes it: .next/server/route-cache/…
			expect(nodeFs.existsSync(path.join(dir, "server", `${KEY}.html`))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	for (const code of ["ENOSPC", "EROFS"]) {
		it(`serves pages when the disk is ${code === "ENOSPC" ? "full" : "read-only"}: writes are dropped`, async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const handler = new ApercuraCacheHandler({
					fs: failingFs(code) as never,
					serverDistDir: path.join(tmpdir(), "apercura-no-such-dir", "server"),
					flushToDisk: true,
					revalidatedTags: [],
					_requestHeaders: {},
				});
				await expect(handler.set(KEY, asValue(page()), setCtx)).resolves.toBeUndefined();
				expect(await handler.get(KEY, pageCtx)).toBeNull();
			} finally {
				warn.mockRestore();
			}
		});
	}
});
