/**
 * Lighthouse CI (`bun run lhci`): Core Web Vitals and JavaScript budgets of the
 * public pages, on Lighthouse's default mobile emulation (Moto G Power, slow
 * 4G, 4x CPU slowdown, simulated). Runs the built app (`next start`) against
 * the SYNTHETIC fixtures, like the e2e job. LHCI_PORT moves the server.
 *
 * Measuring on shared CI runners:
 * - The server is warmed up before the first run (scripts/lhci-server.ts): a
 *   cold `next start` competes with the browser for the CPU and made the first
 *   run several times slower than the others.
 * - Five runs per page. Total Blocking Time is asserted on their median: the
 *   simulation multiplies the CPU time observed on the runner by four, so TBT
 *   follows the runner's speed and a single slow or lucky run says little.
 *   200 ms is Lighthouse's own "good" mark for mobile TBT. On a GitHub
 *   runner (benchmarkIndex about 2,400) the medians are about 110 ms (home)
 *   and 60 ms (practitioner, listing); the home page's best run was 296 ms
 *   while it hydrated its search form at load. A laptop reproduces runner
 *   figures with `--settings.throttling.cpuSlowdownMultiplier=12`.
 * - Largest Contentful Paint is bimodal under simulation: the text is painted
 *   either before or after the web fonts arrive (`font-display: swap`), about
 *   900 or 3000 ms, run to run, on unchanged code. It is asserted on the best
 *   run, which still moves when every run gets slower.
 */
const port = Number(process.env.LHCI_PORT ?? 4100);
const base = `http://localhost:${port}`;

const HOME = `${base}/fr`;
const PRACTITIONER = `${base}/fr/praticien/camille-exemple-19999990013`;
const LISTING = `${base}/fr/medecin-generaliste/75-paris`;
const URLS = [HOME, PRACTITIONER, LISTING];

/** Web vitals every public page must meet. */
const vitals = {
	"largest-contentful-paint": ["error", { maxNumericValue: 1800, aggregationMethod: "optimistic" }],
	"cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
	"total-blocking-time": ["error", { maxNumericValue: 200, aggregationMethod: "median" }],
	"categories:seo": ["error", { minScore: 1 }],
	"categories:accessibility": ["error", { minScore: 0.95 }],
};

/*
 * All JavaScript transferred during the run, gzip, prefetches of linked pages
 * included (Lighthouse cannot tell them apart): a regression cap. React 19,
 * React DOM and the Next.js runtime alone weigh about 130 KB; what each page
 * adds on first load has its own budget in e2e/performance.spec.ts (60 KB on
 * the practitioner page, whose map and booking panel load on demand).
 */
const script = (kilobytes) => ["error", { maxNumericValue: kilobytes * 1024 }];

module.exports = {
	ci: {
		collect: {
			startServerCommand: `bun scripts/lhci-server.ts ${port} ${URLS.join(" ")}`,
			// Printed by scripts/lhci-server.ts once the pages are warm.
			startServerReadyPattern: "Lighthouse CI server warmed up",
			startServerReadyTimeout: 120_000,
			url: URLS,
			numberOfRuns: 5,
			settings: {
				chromeFlags: "--headless=new --no-sandbox --lang=fr-FR",
				// A French visitor, as most visitors of the France pages.
				extraHeaders: JSON.stringify({ "Accept-Language": "fr-FR,fr;q=0.9" }),
			},
		},
		assert: {
			assertMatrix: [
				{
					matchingUrlPattern: "/praticien/",
					assertions: { ...vitals, "resource-summary:script:size": script(330) },
				},
				{
					matchingUrlPattern: "/medecin-generaliste/",
					assertions: { ...vitals, "resource-summary:script:size": script(330) },
				},
				{
					matchingUrlPattern: `^${base}/fr$`,
					assertions: { ...vitals, "resource-summary:script:size": script(330) },
				},
			],
		},
		upload: { target: "filesystem", outputDir: ".lighthouseci" },
	},
};
