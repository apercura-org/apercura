/**
 * The health check answers on the database alone: a page cache that cannot be written (a full
 * or read-only disk, Valkey down) must never turn it into a 503, which would make the
 * orchestrator restart, or stop routing to, an app that still serves pages (issue #129).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn<() => Promise<unknown>>();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("~/server/db", () => ({
	getSql: () => () => query(),
}));

const SHARED_CACHE = Symbol.for("apercura.shared-cache");
const holder = globalThis as unknown as Record<symbol, unknown>;

beforeEach(() => {
	vi.stubEnv("DATABASE_URL", "postgres://health@localhost/apercura");
	// A shared cache that fails everything it is asked.
	holder[SHARED_CACHE] = {
		store: Promise.reject(new Error("ENOSPC")).catch(() => null),
		ping: async () => {
			throw new Error("Valkey down");
		},
	};
});

afterEach(() => {
	delete holder[SHARED_CACHE];
	vi.unstubAllEnvs();
	query.mockReset();
});

describe("GET /api/health", () => {
	it("answers 200 when the database does, whatever the cache's state", async () => {
		query.mockResolvedValue([{ "?column?": 1 }]);
		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("answers 503 when the database does not", async () => {
		query.mockRejectedValue(new Error("connection refused"));
		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: "unavailable" });
	});
});
