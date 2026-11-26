import { describe, expect, it, vi } from "vitest";
import { CacheStore, isExpired, isStale, nextMark, rateLimitedLog } from "./store.mjs";
import { FakeClient } from "./test-client";

const YEAR = 365 * 24 * 3600;

function setup(options: { timeoutMs?: number } = {}) {
	const client = new FakeClient();
	let clock = 1_000_000;
	const lines: string[] = [];
	const store = new CacheStore({
		client,
		prefix: "apercura:build-1:",
		timeoutMs: options.timeoutMs ?? 50,
		log: (kind, message) => lines.push(`${kind}: ${message}`),
		now: () => clock,
	});
	return {
		client,
		store,
		lines,
		advance: (ms: number) => {
			clock += ms;
		},
		now: () => clock,
	};
}

describe("tag marks", () => {
	it("follow Next.js: `max` marks stale now and expired later, `expire: 0` expires now", () => {
		expect(nextMark(undefined, { expire: YEAR }, 10)).toEqual({
			stale: 10,
			expired: 10 + YEAR * 1000,
		});
		expect(nextMark({ stale: 5 }, { expire: 0 }, 10)).toEqual({ stale: 10, expired: 10 });
		expect(nextMark({ stale: 5 }, undefined, 10)).toEqual({ stale: 5, expired: 10 });
		expect(nextMark({ expired: 99 }, {}, 10)).toEqual({ stale: 10, expired: 99 });
	});

	it("make an entry stale or expired only when they are later than it", () => {
		expect(isStale({ stale: 20 }, 10)).toBe(true);
		expect(isStale({ stale: 10 }, 10)).toBe(false);
		expect(isStale(undefined, 10)).toBe(false);
		expect(isExpired({ expired: 20 }, 10, 30)).toBe(true);
		// A future expiry (the `max` profile) is not one yet.
		expect(isExpired({ expired: 40 }, 10, 30)).toBe(false);
		// An entry stored after the expiry is fresh.
		expect(isExpired({ expired: 20 }, 25, 30)).toBe(false);
	});
});

