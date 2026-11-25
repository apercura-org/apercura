/**
 * One run of the cache warm-up (`jobs:tick warm`): requests the next URLs of the sitemap walk
 * from the app, as a visitor would, so the pages are rendered and cached before crawlers and
 * visitors ask for them. Never hammers the app:
 *
 * - at most WARM_CACHE_CONCURRENCY requests at a time (4), WARM_CACHE_MAX_URLS per run (5000)
 *   and WARM_CACHE_MAX_SECONDS (240, within the five minutes between two runs);
 * - nothing when the health check fails or is slow; checked again every 15 seconds;
 * - stops when the p95 of its last 100 requests exceeds WARM_CACHE_MAX_P95_MS (3000), when the
 *   app answers 429 or 503, or on repeated errors.
 *
 * The cursor is saved as it goes, so the next run continues where this one stopped. A new
 * build, a new successful import, or the import's restart request (after it expired cache
 * tags) starts the walk over; a finished walk waits for one of them.
 */
import { marketPagePath } from "~/lib/sitemap-xml";
import {
	type Cursor,
	generationOf,
	LatencyWindow,
	type Outcome,
	outcomeOf,
	pagesPaths,
	remainingUrls,
	resumePoint,
	tooManyErrors,
	type WarmConfig,
	Watermark,
	warmConfig,
	warmHeaders,
	warmUnits,
} from "./plan";
import type { WarmStore } from "./store";

export type StopReason = "time" | "count" | "latency" | "unhealthy" | "throttled" | "errors";

export type WarmReport =
	| { skipped: "disabled" }
	| {
			generation: string;
			restarted: boolean;
			/** The walk was already over: nothing requested. */
			skipped?: "complete";
			/** Where the next run starts. */
			unit: string | null;
			position: number;
			warmed: number;
			missing: number;
			redirected: number;
			errors: number;
			/**
			 * URLs left in the walk (the chunks' counts: an estimate past the current unit); null
			 * when the run did not get to read them.
			 */
			remaining: number | null;
			completed: boolean;
			stopped: StopReason | null;
			p95Ms: number;
			durationMs: number;
			/** URLs warmed by every run of this walk. */
			total: number;
	  };

export type WarmDeps = {
	store: WarmStore;
	fetch: (input: URL, init: RequestInit) => Promise<Response>;
	env: Record<string, string | undefined>;
	/** The app's build id (`.next/BUILD_ID`), null when unknown. */
	buildId: string | null;
	/** Start over whatever the cursor says (`jobs:tick warm --restart`). */
	restart?: boolean;
	now?: () => number;
};

/** Saves the cursor at least this often during a run, in case the process is stopped. */
const SAVE_EVERY_MS = 20_000;

type Counts = Record<Outcome, number>;
const emptyCounts = (): Counts => ({
	warmed: 0,
	missing: 0,
	redirected: 0,
	throttled: 0,
	error: 0,
});

async function healthy(deps: WarmDeps, config: WarmConfig, now: () => number): Promise<boolean> {
	const started = now();
	try {
		const response = await deps.fetch(new URL("/api/health", config.baseUrl), {
			headers: { "user-agent": warmHeaders(config.publicUrl)["user-agent"] as string },
			redirect: "manual",
			signal: AbortSignal.timeout(config.healthMaxMs + 3000),
		});
		await response.arrayBuffer();
		return response.status === 200 && now() - started <= config.healthMaxMs;
	} catch {
		return false;
	}
}

