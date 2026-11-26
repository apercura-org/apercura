/**
 * The cache warm-up's plan, without I/O: which URLs it walks and in what order, where a run
 * resumes, its settings and the requests it sends. `./run` executes it (`jobs:tick warm`).
 *
 * The walk is the sitemaps' (`~/server/queries/sitemap-sql`, the same queries), split in
 * units: `pages` first (the home pages, the static pages, the guides and the sitemap files),
 * then each sitemap chunk, listings and place hubs before establishments and practitioners
 * (fewer pages, more visits each). A cursor is a unit key and an offset in its URL list.
 */
import { FRANCE_SEGMENT } from "~/i18n/locales";
import { guidePaths } from "~/lib/guides/catalog";
import { MARKET_STATIC_PATHS, marketPagePath } from "~/lib/sitemap-xml";
import {
	SITEMAP_MARKETS,
	type SitemapChunk,
	type SitemapKind,
	type SitemapMarket,
} from "~/server/queries/sitemap-sql";

export const PAGES_UNIT = "pages";

/** Walk order of the chunk kinds. */
export const WARM_KIND_ORDER: readonly SitemapKind[] = [
	"listes",
	"lieux",
	"etablissements",
	"praticiens",
];

/** Sort key of a unit: `pages` is [0, 0], `{kind}-{chunk}` is [1 + kind order, chunk]. */
export type UnitRank = readonly [number, number];

export type WarmUnit = {
	key: string;
	rank: UnitRank;
	/** The chunk it lists, or null for `pages`. */
	chunk: { market: SitemapMarket; kind: SitemapKind; chunk: number } | null;
	/** URLs in the unit (the chunk's count from the sitemap index query). */
	size: number;
};

export type Cursor = { unit: string | null; position: number };

const compareRank = (a: UnitRank, b: UnitRank) => a[0] - b[0] || a[1] - b[1];

/** The sitemap file of a chunk, as the sitemap index lists it. */
export const chunkFile = (kind: SitemapKind, chunk: number, market: SitemapMarket = "fr") =>
	`/sitemaps/${market}/${kind}-${chunk}.xml`;

/**
 * The unit key of a chunk: `{kind}-{chunk}` for France (the keys of the walks before Austria
 * opened, so a stored cursor still resumes), `{market}-{kind}-{chunk}` for another market.
 */
export const unitKey = (market: SitemapMarket, kind: SitemapKind, chunk: number) =>
	market === "fr" ? `${kind}-${chunk}` : `${market}-${kind}-${chunk}`;

/**
 * The `pages` unit: the international home, every market's static pages and France's guides
 * (as the `pages-0.xml` sitemaps list them), then the sitemap index and every sitemap file
 * (crawlers fetch them too).
 */
export function pagesPaths(chunks: readonly SitemapChunk[]): string[] {
	return [
		"/",
		...SITEMAP_MARKETS.flatMap((market) =>
			MARKET_STATIC_PATHS[market].map((path) => marketPagePath(market, path)),
		),
		...guidePaths().map((guide) => marketPagePath(FRANCE_SEGMENT, guide.path)),
		"/sitemap.xml",
		"/sitemaps/international.xml",
		...SITEMAP_MARKETS.map((market) => `/sitemaps/${market}/pages-0.xml`),
		...chunks.map((chunk) => chunkFile(chunk.kind, chunk.chunk, chunk.market)),
	];
}

/**
 * Sort key of a chunk: kinds in walk order, each kind's markets side by side (France, then
 * Austria), so every market's listings come before any market's practitioners.
 */
const chunkRank = (market: SitemapMarket, kind: SitemapKind, chunk: number): UnitRank => [
	1 + WARM_KIND_ORDER.indexOf(kind) * SITEMAP_MARKETS.length + SITEMAP_MARKETS.indexOf(market),
	chunk,
];

/** The units of a walk, in order, from the sitemap index query. */
export function warmUnits(chunks: readonly SitemapChunk[]): WarmUnit[] {
	const units = chunks
		.filter((chunk) => WARM_KIND_ORDER.includes(chunk.kind))
		.map(
			(chunk): WarmUnit => ({
				key: unitKey(chunk.market, chunk.kind, chunk.chunk),
				rank: chunkRank(chunk.market, chunk.kind, chunk.chunk),
				chunk: { market: chunk.market, kind: chunk.kind, chunk: chunk.chunk },
				size: chunk.urls,
			}),
		)
		.sort((a, b) => compareRank(a.rank, b.rank));
	return [
		{ key: PAGES_UNIT, rank: [0, 0], chunk: null, size: pagesPaths(chunks).length },
		...units,
	];
}

/** The rank of a unit key, or null for a key this version does not know. */
export function rankOf(key: string): UnitRank | null {
	if (key === PAGES_UNIT) return [0, 0];
	const match = /^(?:([a-z]{2})-)?([a-z]+)-(\d+)$/.exec(key);
	const market = (match?.[1] ?? "fr") as SitemapMarket;
	const kind = match?.[2] as SitemapKind | undefined;
	if (!match || !kind || !WARM_KIND_ORDER.includes(kind)) return null;
	if (!SITEMAP_MARKETS.includes(market)) return null;
	return chunkRank(market, kind, Number(match[3]));
}