describe("CacheStore", () => {
	it("stores values under the build's prefix, compressed, with their time to live", async () => {
		const { client, store } = setup();
		const value = { html: "<p>x</p>".repeat(100), rsc: Buffer.from("rsc") };
		expect(await store.write("route", "/route-cache/APP_PAGE/abc/$/fr", value, 3600)).toBe(true);
		const key = "apercura:build-1:route:/route-cache/APP_PAGE/abc/$/fr";
		expect(client.data.has(key)).toBe(true);
		expect(client.ttls.get(key)).toBe(3_600_000);
		expect((client.data.get(key) as Buffer).length).toBeLessThan(200);
		expect(await store.read("route", "/route-cache/APP_PAGE/abc/$/fr")).toEqual(value);
		expect(await store.read("route", "/missing")).toBeUndefined();
	});

	it("hashes `use cache` keys, which hold serialized arguments", () => {
		const { store } = setup();
		const key = store.key("data", `["build","fn",[{"slug":"${"x".repeat(5000)}"}]]`);
		expect(key).toMatch(/^apercura:build-1:data:[\w-]{43}$/);
	});

	it("stores without a time to live when there is none (the LRU evicts it)", async () => {
		const { client, store } = setup();
		await store.write("route", "/a", { a: 1 }, 0);
		expect(client.ttls.has("apercura:build-1:route:/a")).toBe(false);
	});

	it("turns every failure into a miss or a no-op, and leaves Valkey alone a moment", async () => {
		const { client, store, lines, advance } = setup();
		client.failing = true;
		expect(await store.read("route", "/a")).toBeUndefined();
		expect(await store.write("route", "/a", { a: 1 }, 10)).toBe(false);
		expect(lines.some((line) => line.startsWith("read:"))).toBe(true);
		client.failing = false;
		const before = client.calls.length;
		// Within the back-off: not even tried.
		expect(await store.read("route", "/a")).toBeUndefined();
		expect(client.calls.length).toBe(before);
		advance(1001);
		expect(await store.write("route", "/a", { a: 1 }, 10)).toBe(true);
		expect(await store.read("route", "/a")).toEqual({ a: 1 });
	});

	it("gives up on a command that hangs after its timeout", async () => {
		const { client, store } = setup({ timeoutMs: 20 });
		client.hanging = true;
		const started = Date.now();
		expect(await store.read("route", "/a")).toBeUndefined();
		expect(Date.now() - started).toBeLessThan(500);
		expect(await store.ping()).toBe(false);
	});

	it("sends nothing while disconnected", async () => {
		const { client, store } = setup();
		client.status = "reconnecting";
		expect(await store.read("route", "/a")).toBeUndefined();
		expect(await store.ping()).toBe(false);
		expect(client.calls).toEqual([]);
	});

	it("treats an entry that does not decode as a miss", async () => {
		const { client, store, lines } = setup();
		client.data.set("apercura:build-1:route:/a", Buffer.from("not brotli"));
		expect(await store.read("route", "/a")).toBeUndefined();
		expect(lines.some((line) => line.startsWith("decode:"))).toBe(true);
	});

	it("writes tag marks to Valkey, where a restarted process reads them", async () => {
		const { client, store, now } = setup();
		await store.markTags(["practitioner:1", "listing:*"], { expire: YEAR });
		await store.markTags(["sitemap"], { expire: 0 });
		expect(client.data.get("apercura:build-1:stale:practitioner:1")).toBe(String(now()));
		const restarted = new CacheStore({ client, prefix: "apercura:build-1:", log: () => {} });
		const marks = await restarted.tagMarks(["practitioner:1", "sitemap", "place:9"]);
		expect(marks.get("practitioner:1")).toEqual({ stale: now(), expired: now() + YEAR * 1000 });
		expect(marks.get("sitemap")).toEqual({ stale: now(), expired: now() });
		expect(marks.has("place:9")).toBe(false);
		// Another build's marks are another build's.
		const next = new CacheStore({ client, prefix: "apercura:build-2:", log: () => {} });
		expect((await next.tagMarks(["practitioner:1"])).size).toBe(0);
	});

	it("applies its own marks at once, even when Valkey misses them, and writes them later", async () => {
		const { client, store, now, advance } = setup();
		client.failing = true;
		await store.markTags(["practitioner:1"], { expire: YEAR });
		expect(store.unsentMarks).toBe(2);
		expect((await store.tagMarks(["practitioner:1"])).get("practitioner:1")?.stale).toBe(now());
		client.failing = false;
		advance(1001);
		expect(await store.flushUnsent()).toBe(true);
		expect(store.unsentMarks).toBe(0);
		expect(client.data.get("apercura:build-1:stale:practitioner:1")).toBe(String(now() - 1001));
	});

	it("writes a tag once when both handlers are told of it", async () => {
		const { client, store } = setup();
		await store.markTags(["practitioner:1"], { expire: YEAR });
		await store.markTags(["practitioner:1"], { expire: YEAR });
		expect(client.calls.filter((call) => call === "MSET")).toHaveLength(1);
		// A different profile is a different mark.
		await store.markTags(["practitioner:1"], { expire: 0 });
		expect(client.calls.filter((call) => call === "MSET")).toHaveLength(2);
	});
});

describe("rateLimitedLog", () => {
	it("prints each kind at most once per interval, then says how many were left out", () => {
		let clock = 0;
		const sink = vi.fn();
		const log = rateLimitedLog({ intervalMs: 1000, now: () => clock, sink });
		log("read", "cache read skipped", new Error("ECONNREFUSED"));
		log("read", "cache read skipped", new Error("ECONNREFUSED"));
		log("write", "cache write skipped");
		clock = 1500;
		log("read", "cache read skipped", new Error("timeout"));
		expect(sink.mock.calls.map(([line]) => line)).toEqual([
			"[cache] cache read skipped: ECONNREFUSED",
			"[cache] cache write skipped",
			"[cache] cache read skipped: timeout (1 more since the last report)",
		]);
	});
});
