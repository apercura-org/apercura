import { describe, expect, it } from "vitest";
import type { SitemapChunk } from "~/server/queries/sitemap-sql";
import {
	generationOf,
	LatencyWindow,
	outcomeOf,
	pagesPaths,
	parseMemorySize,
	percentile,
	rankOf,
	remainingUrls,
	resumePoint,
	tooManyErrors,
	WARM_DEFAULTS,
	WARM_USER_AGENT,
	Watermark,
	warmBudget,
	warmConfig,
	warmHeaders,
	warmUnits,
} from "./plan";

const chunk = (
	kind: SitemapChunk["kind"],
	index: number,
	urls: number,
	market: SitemapChunk["market"] = "fr",
): SitemapChunk => ({
	market,
	kind,
	chunk: index,
	lastmod: "2026-11-25",
	urls,
});

// As the sitemap index query returns them: ordered by kind name, then chunk.
const CHUNKS = [
	chunk("etablissements", 0, 40),
	chunk("lieux", 0, 300),
	chunk("listes", 0, 900),
	chunk("praticiens", 0, 20_000),
	chunk("praticiens", 2, 12_000),
];

describe("warm-up units", () => {
	it("walks the pages first, then listings, places, establishments and practitioners", () => {
		expect(warmUnits(CHUNKS).map((unit) => unit.key)).toEqual([
			"pages",
			"listes-0",
			"lieux-0",
			"etablissements-0",
			"praticiens-0",
			"praticiens-2",
		]);
	});

	it("puts the home pages, the static pages, the guides and every sitemap file in the pages unit", () => {
		const paths = pagesPaths(CHUNKS);
		expect(paths.slice(0, 3)).toEqual(["/", "/fr", "/fr/pro"]);
		expect(paths).toContain("/fr/annuaire");
		expect(paths).toContain("/fr/guides");
		expect(paths).toContain("/fr/guides/medecin-traitant");
		expect(paths).toContain("/sitemap.xml");
		expect(paths).toContain("/sitemaps/international.xml");
		expect(paths).toContain("/sitemaps/fr/pages-0.xml");
		expect(paths).toContain("/sitemaps/fr/praticiens-2.xml");
		expect(paths).toContain("/sitemaps/fr/etablissements-0.xml");
		expect(new Set(paths).size).toBe(paths.length);
		expect(warmUnits(CHUNKS)[0]?.size).toBe(paths.length);
	});

	it("ranks unit keys, and knows none it does not walk", () => {
		expect(rankOf("pages")).toEqual([0, 0]);
		expect(rankOf("listes-3")).toEqual([1, 3]);
		expect(rankOf("at-listes-3")).toEqual([2, 3]);
		expect(rankOf("gb-listes-3")).toEqual([3, 3]);
		expect(rankOf("cz-listes-3")).toEqual([4, 3]);
		expect(rankOf("praticiens-12")).toEqual([13, 12]);
		expect(rankOf("at-praticiens-12")).toEqual([14, 12]);
		expect(rankOf("gb-praticiens-12")).toEqual([15, 12]);
		expect(rankOf("cz-praticiens-12")).toEqual([16, 12]);
		expect(rankOf("cabinets-1")).toBeNull();
		expect(rankOf("praticiens")).toBeNull();
		expect(rankOf("de-listes-1")).toBeNull();
	});

	it("walks Austria's chunks beside France's, kind by kind", () => {
		const chunks = [
			...CHUNKS,
			chunk("listes", 0, 120, "at"),
			chunk("lieux", 0, 40, "at"),
			chunk("praticiens", 0, 9000, "at"),
		];
		expect(warmUnits(chunks).map((unit) => unit.key)).toEqual([
			"pages",
			"listes-0",
			"at-listes-0",
			"lieux-0",
			"at-lieux-0",
			"etablissements-0",
			"praticiens-0",
			"praticiens-2",
			"at-praticiens-0",
		]);
		const paths = pagesPaths(chunks);
		expect(paths).toContain("/at");
		expect(paths).toContain("/at/verzeichnis");
		expect(paths).toContain("/at/impressum");
		expect(paths).not.toContain("/at/pro");
		expect(paths).toContain("/sitemaps/at/pages-0.xml");
		expect(paths).toContain("/sitemaps/at/praticiens-0.xml");
	});
});

