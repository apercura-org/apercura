/**
 * Lighthouse CI (`bun run lhci`): Core Web Vitals and JavaScript budgets of the
 * public pages, on Lighthouse's default mobile emulation (Moto G Power, slow
 * 4G, 4x CPU slowdown, simulated). Runs the built app (`next start`) against
 * the SYNTHETIC fixtures, like the e2e job. LHCI_PORT moves the server.
 */
const port = Number(process.env.LHCI_PORT ?? 4100);
const base = `http://localhost:${port}`;

const HOME = `${base}/`;
const PRACTITIONER = `${base}/praticien/camille-exemple-19999990013`;
const LISTING = `${base}/medecin-generaliste/75-paris`;

/** Web vitals every public page must meet. */
const vitals = {
	"largest-contentful-paint": ["error", { maxNumericValue: 1800 }],
	"cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
	"total-blocking-time": ["error", { maxNumericValue: 200 }],
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
			startServerCommand: `bun run start --port ${port}`,
			startServerReadyPattern: "Ready in",
			startServerReadyTimeout: 60_000,
			url: [HOME, PRACTITIONER, LISTING],
			numberOfRuns: 3,
			settings: {
				chromeFlags: "--headless=new --no-sandbox --lang=fr-FR",
				// A French visitor: an English browser would be sent to the (noindex) /en pages
				// by the locale detection.
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
					matchingUrlPattern: `^${base}/$`,
					assertions: { ...vitals, "resource-summary:script:size": script(330) },
				},
			],
		},
		upload: { target: "filesystem", outputDir: ".lighthouseci" },
	},
};
