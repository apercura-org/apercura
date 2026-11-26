import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiskGuard, readBuildId, valkeyConfig } from "./runtime.mjs";

describe("valkeyConfig", () => {
	const production = { NODE_ENV: "production", CACHE_REDIS_URL: "redis://valkey:6379" };

	it("turns Valkey on with CACHE_REDIS_URL, in production, outside the build", () => {
		expect(valkeyConfig(production)).toEqual({
			url: "redis://valkey:6379",
			password: undefined,
			timeoutMs: 150,
		});
		expect(
			valkeyConfig({
				...production,
				CACHE_REDIS_PASSWORD: "secret",
				CACHE_REDIS_TIMEOUT_MS: "300",
			}),
		).toEqual({ url: "redis://valkey:6379", password: "secret", timeoutMs: 300 });
	});

	it("keeps Next.js's own caches otherwise", () => {
		expect(valkeyConfig({ NODE_ENV: "production" })).toBeNull();
		expect(valkeyConfig({ ...production, CACHE_REDIS_URL: "  " })).toBeNull();
		expect(valkeyConfig({ ...production, NODE_ENV: "development" })).toBeNull();
		expect(valkeyConfig({ ...production, NEXT_PHASE: "phase-production-build" })).toBeNull();
	});

	it("falls back to the default timeout on a malformed one", () => {
		expect(valkeyConfig({ ...production, CACHE_REDIS_TIMEOUT_MS: "fast" })?.timeoutMs).toBe(150);
	});
});

describe("readBuildId", () => {
	it("reads the first build id found", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "apercura-build-"));
		try {
			writeFileSync(path.join(dir, "BUILD_ID"), "abc123\n");
			expect(readBuildId([path.join(dir, "missing"), path.join(dir, "BUILD_ID")])).toBe("abc123");
			expect(readBuildId([path.join(dir, "missing")])).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("DiskGuard", () => {
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

	it("stops disk writes while free space is below the minimum, checking every 10 s", async () => {
		let clock = 0;
		let free = 10 * 1024 * 1024;
		let checks = 0;
		const guard = new DiskGuard({
			minFreeBytes: 100 * 1024 * 1024,
			now: () => clock,
			statfs: async () => {
				checks += 1;
				return { bavail: free / 4096, bsize: 4096 };
			},
		});
		// The first answer is optimistic: the check runs off the request path.
		expect(guard.mayWrite(tmpdir())).toBe(true);
		await flush();
		expect(guard.mayWrite(tmpdir())).toBe(false);
		expect(checks).toBe(1);
		free = 500 * 1024 * 1024;
		clock = 10_000;
		guard.mayWrite(tmpdir());
		await flush();
		expect(guard.mayWrite(tmpdir())).toBe(true);
		expect(checks).toBe(2);
	});

	it("stops disk writes for a minute after one fails for lack of room or rights", () => {
		let clock = 0;
		const guard = new DiskGuard({ minFreeBytes: 0, now: () => clock });
		guard.failed(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
		expect(guard.mayWrite(tmpdir())).toBe(true);
		guard.failed(Object.assign(new Error("read-only"), { code: "EROFS" }));
		expect(guard.mayWrite(tmpdir())).toBe(false);
		clock = 60_001;
		expect(guard.mayWrite(tmpdir())).toBe(true);
	});
});