describe("resuming the walk", () => {
	const units = warmUnits(CHUNKS);

	it("starts at the beginning without a cursor", () => {
		expect(resumePoint(units, { unit: null, position: 0 })).toEqual({ index: 0, position: 0 });
	});

	it("continues in the cursor's unit at its offset", () => {
		expect(resumePoint(units, { unit: "praticiens-0", position: 1234 })).toEqual({
			index: 4,
			position: 1234,
		});
	});

	it("moves to the next unit when the cursor's chunk has gone", () => {
		// praticiens-1 is empty now: praticiens-2 follows it.
		expect(resumePoint(units, { unit: "praticiens-1", position: 50 })).toEqual({
			index: 5,
			position: 0,
		});
		// A listing chunk vanished: the place hubs come next.
		expect(resumePoint(units, { unit: "listes-7", position: 3 })).toEqual({
			index: 2,
			position: 0,
		});
	});

	it("is over past the last unit, and starts over on a key it does not know", () => {
		expect(resumePoint(units, { unit: "praticiens-9", position: 0 })).toBeNull();
		expect(resumePoint(units, { unit: "something-else", position: 8 })).toEqual({
			index: 0,
			position: 0,
		});
	});

	it("counts what is left: the rest of the unit and every unit after it", () => {
		expect(remainingUrls(units, 4, 15_000, 20_000)).toBe(5_000 + 12_000);
		expect(remainingUrls(units, 5, 12_000, 12_000)).toBe(0);
		expect(remainingUrls(units, 1, 900, 900)).toBe(300 + 40 + 20_000 + 12_000);
	});
});

describe("watermark", () => {
	it("stores the first offset not done when requests finish out of order", () => {
		const mark = new Watermark(10);
		mark.complete(12);
		mark.complete(11);
		expect(mark.value).toBe(10);
		mark.complete(10);
		expect(mark.value).toBe(13);
		mark.complete(5);
		mark.complete(14);
		expect(mark.value).toBe(13);
	});
});

describe("latency", () => {
	it("takes the nearest-rank percentile", () => {
		expect(percentile([], 0.95)).toBe(0);
		expect(percentile([5], 0.95)).toBe(5);
		const values = Array.from({ length: 100 }, (_, index) => index + 1);
		expect(percentile(values, 0.95)).toBe(95);
		expect(percentile(values, 0.5)).toBe(50);
	});

	it("keeps the last requests only", () => {
		const window = new LatencyWindow(3);
		for (const value of [5000, 5000, 5000, 10, 10, 10]) window.push(value);
		expect(window.count).toBe(3);
		expect(window.p95()).toBe(10);
	});
});

