import { describe, expect, it } from "vitest";
import type { SitemapChunk, SitemapKind, SitemapMarket } from "~/server/queries/sitemap-sql";
import { pagesPaths } from "./plan";
import { runWarm, type WarmDeps } from "./run";
import type { CursorRow, WarmStore } from "./store";

const CHUNKS: SitemapChunk[] = [
	{ market: "fr", kind: "listes", chunk: 0, lastmod: "2026-11-25", urls: 3 },
	{ market: "fr", kind: "praticiens", chunk: 0, lastmod: "2026-11-25", urls: 5 },
];
const ENTRIES: Record<string, string[]> = {
	"listes-0": ["/medecin-generaliste", "/sage-femme", "/infirmier"],
	"praticiens-0": [
		"/praticien/a-1",
		"/praticien/b-2",
		"/praticien/c-3",
		"/praticien/d-4",
		"/praticien/e-5",
	],
};
const PAGES = pagesPaths(CHUNKS).length;
const TOTAL = PAGES + 3 + 5;

/** The cursor row and the sitemap queries, in memory. */
function memoryStore(importRun = 1) {
	const state: CursorRow & { importRun: number } = {
		generation: "",
		unit: null,
		position: 0,
		warmed: 0,
		errors: 0,
		startedAt: null,
		completedAt: null,
		restartRequestedAt: null,
		importRun,
	};
	const store: WarmStore = {
		read: async () => ({ ...state }),
		restart: async (generation, seen) => {
			Object.assign(state, {
				generation,
				unit: null,
				position: 0,
				warmed: 0,
				errors: 0,
				startedAt: "2026-11-25 10:00:00+00",
				completedAt: null,
			});
			if (state.restartRequestedAt === seen) state.restartRequestedAt = null;
			return { ...state };
		},
		save: async (progress) => {
			state.unit = progress.unit;
			state.position = progress.position;
			state.warmed += progress.warmed;
			state.errors += progress.errors;
			state.completedAt = progress.completed ? "2026-11-25 10:05:00+00" : null;
		},
		lastImportRun: async () => state.importRun,
		chunks: async () => CHUNKS,
		entries: async (_market: SitemapMarket, kind: SitemapKind, chunk: number) =>
			ENTRIES[`${kind}-${chunk}`] ?? [],
	};
	return { store, state };
}

type FakeApp = {
	requested: string[];
	hosts: Set<string | null>;
	maxInFlight: number;
	/** Milliseconds a page takes, by path (default 50). */
	latency?: (path: string) => number;
	status?: (path: string) => number;
	health?: () => number;
};

/** The app: answers after its latency on a fake clock, and records what it was asked. */
function fakeApp(options: Partial<FakeApp> = {}) {
	const app: FakeApp = { requested: [], hosts: new Set(), maxInFlight: 0, ...options };
	let clock = 0;
	let inFlight = 0;
	const fetch: WarmDeps["fetch"] = async (input, init) => {
		const path = input.pathname;
		if (path === "/api/health") {
			return new Response("{}", { status: app.health?.() ?? 200 });
		}
		inFlight += 1;
		app.maxInFlight = Math.max(app.maxInFlight, inFlight);
		app.requested.push(path);
		app.hosts.add(new Headers(init.headers).get("host"));
		await Promise.resolve();
		clock += app.latency?.(path) ?? 50;
		inFlight -= 1;
		return new Response("<html></html>", { status: app.status?.(path) ?? 200 });
	};
	return { app, fetch, now: () => clock };
}

const ENV = {
	APP_URL: "https://apercura.org",
	INTERNAL_APP_URL: "http://app:3000",
};

