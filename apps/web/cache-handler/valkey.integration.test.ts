/**
 * The store against a real Valkey: CACHE_REDIS_URL_TEST (CI runs a `valkey/valkey` service),
 * skipped without it. Keys are written under a prefix of their own and deleted afterwards.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createValkeyDataHandler } from "./data.mjs";
import { createValkeyClient } from "./runtime.mjs";
import { CacheStore } from "./store.mjs";

const url = process.env.CACHE_REDIS_URL_TEST;
const prefix = `apercura-test:${randomUUID()}:`;

describe.skipIf(!url)("Valkey store (integration)", async () => {
	const client = url
		? await createValkeyClient({ url, password: undefined, timeoutMs: 500 })
		: null;
	const ready = async () => {
		while (client && client.status !== "ready")
			await new Promise((resolve) => setTimeout(resolve, 20));
	};
	const store = client ? new CacheStore({ client, prefix, timeoutMs: 500, log: () => {} }) : null;

	afterAll(async () => {
		if (!client) return;
		const keys = await client.keys(`${prefix}*`);
		if (keys.length > 0) await client.del(...keys);
		client.disconnect();
	});

	it("stores a page with its time to live and reads it back", async () => {
		await ready();
		const value = {
			kind: "APP_PAGE",
			html: "<h1>Dr Test</h1>".repeat(1000),
			rscData: Buffer.from("rsc"),
			segmentData: new Map([["/_tree", Buffer.from("tree")]]),
		};
		expect(await store?.write("route", "/route-cache/APP_PAGE/x/$/fr/a", value, 60)).toBe(true);
		expect(await store?.read("route", "/route-cache/APP_PAGE/x/$/fr/a")).toEqual(value);
		const ttl = await client?.pttl(`${prefix}route:/route-cache/APP_PAGE/x/$/fr/a`);
		expect(ttl).toBeGreaterThan(59_000);
		expect(ttl).toBeLessThanOrEqual(60_000);
		// Compressed: far below the 16 KB of HTML.
		expect(await client?.strlen(`${prefix}route:/route-cache/APP_PAGE/x/$/fr/a`)).toBeLessThan(
			1000,
		);
	});

	it("shares tag marks between processes", async () => {
		await ready();
		await store?.markTags(["practitioner:1"], { expire: 0 });
		const other = client ? new CacheStore({ client, prefix, log: () => {} }) : null;
		const marks = await other?.tagMarks(["practitioner:1", "practitioner:2"]);
		expect(marks?.get("practitioner:1")?.expired).toBeTypeOf("number");
		expect(marks?.has("practitioner:2")).toBe(false);
	});

	it('serves "use cache" entries', async () => {
		await ready();
		const handler = createValkeyDataHandler({ store: async () => store });
		await handler.set(
			"key",
			Promise.resolve({
				value: new Response("payload").body as ReadableStream<Uint8Array>,
				tags: ["place:1"],
				stale: 300,
				timestamp: performance.timeOrigin + performance.now(),
				expire: 3600,
				revalidate: 900,
			}),
		);
		const hit = await handler.get("key", []);
		expect(hit && (await new Response(hit.value).text())).toBe("payload");
	});
});

describe.skipIf(!url)("Valkey unreachable (integration)", () => {
	it("is a miss within the timeout, without an error", async () => {
		const client = await createValkeyClient({
			url: "redis://127.0.0.1:1",
			password: undefined,
			timeoutMs: 150,
		});
		try {
			const store = new CacheStore({ client, prefix, timeoutMs: 150, log: () => {} });
			const started = Date.now();
			expect(await store.read("route", "/a")).toBeUndefined();
			expect(await store.write("route", "/a", { a: 1 }, 10)).toBe(false);
			expect(await store.ping()).toBe(false);
			expect(Date.now() - started).toBeLessThan(1000);
		} finally {
			client.disconnect();
		}
	});
});
