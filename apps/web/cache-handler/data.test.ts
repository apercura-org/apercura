import { describe, expect, it } from "vitest";
import { createValkeyDataHandler, dataTtlSeconds } from "./data.mjs";
import { CacheStore } from "./store.mjs";
import { FakeClient } from "./test-client";

const YEAR = 365 * 24 * 3600;

function stream(text: string) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

async function text(value: ReadableStream<Uint8Array>) {
	return new Response(value).text();
}

function setup() {
	const client = new FakeClient();
	let clock = 1_000_000;
	let wall = 5_000_000;
	const store = new CacheStore({
		client,
		prefix: "apercura:test:",
		log: () => {},
		now: () => wall,
	});
	const handler = createValkeyDataHandler({
		store: async () => store,
		now: () => clock,
		wallNow: () => wall,
	});
	return {
		client,
		store,
		handler,
		advance: (ms: number) => {
			clock += ms;
			wall += ms;
		},
		entry: (overrides: Record<string, unknown> = {}) => ({
			value: stream('{"name":"Dr Test"}'),
			tags: ["practitioner:1", "practitioner:*"],
			stale: 300,
			timestamp: clock,
			expire: YEAR,
			revalidate: 2_592_000,
			...overrides,
		}),
	};
}

describe('"use cache" handler, with Valkey', () => {
	it("stores an entry and streams it back", async () => {
		const { client, handler, entry } = setup();
		await handler.set("key", Promise.resolve(entry()));
		expect(client.data.size).toBe(1);
		const hit = await handler.get("key", []);
		expect(hit && (await text(hit.value))).toBe('{"name":"Dr Test"}');
		expect(hit?.tags).toEqual(["practitioner:1", "practitioner:*"]);
		expect(hit?.revalidate).toBe(2_592_000);
		// A new stream on every read.
		const again = await handler.get("key", []);
		expect(again && (await text(again.value))).toBe('{"name":"Dr Test"}');
	});

	it("keeps entries in Valkey until their revalidate time", async () => {
		const { client, handler, entry } = setup();
		await handler.set("key", Promise.resolve(entry({ revalidate: 300, expire: 3600 })));
		expect([...client.ttls.values()]).toEqual([300_000]);
		expect(dataTtlSeconds({ revalidate: 2_592_000, expire: YEAR })).toBe(2_592_000);
	});

	it("drops an entry past its revalidate time, as Next.js's in-memory handler does", async () => {
		const { handler, entry, advance } = setup();
		await handler.set("key", Promise.resolve(entry({ revalidate: 300, expire: 3600 })));
		advance(299_000);
		expect(await handler.get("key", [])).toBeDefined();
		advance(2000);
		expect(await handler.get("key", [])).toBeUndefined();
	});

	it("does not store a dynamic entry (`expire: 0`)", async () => {
		const { client, handler, entry } = setup();
		await handler.set("key", Promise.resolve(entry({ expire: 0, revalidate: 0 })));
		expect(client.data.size).toBe(0);
	});

	it("waits for a set in progress before reading the same key", async () => {
		const { handler, entry } = setup();
		let resolve: (value: ReturnType<typeof entry>) => void = () => {};
		const pending = new Promise<ReturnType<typeof entry>>((done) => {
			resolve = done;
		});
		const setting = handler.set("key", pending);
		const reading = handler.get("key", []);
		resolve(entry());
		await setting;
		const hit = await reading;
		expect(hit && (await text(hit.value))).toBe('{"name":"Dr Test"}');
	});

	it("marks an entry stale (served once more) or expired (a miss) by its tags", async () => {
		const { handler, entry, advance } = setup();
		await handler.set("key", Promise.resolve(entry()));
		advance(10);
		await handler.updateTags(["practitioner:*"], { expire: YEAR });
		expect((await handler.get("key", []))?.revalidate).toBe(-1);
		advance(10);
		await handler.updateTags(["practitioner:1"], { expire: 0 });
		expect(await handler.get("key", [])).toBeUndefined();
	});

	it("checks the request's implicit tags too", async () => {
		const { handler, entry, advance } = setup();
		await handler.set("key", Promise.resolve(entry()));
		advance(10);
		await handler.updateTags(["_N_T_/fr/praticien/dr-test"]);
		expect(await handler.get("key", ["_N_T_/fr/praticien/other"])).toBeDefined();
		expect(await handler.get("key", ["_N_T_/fr/praticien/dr-test"])).toBeUndefined();
		expect(await handler.getExpiration(["_N_T_/fr/praticien/dr-test"])).toBe(Infinity);
	});

	it("is a miss when Valkey fails, and stores nothing from a failed computation", async () => {
		const { client, handler, entry } = setup();
		await handler.set("key", Promise.resolve(entry()));
		client.failing = true;
		expect(await handler.get("key", [])).toBeUndefined();
		client.failing = false;
		const broken = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(new Error("query failed"));
			},
		});
		await expect(
			handler.set("other", Promise.resolve(entry({ value: broken }))),
		).resolves.toBeUndefined();
		expect(await handler.get("other", [])).toBeUndefined();
	});

	it("hands every call to Next.js's in-memory handler when Valkey cannot start", async () => {
		const { entry } = setup();
		const handler = createValkeyDataHandler({ store: async () => null });
		await handler.set(
			"key",
			Promise.resolve(entry({ timestamp: performance.timeOrigin + performance.now() })),
		);
		const hit = await handler.get("key", []);
		expect(hit && (await text(hit.value))).toBe('{"name":"Dr Test"}');
		await expect(handler.updateTags(["a"], undefined)).resolves.toBeUndefined();
	});
});