/**
 * Where a run starts: the cursor's unit at its offset; when that unit has gone (its chunk is
 * empty now), the first unit after it; an unknown key starts over. Null when the walk is
 * over.
 */
export function resumePoint(
	units: readonly WarmUnit[],
	cursor: Cursor,
): { index: number; position: number } | null {
	if (!cursor.unit) return units.length > 0 ? { index: 0, position: 0 } : null;
	const index = units.findIndex((unit) => unit.key === cursor.unit);
	if (index >= 0) return { index, position: Math.max(0, cursor.position) };
	const rank = rankOf(cursor.unit);
	if (!rank) return units.length > 0 ? { index: 0, position: 0 } : null;
	const next = units.findIndex((unit) => compareRank(unit.rank, rank) > 0);
	return next < 0 ? null : { index: next, position: 0 };
}

/** URLs left in the walk: the rest of the current unit, then every unit after it. */
export function remainingUrls(
	units: readonly WarmUnit[],
	index: number,
	position: number,
	currentSize: number,
): number {
	let remaining = Math.max(0, currentSize - position);
	for (const unit of units.slice(index + 1)) remaining += unit.size;
	return remaining;
}

/**
 * The first index not yet done, when indexes complete out of order (concurrent requests):
 * the offset a cursor may safely store.
 */
export class Watermark {
	#low: number;
	readonly #done = new Set<number>();

	constructor(start: number) {
		this.#low = start;
	}

	complete(index: number): void {
		if (index < this.#low) return;
		this.#done.add(index);
		while (this.#done.delete(this.#low)) this.#low += 1;
	}

	get value(): number {
		return this.#low;
	}
}

/** The nearest-rank percentile (0 < p ≤ 1) of `values`, or 0 when empty. */
export function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
	return sorted[rank - 1] ?? 0;
}

/** The last `size` latencies, for a rolling p95. */
export class LatencyWindow {
	readonly #values: number[] = [];

	constructor(readonly size = 100) {}