describe("cache warm-up run", () => {
	it("walks every sitemap URL a budget at a time, then waits for a new build or import", async () => {
		const { store, state } = memoryStore();
		const { app, fetch, now } = fakeApp();
		const env = { ...ENV, WARM_CACHE_MAX_URLS: "6" };
		const deps = { store, fetch, env, buildId: "build-1", now };

		const first = await runWarm(deps);
		expect(first).toMatchObject({
			restarted: true,
			warmed: 6,
			stopped: "count",
			completed: false,
			unit: "pages",
			position: 6,
			remaining: TOTAL - 6,
		});
		expect(state.generation).toBe("build:build-1|import:1");

		const runs = [first];
		while (!state.completedAt && runs.length < 20) runs.push(await runWarm(deps));
		expect(runs.at(-1)).toMatchObject({ completed: true, remaining: 0, total: TOTAL });
		// Each URL once, in order: the pages, the listings, then the practitioners.
		expect(app.requested).toHaveLength(TOTAL);
		expect(new Set(app.requested).size).toBe(TOTAL);
		expect(app.requested.slice(PAGES)).toEqual([
			"/fr/medecin-generaliste",
			"/fr/sage-femme",
			"/fr/infirmier",
			"/fr/praticien/a-1",
			"/fr/praticien/b-2",
			"/fr/praticien/c-3",
			"/fr/praticien/d-4",
			"/fr/praticien/e-5",
		]);
		expect(app.hosts).toEqual(new Set(["apercura.org"]));
		expect(app.maxInFlight).toBeLessThanOrEqual(4);

		const idle = await runWarm(deps);
		expect(idle).toMatchObject({ skipped: "complete", warmed: 0 });
		expect(app.requested).toHaveLength(TOTAL);
	});

	it("warms the highest-value pages within its budget, then waits", async () => {
		const { store, state } = memoryStore();
		const { app, fetch, now } = fakeApp();
		const budget = PAGES + 2;
		const env = { ...ENV, WARM_CACHE_CONCURRENCY: "1", WARM_CACHE_BUDGET_URLS: String(budget) };
		const deps = { store, fetch, env, buildId: "build-1", now };
		const report = await runWarm(deps);
		expect(report).toMatchObject({ stopped: "budget", completed: true, warmed: budget });
		// The pages first, then the listings: no practitioner.
		expect(app.requested.slice(PAGES)).toEqual(["/fr/medecin-generaliste", "/fr/sage-femme"]);
		expect(state.completedAt).not.toBeNull();
		expect(await runWarm(deps)).toMatchObject({ skipped: "complete" });
		// Over several runs, the budget is the walk's.
		const again = memoryStore();
		const other = fakeApp();
		const small = { ...env, WARM_CACHE_MAX_URLS: "3" };
		const runs = [];
		do {
			runs.push(
				await runWarm({
					store: again.store,
					fetch: other.fetch,
					env: small,
					buildId: "b",
					now: other.now,
				}),
			);
		} while (!again.state.completedAt && runs.length < 40);
		expect(other.app.requested).toHaveLength(budget);
		expect(runs.at(-1)).toMatchObject({ stopped: "budget", total: budget });
	});

	it("starts over after a deploy, an import, or when the import asks", async () => {
		const { store, state } = memoryStore();
		const { app, fetch, now } = fakeApp();
		const deps = { store, fetch, env: ENV, buildId: "build-1", now };
		await runWarm(deps);
		expect(state.completedAt).not.toBeNull();

		const deployed = await runWarm({ ...deps, buildId: "build-2" });
		expect(deployed).toMatchObject({ restarted: true, completed: true, warmed: TOTAL });

		state.importRun = 2;
		expect(await runWarm({ ...deps, buildId: "build-2" })).toMatchObject({ restarted: true });

		state.restartRequestedAt = "2026-11-25 11:00:00.123456+00";
		expect(await runWarm({ ...deps, buildId: "build-2" })).toMatchObject({
			restarted: true,
			completed: true,
		});
		expect(state.restartRequestedAt).toBeNull();
		expect(app.requested).toHaveLength(4 * TOTAL);
	});

	it("requests nothing when turned off or when the app is unhealthy", async () => {
		const { store, state } = memoryStore();
		const { app, fetch, now } = fakeApp({ health: () => 503 });
		expect(
			await runWarm({ store, fetch, env: { ...ENV, WARM_CACHE: "false" }, buildId: null, now }),
		).toEqual({ skipped: "disabled" });
		const report = await runWarm({ store, fetch, env: ENV, buildId: null, now });
		expect(report).toMatchObject({ stopped: "unhealthy", warmed: 0, remaining: null });
		expect(app.requested).toEqual([]);
		expect(state.unit).toBeNull();
	});

	it("stops when the pages get slow, and resumes after the last one done", async () => {
		const { store, state } = memoryStore();
		const { app, fetch, now } = fakeApp({
			latency: (path) => (path.startsWith("/fr/praticien/") ? 5000 : 20),
		});
		const env = { ...ENV, WARM_CACHE_CONCURRENCY: "1", WARM_CACHE_MAX_P95_MS: "1000" };
		const report = await runWarm({ store, fetch, env, buildId: "b", now });
		expect(report).toMatchObject({ stopped: "latency" });
		expect(state.unit).toBe("praticiens-0");
		// Twenty requests in the window, of which the slow ones take the p95 over 1000 ms.
		expect(state.position).toBeGreaterThan(0);
		expect(state.position).toBeLessThan(5);
		const done = app.requested.length;

		const fast = fakeApp();
		const next = await runWarm({ store, fetch: fast.fetch, env, buildId: "b", now: fast.now });
		expect(next).toMatchObject({ restarted: false, completed: true });
		expect(done + fast.app.requested.length).toBe(TOTAL);
	});

	it("backs off when the app answers 503, and counts gone pages apart", async () => {
		const { store } = memoryStore();
		const { fetch, now } = fakeApp({
			status: (path) =>
				path === "/fr/praticien/c-3" ? 503 : path === "/fr/praticien/a-1" ? 404 : 200,
		});
		const env = { ...ENV, WARM_CACHE_CONCURRENCY: "1" };
		const report = await runWarm({ store, fetch, env, buildId: "b", now });
		expect(report).toMatchObject({ stopped: "throttled", missing: 1, errors: 1 });
	});

	it("stops at its time budget", async () => {
		const { store } = memoryStore();
		const { app, fetch, now } = fakeApp({ latency: () => 2000 });
		const env = { ...ENV, WARM_CACHE_MAX_SECONDS: "10", WARM_CACHE_MAX_P95_MS: "60000" };
		const report = await runWarm({ store, fetch, env, buildId: "b", now });
		expect(report).toMatchObject({ stopped: "time" });
		// Four at a time, two seconds each: the budget is spent after a few rounds.
		expect(app.requested.length).toBeLessThan(TOTAL);
		expect(app.requested.length).toBeGreaterThan(0);
	});
});
