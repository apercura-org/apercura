/**
 * The outbox drain's hand-off to the cache warm-up, without a database: a fake `sql` tag
 * answers the drain's queries and records them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "../src/lib/db";
import { drainOutbox, requestWarmRestart } from "../src/outbox";

function fakeSql(tags: string[], options: { warmupFails?: boolean } = {}) {
	const queries: string[] = [];
	let pending = tags.map((tag, index) => ({ id: index + 1, tag }));
	const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
		const text = strings.join("?").replace(/\s+/g, " ").trim();
		queries.push(text);
		if (text.startsWith("SELECT count(*)")) return Promise.resolve([{ pending: pending.length }]);
		if (text.startsWith("SELECT id, tag")) {
			const after = values[0] as number;
			return Promise.resolve(pending.filter((row) => row.id > after).slice(0, 100));
		}
		if (text.startsWith("DELETE FROM directory.invalidation_outbox WHERE id")) {
			const ids = values[0] as number[];
			pending = pending.filter((row) => !ids.includes(row.id));
			return Promise.resolve([]);
		}
		if (text.startsWith("UPDATE directory.cache_warmup") && options.warmupFails) {
			return Promise.reject(new Error('relation "directory.cache_warmup" does not exist'));
		}
		return Promise.resolve([]);
	};
	return { sql: tag as unknown as Sql, queries };
}

const restartQuery = "UPDATE directory.cache_warmup SET restart_requested_at = now() WHERE id = 1";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("outbox drain and cache warm-up", () => {
	it("asks the warm-up to start over once the tags reached the app", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 200 })),
		);
		const { sql, queries } = fakeSql(["practitioner:1", "listing:medecin-generaliste:fr"]);
		const result = await drainOutbox(sql, { appUrl: "http://app:3000", secret: "s".repeat(32) });
		expect(result).toMatchObject({ status: "done", sent: 2 });
		expect(queries.at(-1)).toBe(restartQuery);
		// The sitemaps' tag joins the others first (the fake database leaves it out).
		expect(queries[0]).toMatch(
			/^INSERT INTO directory\.invalidation_outbox \(tag\) SELECT \?::text WHERE EXISTS/,
		);
	});

	it("leaves the warm-up alone when nothing was sent", async () => {
		const { sql, queries } = fakeSql([]);
		expect(await drainOutbox(sql, { appUrl: "http://app:3000", secret: "s" })).toMatchObject({
			status: "done",
			sent: 0,
		});
		const unsent = fakeSql(["practitioner:1"]);
		expect(await drainOutbox(unsent.sql, { appUrl: null, secret: null })).toMatchObject({
			status: "skipped",
		});
		expect([...queries, ...unsent.queries]).not.toContain(restartQuery);
	});

	it("never fails the import when the warm-up table is missing", async () => {
		const { sql } = fakeSql([], { warmupFails: true });
		const log = vi.fn();
		await expect(requestWarmRestart(sql, log)).resolves.toBeUndefined();
		expect(log).toHaveBeenCalledWith(expect.stringContaining("not requested"));
	});
});