describe("settings", () => {
	it("is on by default, off with WARM_CACHE=false", () => {
		expect(warmConfig({ APP_URL: "https://apercura.org" })).not.toBeNull();
		expect(warmConfig({ APP_URL: "https://apercura.org", WARM_CACHE: "false" })).toBeNull();
		expect(warmConfig({ APP_URL: "https://apercura.org", WARM_CACHE: "0" })).toBeNull();
	});

	it("requests the internal URL, as the public host", () => {
		const config = warmConfig({
			APP_URL: "https://apercura.org",
			INTERNAL_APP_URL: "http://app:3000",
		});
		expect(config?.baseUrl.href).toBe("http://app:3000/");
		expect(config?.publicUrl.host).toBe("apercura.org");
		expect(warmConfig({ APP_URL: "https://apercura.org" })?.baseUrl.href).toBe(
			"https://apercura.org/",
		);
	});

	it("defaults to four requests at a time within a budget, and reads overrides", () => {
		const config = warmConfig({ APP_URL: "https://apercura.org" });
		expect(config).toMatchObject({
			concurrency: 4,
			maxUrls: WARM_DEFAULTS.maxUrls,
			maxSeconds: WARM_DEFAULTS.maxSeconds,
			maxP95Ms: WARM_DEFAULTS.maxP95Ms,
		});
		expect(
			warmConfig({
				APP_URL: "https://apercura.org",
				WARM_CACHE_CONCURRENCY: "2",
				WARM_CACHE_MAX_URLS: "100",
				WARM_CACHE_MAX_SECONDS: "60",
				WARM_CACHE_MAX_P95_MS: "1500",
			}),
		).toMatchObject({ concurrency: 2, maxUrls: 100, maxSeconds: 60, maxP95Ms: 1500 });
	});

	it("warms what half of the page cache holds, unless told otherwise", () => {
		const base = { APP_URL: "https://apercura.org" };
		// 1gb by default: half of it, 32 KB a page.
		expect(warmConfig(base)?.budgetUrls).toBe(16_384);
		expect(warmConfig({ ...base, CACHE_MAX_MEMORY: "2gb" })?.budgetUrls).toBe(32_768);
		expect(warmConfig({ ...base, CACHE_MAX_MEMORY: "512mb" })?.budgetUrls).toBe(8192);
		expect(warmConfig({ ...base, WARM_CACHE_BUDGET_URLS: "500" })?.budgetUrls).toBe(500);
		// 0: every sitemap URL, as before the cache was bounded.
		expect(warmConfig({ ...base, WARM_CACHE_BUDGET_URLS: "0" })?.budgetUrls).toBe(0);
		expect(warmBudget({ CACHE_MAX_MEMORY: "1073741824" })).toBe(16_384);
		expect(() => warmConfig({ ...base, CACHE_MAX_MEMORY: "a lot" })).toThrow("CACHE_MAX_MEMORY");
		expect(() => warmConfig({ ...base, WARM_CACHE_BUDGET_URLS: "-1" })).toThrow(
			"WARM_CACHE_BUDGET_URLS",
		);
	});

	it("reads memory sizes as Valkey does", () => {
		expect(parseMemorySize("1gb")).toBe(1024 ** 3);
		expect(parseMemorySize("1G")).toBe(1000 ** 3);
		expect(parseMemorySize("256mb")).toBe(256 * 1024 ** 2);
		expect(parseMemorySize("100kb")).toBe(102_400);
		expect(parseMemorySize("12345")).toBe(12_345);
		expect(parseMemorySize("1tb")).toBeNull();
		expect(parseMemorySize("")).toBeNull();
	});

	it("names a malformed or missing value", () => {
		expect(() => warmConfig({})).toThrow("APP_URL");
		expect(() =>
			warmConfig({ APP_URL: "https://apercura.org", WARM_CACHE_CONCURRENCY: "64" }),
		).toThrow("WARM_CACHE_CONCURRENCY");
		expect(() =>
			warmConfig({ APP_URL: "https://apercura.org", WARM_CACHE_MAX_URLS: "lots" }),
		).toThrow("WARM_CACHE_MAX_URLS");
		expect(() => warmConfig({ APP_URL: "https://apercura.org", INTERNAL_APP_URL: "app" })).toThrow(
			"INTERNAL_APP_URL",
		);
	});
});

describe("requests", () => {
	it("sends the public host and scheme, and says who it is", () => {
		expect(warmHeaders(new URL("https://apercura.org"))).toEqual({
			host: "apercura.org",
			"x-forwarded-host": "apercura.org",
			"x-forwarded-proto": "https",
			"user-agent": WARM_USER_AGENT,
			accept: expect.stringContaining("text/html"),
		});
		expect(warmHeaders(new URL("http://localhost:3100"))).toMatchObject({
			host: "localhost:3100",
			"x-forwarded-proto": "http",
		});
	});

	it("sorts answers into warmed, gone, redirected, back off and errors", () => {
		expect(outcomeOf(200)).toBe("warmed");
		expect(outcomeOf(404)).toBe("missing");
		expect(outcomeOf(410)).toBe("missing");
		expect(outcomeOf(308)).toBe("redirected");
		expect(outcomeOf(429)).toBe("throttled");
		expect(outcomeOf(503)).toBe("throttled");
		expect(outcomeOf(500)).toBe("error");
	});

	it("stops on errors past ten that make up more than a tenth of the requests", () => {
		expect(tooManyErrors(9, 9)).toBe(false);
		expect(tooManyErrors(10, 50)).toBe(true);
		expect(tooManyErrors(10, 100)).toBe(false);
		expect(tooManyErrors(11, 100)).toBe(true);
	});

	it("names the walk after the build and the last import", () => {
		expect(generationOf("abc", 42)).toBe("build:abc|import:42");
		expect(generationOf(null, null)).toBe("build:unknown|import:none");
		expect(generationOf("abc", 42)).not.toBe(generationOf("abd", 42));
		expect(generationOf("abc", 42)).not.toBe(generationOf("abc", 43));
	});
});