	push(ms: number): void {
		this.#values.push(ms);
		if (this.#values.length > this.size) this.#values.shift();
	}

	get count(): number {
		return this.#values.length;
	}

	p95(): number {
		return percentile(this.#values, 0.95);
	}
}

export type WarmConfig = {
	/** Where requests go: INTERNAL_APP_URL, else APP_URL. */
	baseUrl: URL;
	/** The public origin (APP_URL), sent as the Host so the canonical host check passes. */
	publicUrl: URL;
	concurrency: number;
	maxUrls: number;
	/**
	 * URLs warmed per walk (per build and import), at most; 0 for every sitemap URL. Once
	 * reached, the walk is over until the next build or import.
	 */
	budgetUrls: number;
	maxSeconds: number;
	maxP95Ms: number;
	/** The app's health check must answer 200 within this, before and during a run. */
	healthMaxMs: number;
	requestTimeoutMs: number;
	/** Seconds between two health checks during a run. */
	healthEverySeconds: number;
	/** p95 is only judged once this many requests are in the window. */
	minSamples: number;
};

export const WARM_DEFAULTS = {
	concurrency: 4,
	maxUrls: 5000,
	maxSeconds: 240,
	maxP95Ms: 3000,
	healthMaxMs: 2000,
	requestTimeoutMs: 30_000,
	healthEverySeconds: 15,
	minSamples: 20,
} as const;

/**
 * What a warmed URL takes in the page cache, on average: its page (HTML, RSC payload and
 * segments, Brotli-compressed: about 24 KB for a practitioner, the home or a listing with its
 * place, 13 KB for a country-wide listing, measured on the synthetic fixtures) and the cached
 * queries and tag marks it brings along, rounded up for real pages, which list more.
 */
export const WARM_ENTRY_BYTES = 32 * 1024;

/** The part of the page cache the warm-up may fill: the rest is for what visitors ask. */
export const WARM_CACHE_SHARE = 0.5;

/** The page cache's size by default (CACHE_MAX_MEMORY in docker/compose.app.yml). */
export const DEFAULT_CACHE_MAX_MEMORY = "1gb";

const SIZE_UNITS: Record<string, number> = {
	"": 1,
	b: 1,
	k: 1000,
	kb: 1024,
	m: 1000 ** 2,
	mb: 1024 ** 2,
	g: 1000 ** 3,
	gb: 1024 ** 3,
};

/** Bytes of a Valkey memory size (`1gb`, `512mb`, `2g`, `1073741824`), or null. */
export function parseMemorySize(value: string): number | null {
	const match = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(value.trim());
	const unit = SIZE_UNITS[match?.[2]?.toLowerCase() ?? "x"];
	if (!match || unit === undefined) return null;
	const bytes = Math.floor(Number(match[1]) * unit);
	return bytes > 0 ? bytes : null;
}

/**
 * URLs a walk may warm: WARM_CACHE_BUDGET_URLS, else what WARM_CACHE_SHARE of CACHE_MAX_MEMORY
 * holds at WARM_ENTRY_BYTES each (16,384 for the default 1gb). Warming more than the cache
 * holds would only evict what the walk warmed first, the most visited pages.
 */
export function warmBudget(env: Record<string, string | undefined>): number {
	const explicit = env.WARM_CACHE_BUDGET_URLS;
	if (explicit !== undefined && explicit.trim() !== "") {
		return integer(explicit, 0, 0, 100_000_000);
	}
	const raw = env.CACHE_MAX_MEMORY?.trim() || DEFAULT_CACHE_MAX_MEMORY;
	const bytes = parseMemorySize(raw);
	if (bytes === null) throw new Error(`expected a size such as 1gb or 512mb, got "${raw}"`);
	return Math.max(1, Math.floor((bytes * WARM_CACHE_SHARE) / WARM_ENTRY_BYTES));
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
	if (value === undefined || value.trim() === "") return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
		throw new Error(`expected an integer between ${min} and ${max}, got "${value}"`);
	}
	return parsed;
}

function url(name: string, value: string | undefined): URL | null {
	if (!value) return null;
	try {
		return new URL(value);
	} catch {
		throw new Error(`${name} is not a URL`);
	}
}

/**
 * The warm-up's settings (docs/configuration.md): WARM_CACHE (`false` turns it off),
 * WARM_CACHE_CONCURRENCY, WARM_CACHE_MAX_URLS, WARM_CACHE_MAX_SECONDS, WARM_CACHE_MAX_P95_MS,
 * WARM_CACHE_BUDGET_URLS (else CACHE_MAX_MEMORY), APP_URL and INTERNAL_APP_URL. Null when
 * turned off; throws on a malformed value, naming it.
 */
export function warmConfig(env: Record<string, string | undefined>): WarmConfig | null {
	const flag = env.WARM_CACHE?.trim().toLowerCase();
	if (flag === "false" || flag === "0") return null;
	const publicUrl = url("APP_URL", env.APP_URL);
	if (!publicUrl) throw new Error("APP_URL is not set");
	const baseUrl = url("INTERNAL_APP_URL", env.INTERNAL_APP_URL) ?? publicUrl;
	const read = (name: string, fallback: number, min: number, max: number) => {
		try {
			return integer(env[name], fallback, min, max);
		} catch (error) {
			throw new Error(`${name}: ${(error as Error).message}`);
		}
	};
	return {
		baseUrl,
		publicUrl,
		concurrency: read("WARM_CACHE_CONCURRENCY", WARM_DEFAULTS.concurrency, 1, 16),
		maxUrls: read("WARM_CACHE_MAX_URLS", WARM_DEFAULTS.maxUrls, 1, 1_000_000),
		maxSeconds: read("WARM_CACHE_MAX_SECONDS", WARM_DEFAULTS.maxSeconds, 5, 86_400),
		maxP95Ms: read("WARM_CACHE_MAX_P95_MS", WARM_DEFAULTS.maxP95Ms, 100, 120_000),
		budgetUrls: (() => {
			try {
				return warmBudget(env);
			} catch (error) {
				const name = env.WARM_CACHE_BUDGET_URLS?.trim()
					? "WARM_CACHE_BUDGET_URLS"
					: "CACHE_MAX_MEMORY";
				throw new Error(`${name}: ${(error as Error).message}`);
			}
		})(),
		healthMaxMs: WARM_DEFAULTS.healthMaxMs,
		requestTimeoutMs: WARM_DEFAULTS.requestTimeoutMs,
		healthEverySeconds: WARM_DEFAULTS.healthEverySeconds,
		minSamples: WARM_DEFAULTS.minSamples,
	};
}

export const WARM_USER_AGENT = "ApercuraCacheWarmup/1.0 (+jobs:tick warm)";

/**
 * Headers of a warm-up request: the public host (the app redirects any other host to it, and
 * would render nothing), the public scheme, and a user agent that says what it is.
 */
export function warmHeaders(publicUrl: URL): Record<string, string> {
	return {
		host: publicUrl.host,
		"x-forwarded-host": publicUrl.host,
		"x-forwarded-proto": publicUrl.protocol.replace(/:$/, ""),
		"user-agent": WARM_USER_AGENT,
		accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	};
}

/** What a walk is for: the build and the last successful import. Either changing restarts it. */
export function generationOf(buildId: string | null, importRunId: number | null): string {
	return `build:${buildId ?? "unknown"}|import:${importRunId ?? "none"}`;
}

export type Outcome = "warmed" | "missing" | "redirected" | "throttled" | "error";

/** 2xx warmed, 404/410 gone since the sitemap was read, 3xx redirected, 429/503 back off. */
export function outcomeOf(status: number): Outcome {
	if (status >= 200 && status < 300) return "warmed";
	if (status === 404 || status === 410) return "missing";
	if (status >= 300 && status < 400) return "redirected";
	if (status === 429 || status === 503) return "throttled";
	return "error";
}

/** A run stops on its first failure past ten requests that makes up more than a tenth of them. */
export function tooManyErrors(errors: number, attempted: number): boolean {
	return errors >= 10 && errors * 10 > attempted;
}
