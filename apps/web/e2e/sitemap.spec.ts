import { type APIRequestContext, expect, test } from "@playwright/test";
import { parse } from "./seo-html";

/*
 * The sitemaps, read as crawlers get them: the index, every chunk, and every URL they list, each
 * an indexable 200 page whose canonical is itself. Against the SYNTHETIC fixtures.
 *
 * Its own project in playwright.config.ts, first in the queue, and its tests one after the other
 * on one worker: the walk is bound by the server, which renders every page on one core, so it
 * runs from the start beside the browser tests on the other worker instead of holding both
 * workers at the end of the run (#157). A failed part is retried alone; the next parts still run.
 */
test.describe.configure({ mode: "default" });

/** Pages another spec unpublishes and publishes again during the run (owner.spec.ts). */
const MUTATED_BY_OTHER_SPECS = ["/fr/praticien/benoit-essaial-19999991110"];

/**
 * Requests in flight at once when a test walks the chunks or its URLs. The server renders on one
 * core: the walk of every URL took 107 s one at a time, 62 s four at a time and 57–59 s from six
 * to twenty locally, so more only queues and slows the browser tests sharing the server (#157).
 */
const SITEMAP_CONCURRENCY = 5;

/**
 * The tests the sitemap's URLs are checked in, each an equal run of them in the index's order.
 * One walk of every URL outgrew its fixed timeout as markets opened (6,684 URLs in 258 s on CI
 * with Switzerland, #157); eight parts keep each one under a minute on CI, and a retry walks one
 * part again, not the whole sitemap.
 */
const SITEMAP_PARTS = 8;

/**
 * Each part's timeout: a fixed allowance for reading the index and its chunks, then the time
 * each of its URLs may take. CI walked the sitemap at 31–39 ms a URL (6,684 URLs in 258 s on
 * b0a261f): about three times that, so the timeout follows the fixtures as they grow.
 */
const SITEMAP_BASE_TIMEOUT_MS = 30_000;
const SITEMAP_MS_PER_URL = 100;

/**
 * The index's groups of files: the international home's own file, then each open market's files
 * under its segment (France in French, Austria in German, the UK in English, Czechia in Czech,
 * Spain in Spanish, Italy in Italian, Germany in German, Switzerland in its three, Estonia in
 * Estonian, Poland in
 * Polish, Norway in Norwegian, Ireland in English, Finland in Finnish, Lithuania in Lithuanian). Interface
 * translations (/fr-de, /fr-es…) are never listed.
 */
const SITEMAP_GROUPS = [
	"international",
	"fr",
	"at",
	"gb",
	"cz",
	"es",
	"it",
	"de",
	"ch",
	"ch-fr",
	"ch-it",
	"ee",
	"pl",
	"no",
	"ie",
	"fi",
	"lt",
] as const;
type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

const LOC = /<loc>([^<]+)<\/loc>/g;
const LASTMOD = /<lastmod>([^<]+)<\/lastmod>/g;

/**
 * `fn` over every item with at most `limit` calls in flight, results in the items' order.
 * After a failure no new item starts, and the calls already running are awaited before the
 * first error is rethrown, so none outlives the test and its request context.
 */
