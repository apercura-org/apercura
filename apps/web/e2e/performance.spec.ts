import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

/*
 * First-load JavaScript budgets of the public pages, gzip, from the server
 * HTML: the module scripts a page loads before it is interactive, minus the
 * framework runtime every page shares (React, React DOM, the Next.js router:
 * `rootMainFiles` of the build manifest, about 130 KB) and the legacy
 * polyfills modern browsers skip (`noModule`). Lighthouse CI (`bun run lhci`)
 * checks the Core Web Vitals; this checks what the pages themselves add.
 */

const BUDGETS_KB: Record<string, number> = {
	// The map and the booking panel load on demand: neither counts here. About 60.3 KB since
	// next-intl 4.16 (query strings in hrefs, +0.2 KB) and the transitive updates (+0.1 KB).
	"/fr/praticien/camille-exemple-19999990013": 61,
	"/fr/praticien/anne-essaiaa-19999991003": 61,
	"/fr/medecin-generaliste/75-paris": 60,
	"/fr/etablissement/centre-hospitalier-fictif-2a9999001": 60,
	"/fr/annuaire/75-paris": 60,
	// The search form's combo boxes and API client load on first interaction.
	"/fr": 60,
	// The international home: one small island (the language suggestion).
	"/": 60,
	// Switzerland (synthetic fixtures): a facility, a canton's listing, the French home.
	"/ch/einrichtung/universitaetsspital-muster-basel-h225608997": 61,
	"/ch-fr/apotheke/geneve": 60,
	"/ch-fr": 60,
	// Ireland (synthetic fixtures): its home and a county's listing; Irish labels stay out of
	// the other markets' islands and theirs out of Ireland's.
	"/ie": 60,
	"/ie/pharmacy/cork": 60,
	// Lithuania (synthetic fixtures): an institution, a municipality's listing, the home.
	"/lt/istaiga/uab-pavyzdine-klinika-9000-90000001": 61,
	"/lt/medicinos-centrai/vilniaus-miesto-savivaldybe": 60,
	"/lt": 60,
	// Slovenia (synthetic fixtures): a doctor, a municipality's listing, the home.
	"/si/zdravnik/ana-primer-si90001": 61,
	"/si/druzinski-zdravnik/osrednjeslovenska/ljubljana": 60,
	"/si": 60,
};

const manifest = JSON.parse(
	readFileSync(fileURLToPath(new URL("../.next/build-manifest.json", import.meta.url)), "utf8"),
) as { rootMainFiles: string[]; polyfillFiles: string[] };
const shared = new Set([...manifest.rootMainFiles, ...manifest.polyfillFiles]);

for (const [path, budget] of Object.entries(BUDGETS_KB)) {
	test(`${path} adds at most ${budget} KB of JavaScript (gzip) to the framework`, async ({
		request,
	}) => {
		const html = await (await request.get(path)).text();
		const scripts = new Set(
			[...html.matchAll(/<script\b[^>]*\bsrc="\/_next\/([^"]+)"[^>]*>/g)]
				.filter((match) => !/\bnoModule\b/i.test(match[0]))
				.map((match) => match[1] ?? ""),
		);
		let bytes = 0;
		const sizes: string[] = [];
		for (const file of scripts) {
			if (shared.has(file)) continue;
			const body = await (await request.get(`/_next/${file}`)).body();
			const gzip = gzipSync(body).length;
			bytes += gzip;
			sizes.push(`${file} ${(gzip / 1024).toFixed(1)} KB`);
		}
		expect(bytes / 1024, sizes.join("\n")).toBeLessThanOrEqual(budget);
	});
}