export async function runWarm(deps: WarmDeps): Promise<WarmReport> {
	const config = warmConfig(deps.env);
	if (!config) return { skipped: "disabled" };
	const now = deps.now ?? Date.now;
	const started = now();
	const deadline = started + config.maxSeconds * 1000;
	const { store } = deps;

	const generation = generationOf(deps.buildId, await store.lastImportRun());
	let row = await store.read();
	let restarted = false;
	if (deps.restart || row.generation !== generation || row.restartRequestedAt) {
		row = await store.restart(generation, row.restartRequestedAt);
		restarted = true;
	}

	const counts = emptyCounts();
	const latencies = new LatencyWindow();
	let cursor: Cursor = { unit: row.unit, position: row.position };
	const report = (extra: {
		stopped: StopReason | null;
		completed: boolean;
		remaining: number | null;
		skipped?: "complete";
	}): WarmReport => ({
		generation,
		restarted,
		...(extra.skipped ? { skipped: extra.skipped } : {}),
		unit: cursor.unit,
		position: cursor.position,
		warmed: counts.warmed,
		missing: counts.missing,
		redirected: counts.redirected,
		errors: counts.error + counts.throttled,
		remaining: extra.remaining,
		completed: extra.completed,
		stopped: extra.stopped,
		p95Ms: Math.round(latencies.p95()),
		durationMs: now() - started,
		total: row.warmed + counts.warmed,
	});

	if (row.completedAt) {
		return report({ stopped: null, completed: true, remaining: 0, skipped: "complete" });
	}
	if (!(await healthy(deps, config, now))) {
		return report({ stopped: "unhealthy", completed: false, remaining: null });
	}

	const chunks = await store.chunks();
	const units = warmUnits(chunks);
	const headers = warmHeaders(config.publicUrl);
	let point = resumePoint(units, cursor);
	let dispatched = 0;
	let stopped: StopReason | null = null;
	let nextHealthAt = now() + config.healthEverySeconds * 1000;
	let checkingHealth = false;
	// Counts not yet added to the row.
	let unsaved = { warmed: 0, errors: 0 };
	let lastSave = now();

	const save = async (completed: boolean) => {
		// Taken before the write: requests that finish meanwhile count in the next save.
		const delta = unsaved;
		unsaved = { warmed: 0, errors: 0 };
		lastSave = now();
		await store.save({ ...cursor, ...delta, completed });
	};

	const budgetStop = (): StopReason | null => {
		if (now() >= deadline) return "time";
		if (dispatched >= config.maxUrls) return "count";
		if (latencies.count >= config.minSamples && latencies.p95() > config.maxP95Ms) return "latency";
		if (tooManyErrors(counts.error + counts.throttled, dispatched)) return "errors";
		return null;
	};

	const warmOne = async (path: string): Promise<Outcome> => {
		const begin = now();
		try {
			const response = await deps.fetch(new URL(path, config.baseUrl), {
				headers,
				redirect: "manual",
				signal: AbortSignal.timeout(config.requestTimeoutMs),
			});
			// Read to the end: the page is cached once its render completes.
			await response.arrayBuffer();
			return outcomeOf(response.status);
		} catch {
			return "error";
		} finally {
			latencies.push(now() - begin);
		}
	};

	let currentSize = 0;
	while (point && !stopped) {
		const unit = units[point.index];
		if (!unit) break;
		const paths = unit.chunk
			? (await store.entries(unit.chunk.market, unit.chunk.kind, unit.chunk.chunk)).map((path) =>
					marketPagePath(unit.chunk?.market ?? "fr", path),
				)
			: pagesPaths(chunks);
		currentSize = paths.length;
		cursor = { unit: unit.key, position: Math.min(point.position, paths.length) };
		const mark = new Watermark(cursor.position);
		let next = cursor.position;

		const worker = async () => {
			while (!stopped && next < paths.length) {
				const reason = budgetStop();
				if (reason) {
					stopped = reason;
					return;
				}
				const index = next++;
				dispatched += 1;
				const outcome = await warmOne(paths[index] as string);
				counts[outcome] += 1;
				if (outcome === "warmed") unsaved.warmed += 1;
				if (outcome === "error" || outcome === "throttled") unsaved.errors += 1;
				mark.complete(index);
				if (outcome === "throttled") stopped = "throttled";
				if (!checkingHealth && now() >= nextHealthAt) {
					checkingHealth = true;
					const ok = await healthy(deps, config, now);
					checkingHealth = false;
					nextHealthAt = now() + config.healthEverySeconds * 1000;
					if (!ok) stopped = "unhealthy";
				}
				if (now() - lastSave >= SAVE_EVERY_MS) {
					cursor = { unit: unit.key, position: mark.value };
					await save(false);
				}
			}
		};
		await Promise.all(Array.from({ length: config.concurrency }, worker));
		cursor = { unit: unit.key, position: mark.value };
		if (mark.value < paths.length) break;
		// The unit is done: the next one starts at its beginning.
		const following = units[point.index + 1];
		point = following ? { index: point.index + 1, position: 0 } : null;
		cursor = following ? { unit: following.key, position: 0 } : cursor;
		if (following) currentSize = following.size;
	}

	const completed = point === null;
	await save(completed);
	const index = units.findIndex((unit) => unit.key === cursor.unit);
	const remaining = completed
		? 0
		: remainingUrls(units, Math.max(0, index), cursor.position, currentSize);
	return report({ stopped, completed, remaining });
}