async function mapConcurrently<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	let failed = false;
	const worker = async () => {
		while (!failed && next < items.length) {
			const index = next++;
			try {
				results[index] = await fn(items[index] as T);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};
	const settled = await Promise.allSettled(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	const rejected = settled.find((outcome) => outcome.status === "rejected");
	if (rejected) throw rejected.reason;
	return results;
}

/** The group a chunk of the index belongs to, from its path. */
function sitemapGroupOf(chunk: string, origin: string): SitemapGroup | null {
	if (chunk === `${origin}/sitemaps/international.xml`) return "international";
	const segment = /^\/sitemaps\/([a-z-]+)\/[a-z]+-\d+\.xml$/.exec(chunk.slice(origin.length))?.[1];
	return SITEMAP_GROUPS.find((group) => group !== "international" && group === segment) ?? null;
}

/** True when `url` is a page of the group's own site: its home or a path under it. */
function inSitemapGroup(url: string, group: SitemapGroup, origin: string): boolean {
	if (group === "international") return url === `${origin}/`;
	const home = `${origin}/${group}`;
	return url === home || url.startsWith(`${home}/`);
}

/** The index's chunk URLs, in its order. */
async function indexChunks(request: APIRequestContext): Promise<string[]> {
	const index = await request.get("/sitemap.xml");
	expect(index.status()).toBe(200);
	return [...(await index.text()).matchAll(LOC)].map((match) => match[1] ?? "");
}

/** A chunk's URLs, once the chunk is checked to be a valid sitemap of its group. */
async function chunkLocs(request: APIRequestContext, origin: string, chunk: string) {
	expect(chunk.startsWith(`${origin}/sitemaps/`), chunk).toBe(true);
	const group = sitemapGroupOf(chunk, origin);
	expect(group, chunk).not.toBeNull();
	const response = await request.get(chunk);
	expect(response.status(), chunk).toBe(200);
	const xml = await response.text();
	expect(xml, chunk).toMatch(
		/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
	);
	expect(xml, chunk).not.toMatch(/changefreq|priority/);
	const locs = [...xml.matchAll(LOC)].map((match) => match[1] ?? "");
	expect(locs.length, chunk).toBeGreaterThan(0);
	expect(locs.length, chunk).toBeLessThanOrEqual(50_000);
	for (const lastmod of xml.matchAll(LASTMOD)) {
		expect(lastmod[1], chunk).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	}
	return locs.map((url) => ({ url, group: group as SitemapGroup }));
}

/** Every URL of the sitemap with the group of the chunk listing it, in the index's order. */
async function sitemapEntries(request: APIRequestContext, origin: string) {
	const chunks = await indexChunks(request);
	return (
		await mapConcurrently(chunks, SITEMAP_CONCURRENCY, (chunk) => chunkLocs(request, origin, chunk))
	).flat();
}

test("the index lists valid chunks of unique URLs, each under its market's segment", async ({
	request,
	baseURL,
}) => {
	const origin = new URL(baseURL ?? "").origin;
	const index = await request.get("/sitemap.xml");
	expect(index.headers()["content-type"]).toContain("xml");
	const indexXml = await index.text();
	expect(indexXml).toMatch(
		/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
	);
	const chunks = [...indexXml.matchAll(LOC)].map((match) => match[1] ?? "");
	expect(chunks.length).toBeGreaterThan(2);
	// The international home, then each open market's files under its segment.
	expect(chunks.slice(0, 2)).toEqual([
		`${origin}/sitemaps/international.xml`,
		`${origin}/sitemaps/fr/pages-0.xml`,
	]);
	expect(chunks).toContain(`${origin}/sitemaps/at/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/gb/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/gb/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/cz/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/cz/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/es/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/it/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/it/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/de/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/de/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/pl/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/pl/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/fi/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/fi/praticiens-0.xml`);
	// Switzerland's files under each of its languages.
	for (const segment of ["ch", "ch-fr", "ch-it"]) {
		expect(chunks).toContain(`${origin}/sitemaps/${segment}/pages-0.xml`);
		expect(chunks).toContain(`${origin}/sitemaps/${segment}/praticiens-0.xml`);
	}
	expect(chunks).toContain(`${origin}/sitemaps/ee/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/ee/praticiens-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/no/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/no/praticiens-0.xml`);
	// Ireland's files under /ie.
	expect(chunks).toContain(`${origin}/sitemaps/ie/pages-0.xml`);
	expect(chunks).toContain(`${origin}/sitemaps/ie/praticiens-0.xml`);
	for (const chunk of chunks) expect(sitemapGroupOf(chunk, origin), chunk).not.toBeNull();
	for (const lastmod of indexXml.matchAll(LASTMOD)) {
		expect(lastmod[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	}

	const urls = (await sitemapEntries(request, origin)).map((entry) => entry.url);
	// Enough URLs for every part below to check some.
	expect(urls.length).toBeGreaterThanOrEqual(SITEMAP_PARTS);
	expect(new Set(urls).size).toBe(urls.length);
	expect(urls).toContain(`${origin}/`);
	expect(urls).toContain(`${origin}/fr`);
	expect(urls).toContain(`${origin}/at`);
	expect(urls).toContain(`${origin}/gb`);
	expect(urls).toContain(`${origin}/cz`);
	expect(urls).toContain(`${origin}/es`);
	expect(urls).toContain(`${origin}/it`);
	expect(urls).toContain(`${origin}/de`);
	expect(urls).toContain(`${origin}/pl`);
	expect(urls).toContain(`${origin}/fi`);
	// Helsinki, which organises its own care, is its department's page: never a URL of its own.
	expect(urls).not.toContain(`${origin}/fi/terveysasemat/helsinki/helsinki`);
	// A city with powiat rights is its powiat's page: never a URL of its own.
	expect(urls).not.toContain(`${origin}/pl/stomatologia/legnica/legnica`);
	// A kreisfreie Stadt's city page is its Kreis's: never a URL of its own.
	expect(urls).not.toContain(`${origin}/de/krankenhaeuser/potsdam/potsdam`);
	expect(urls).toContain(`${origin}/ch`);
	expect(urls).toContain(`${origin}/ie`);
	expect(urls).toContain(`${origin}/ie/data`);
	expect(urls).toContain(`${origin}/ch-fr`);
	expect(urls).toContain(`${origin}/ch-it`);
	expect(urls).toContain(`${origin}/ee`);
	// A town that is its own municipality has the municipality's page only.
	expect(urls).not.toContain(`${origin}/ee/hambaravi/keila-linn/keila-linn`);
	expect(urls).toContain(`${origin}/no`);
	// Oslo, a municipality that is its county, has the county's page only.
	expect(urls).not.toContain(`${origin}/no/legekontorer/oslo/oslo`);
});

// Every URL is checked: the parts are consecutive runs of the index's URLs that together cover
// all of them.
for (let part = 1; part <= SITEMAP_PARTS; part++) {
	test(`sitemap URLs, part ${part} of ${SITEMAP_PARTS}: indexable canonical 200 pages of their market`, async ({
		request,
		baseURL,
	}) => {
		const origin = new URL(baseURL ?? "").origin;
		const entries = await sitemapEntries(request, origin);
		// Equal runs to a URL: none is empty while the sitemap lists SITEMAP_PARTS URLs or more.
		const mine = entries.slice(
			Math.floor(((part - 1) * entries.length) / SITEMAP_PARTS),
			Math.floor((part * entries.length) / SITEMAP_PARTS),
		);
		expect(mine.length).toBeGreaterThan(0);
		test.setTimeout(SITEMAP_BASE_TIMEOUT_MS + mine.length * SITEMAP_MS_PER_URL);
		const started = Date.now();
		await mapConcurrently(mine, SITEMAP_CONCURRENCY, async ({ url, group }) => {
			// owner.spec.ts removes and restores this claimed page while the specs run in
			// parallel (#119): the sitemap, cached up to five minutes, may still list it meanwhile.
			if (MUTATED_BY_OTHER_SPECS.some((path) => url === `${origin}${path}`)) return;
			// A chunk lists its own site's pages only, in that site's language.
			expect(inSitemapGroup(url, group, origin), url).toBe(true);
			expect(url, url).not.toMatch(/\/recherche|\/pro\/|\/rdv/);
			const response = await request.get(url, { maxRedirects: 0 });
			expect(response.status(), url).toBe(200);
			expect(response.headers()["x-robots-tag"], url).toBeUndefined();
			const page = parse(await response.text());
			expect(page.meta("robots"), url).toEqual(["index, follow"]);
			const canonical = page.links.find((link) => link.rel === "canonical")?.href ?? "";
			expect(canonical.replace(/\/$/, ""), url).toBe(url.replace(/\/$/, ""));
		});
		test.info().annotations.push({
			type: "sitemap",
			description: `part ${part}: ${mine.length} of ${entries.length} URLs (${mine[0]?.url} to ${mine.at(-1)?.url}) checked in ${Date.now() - started} ms (concurrency ${SITEMAP_CONCURRENCY})`,
		});
	});
}

test("robots.txt points to the index and never hides a noindex page linked publicly", async ({
	request,
}) => {
	const body = await (await request.get("/robots.txt")).text();
	expect(body).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
	const disallowed = [...body.matchAll(/^Disallow: (.+)$/gm)].map((match) => match[1] ?? "");
	for (const path of [
		"/",
		"/fr",
		"/fr/pro",
		"/fr/pro/connexion",
		"/fr/pro/inscription",
		"/fr/pro/revendiquer?rpps=19999990013",
		"/fr/praticien/camille-exemple-19999990013/signaler",
		"/fr-en/practitioner/camille-exemple-19999990013",
		"/fr-de/behandler/camille-exemple-19999990013",
		"/fr-es/profesional/camille-exemple-19999990013",
		"/fr-it/professionista/camille-exemple-19999990013",
		"/fr-it/professionista/camille-exemple-19999990013/segnalazione",
	]) {
		expect(
			disallowed.some((prefix) => path.startsWith(prefix)),
			path,
		).toBe(false);
	}
});
