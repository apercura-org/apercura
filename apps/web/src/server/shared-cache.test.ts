import { describe, expect, it } from "vitest";
import { sharedCacheWritable } from "./shared-cache";

const SHARED_CACHE = Symbol.for("apercura.shared-cache");

describe("sharedCacheWritable", () => {
	it("has nothing to wait for without the Valkey cache", async () => {
		expect(await sharedCacheWritable({})).toBe(true);
	});

	it("asks Valkey when the cache handlers registered it", async () => {
		expect(await sharedCacheWritable({ [SHARED_CACHE]: { ping: async () => true } })).toBe(true);
		expect(await sharedCacheWritable({ [SHARED_CACHE]: { ping: async () => false } })).toBe(false);
		const broken = {
			[SHARED_CACHE]: {
				ping: async () => {
					throw new Error("down");
				},
			},
		};
		expect(await sharedCacheWritable(broken)).toBe(false);
	});
});
