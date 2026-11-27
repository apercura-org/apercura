import { describe, expect, it } from "vitest";
import { LEGACY_LOCALE_SEGMENTS, LOCALES, type Locale } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import { type AppPathname, routing } from "~/i18n/routing";
import { canonicalPath } from "./canonical-path";
import { isPagePath, marketPath, parseHosts } from "./market-path";

const PARAMS: Record<string, string> = {
	slug: "camille-exemple-19999990013",
	id: "2f0e8c4e-1111-4a4a-9b9b-123456789abc",
	dept: "69-rhone",
	commune: "lyon",
	specialite: "cardiologue",
};

/** The public path of a page in the former scheme: French unprefixed, the others under `/{locale}`. */
function formerPath(locale: Locale, pathname: AppPathname): string {
	const entry: string | Record<Locale, string> = routing.pathnames[pathname];
	const template = typeof entry === "string" ? entry : entry[locale];
	const path = template
		.replace("/[[...rest]]", "/2")
		.replace(/\[(\w+)\]/g, (_, name: string) => PARAMS[name] ?? "x");
	if (locale === "fr") return path;
	return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function currentPath(locale: Locale, pathname: AppPathname): string {
	const params = Object.fromEntries(
		[...pathname.matchAll(/\[(?:\[\.\.\.)?(\w+)\]?\]/g)].map(([, name]) => [
			name,
			name === "rest" ? ["2"] : (PARAMS[name as string] ?? "x"),
		]),
	);
	const href = Object.keys(params).length > 0 ? { pathname, params } : pathname;
	return getPathname({ href: href as never, locale });
}

const pathnames = Object.keys(routing.pathnames) as AppPathname[];

const move = (path: string, legacyRoot = true) => marketPath(path, { legacyRoot })?.path ?? null;

/** The markets opened after the move: their pages never had another address. */
const NEW_MARKET_LOCALES = [
	"de-AT",
	"en-GB",
	"cs-CZ",
	"es-ES",
	"it-IT",
	"de-DE",
	"de-CH",
	"fr-CH",
	"it-CH",
	"et-EE",
	"pl-PL",
	"nb-NO",
] as const;

/** The locales of the former scheme. */
const FORMER_LOCALES = LOCALES.filter(
	(locale) => !(NEW_MARKET_LOCALES as readonly Locale[]).includes(locale),
);

describe("marketPath: every page of the former scheme has a new address", () => {
	it("leaves Austria's, the UK's, Czechia's, Spain's, Italy's, Germany's, Switzerland's and Poland's pages where they are", () => {
		for (const locale of NEW_MARKET_LOCALES) {
			for (const pathname of pathnames) {
				const path = currentPath(locale, pathname);
				expect(marketPath(path, { legacyRoot: false }), path).toBeNull();
				// On the former French host, `/es`, `/it` and `/de` were France in Spanish, Italian and
				// German: their old links still move.
				if (locale !== "es-ES" && locale !== "it-IT" && locale !== "de-DE") {
					expect(marketPath(path, { legacyRoot: true }), path).toBeNull();
				}
			}
		}
	});

	it("moves `/es` to France in Spanish on the former host only: it is Spain's segment now", () => {
		expect(move("/es/aviso-legal")).toBe("/fr-es/aviso-legal");
		expect(move("/es")).toBe("/fr-es");
		expect(move("/es/aviso-legal", false)).toBeNull();
		expect(move("/es", false)).toBeNull();
	});

	it("moves `/de` to France in German on the former host only: it is Germany's segment now", () => {
		expect(move("/de/impressum")).toBe("/fr-de/impressum");
		expect(move("/de")).toBe("/fr-de");
		expect(move("/de/impressum", false)).toBeNull();
		expect(move("/de", false)).toBeNull();
		// The one former prefix that is no market's: always France in English.
		expect(move("/en/legal-notice", false)).toBe("/fr-en/legal-notice");
	});

	it("moves `/it` to France in Italian on the former host only: it is Italy's segment now", () => {
		expect(move("/it/note-legali")).toBe("/fr-it/note-legali");
		expect(move("/it")).toBe("/fr-it");
		expect(move("/it/note-legali", false)).toBeNull();
		expect(move("/it", false)).toBeNull();
	});

	for (const locale of FORMER_LOCALES) {
		it(`moves every ${locale} page (${pathnames.length} route families)`, () => {
			for (const pathname of pathnames) {
				const before = formerPath(locale, pathname);
				const after = currentPath(locale, pathname);
				if (before === "/") continue; // The former home: see below.
				expect(move(before), `${locale} ${pathname}: ${before}`).toBe(after);
				// Already current: never moved again.
				expect(marketPath(after, { legacyRoot: true }), after).toBeNull();
			}
		});
	}

	it.each([
		// Home
		["/", "/fr"],
		["/en", "/fr-en"],
		["/en/", "/fr-en"],
		["/de", "/fr-de"],
		// Directory, practitioners, establishments, listings
		["/praticien/camille-exemple-19999990013", "/fr/praticien/camille-exemple-19999990013"],
		[
			"/en/practitioner/camille-exemple-19999990013",
			"/fr-en/practitioner/camille-exemple-19999990013",
		],
		[
			"/de/behandler/camille-exemple-19999990013/meldung",
			"/fr-de/behandler/camille-exemple-19999990013/meldung",
		],
		[
			"/es/centro/centre-hospitalier-fictif-2a9999001",
			"/fr-es/centro/centre-hospitalier-fictif-2a9999001",
		],
		["/annuaire/75-paris", "/fr/annuaire/75-paris"],
		["/it/elenco/69-rhone/lyon", "/fr-it/elenco/69-rhone/lyon"],
		["/medecin-generaliste/75-paris/2", "/fr/medecin-generaliste/75-paris/2"],
		["/en/cardiologue/75-paris", "/fr-en/cardiologue/75-paris"],
		["/recherche", "/fr/recherche"],
		["/en/search", "/fr-en/search"],
		// Institutional and legal pages, with their localized paths
		["/a-propos", "/fr/a-propos"],
		["/open-source", "/fr/open-source"],
		["/donnees", "/fr/donnees"],
		["/accessibilite", "/fr/accessibilite"],
		["/confidentialite", "/fr/confidentialite"],
		["/mentions-legales", "/fr/mentions-legales"],
		["/conditions", "/fr/conditions"],
		["/en/about", "/fr-en/about"],
		["/en/legal-notice", "/fr-en/legal-notice"],
		["/de/impressum", "/fr-de/impressum"],
		["/de/datenschutz", "/fr-de/datenschutz"],
		["/es/aviso-legal", "/fr-es/aviso-legal"],
		["/es/condiciones", "/fr-es/condiciones"],
		["/it/note-legali", "/fr-it/note-legali"],
		["/it/privacy", "/fr-it/privacy"],
		["/it/accessibilita", "/fr-it/accessibilita"],
		// Practitioner space and appointment page
		["/pro", "/fr/pro"],
		["/pro/connexion", "/fr/pro/connexion"],
		["/en/pro/tableau-de-bord", "/fr-en/pro/tableau-de-bord"],
		["/pro/invitation/AbC123", "/fr/pro/invitation/AbC123"],
		["/rdv", "/fr/rdv"],
		["/es/rdv", "/fr-es/rdv"],
		// The component gallery
		["/_ui", "/fr/_ui"],
		// Old sitemap files
		["/sitemaps/pages-0.xml", "/sitemaps/fr/pages-0.xml"],
		["/sitemaps/praticien-12.xml", "/sitemaps/fr/praticien-12.xml"],
	])("%s → %s", (before, after) => {
		expect(move(before)).toBe(after);
	});

	it("compares the old locale prefix without case and keeps the rest for canonicalPath", () => {
		expect(move("/EN/About")).toBe("/fr-en/About");
		expect(canonicalPath("/fr-en/About")).toBe("/fr-en/about");
		expect(move("/Praticien/Camille-Exemple-19999990013")).toBe(
			"/fr/Praticien/Camille-Exemple-19999990013",
		);
	});

	it("tells why a path moved", () => {
		expect(marketPath("/", { legacyRoot: true })?.move).toBe("root");
		expect(marketPath("/annuaire", { legacyRoot: false })?.move).toBe("french");
		for (const segment of LEGACY_LOCALE_SEGMENTS) {
			expect(marketPath(`/${segment}/x`, { legacyRoot: true })?.move).toBe("locale");
		}
		expect(marketPath("/en/x", { legacyRoot: false })?.move).toBe("locale");
		expect(marketPath("/es/x", { legacyRoot: false })).toBeNull();
		expect(marketPath("/it/x", { legacyRoot: false })).toBeNull();
		expect(marketPath("/de/x", { legacyRoot: false })).toBeNull();
		expect(marketPath("/ch-de/x", { legacyRoot: false })?.move).toBe("alias");
		expect(marketPath("/sitemaps/pages-0.xml", { legacyRoot: false })?.move).toBe("sitemap");
	});

	it("moves `/ch-de` to Switzerland's German pages at `/ch`, for good, on every host", () => {
		for (const legacyRoot of [false, true]) {
			expect(move("/ch-de", legacyRoot)).toBe("/ch");
			expect(move("/ch-de/", legacyRoot)).toBe("/ch");
			expect(move("/ch-de/impressum", legacyRoot)).toBe("/ch/impressum");
			expect(move("/CH-DE/spital/Zuerich", legacyRoot)).toBe("/ch/spital/Zuerich");
			expect(move("/ch-de/einrichtung/kantonsspital-beispiel-h123456789", legacyRoot)).toBe(
				"/ch/einrichtung/kantonsspital-beispiel-h123456789",
			);
		}
		expect(move("/ch", false)).toBeNull();
		expect(move("/ch-fr/annuaire", false)).toBeNull();
		expect(move("/ch-it/elenco", false)).toBeNull();
	});
});

describe("marketPath: what stays where it is", () => {
	it("keeps the root on the canonical host: it is the international home", () => {
		expect(move("/", false)).toBeNull();
	});

	it.each([
		"/fr",
		"/fr/praticien/camille-exemple-19999990013",
		"/fr-en/about",
		"/fr-de/impressum",
		"/FR/annuaire",
		"/sitemaps/fr/pages-0.xml",
		"/sitemaps/international.xml",
		"/sitemap.xml",
		"/robots.txt",
		"/.well-known/security.txt",
		"/og/medecin.png",
		"/icon/48",
		"/icon.svg",
		"/apple-icon",
		"/brand/apercura-logo.png",
		"/manifest.webmanifest",
		"/api/ics/abc.ics",
		"/api/auth/callback/psc",
		"/_next/static/chunks/main.js",
		"/media/photo.webp",
	])("%s", (path) => {
		expect(marketPath(path, { legacyRoot: true })).toBeNull();
	});

	it("tells pages from files, API and metadata routes", () => {
		expect(isPagePath("/")).toBe(true);
		expect(isPagePath("/fr/annuaire")).toBe(true);
		expect(isPagePath("/praticien/x")).toBe(true);
		expect(isPagePath("/api/health")).toBe(false);
		expect(isPagePath("/robots.txt")).toBe(false);
		expect(isPagePath("/sitemaps/fr/pages-0.xml")).toBe(false);
		expect(isPagePath("/icon/48")).toBe(false);
		expect(isPagePath("/apple-icon")).toBe(false);
		expect(isPagePath("/brand/apercura-logo.png")).toBe(false);
		expect(isPagePath("/og/medecin.png")).toBe(false);
	});
});

describe("parseHosts", () => {
	it("reads a comma-separated list, lowercased, without blanks", () => {
		expect(parseHosts("apercura.fr, WWW.apercura.fr,,www.apercura.org ")).toEqual([
			"apercura.fr",
			"www.apercura.fr",
			"www.apercura.org",
		]);
		expect(parseHosts(undefined)).toEqual([]);
		expect(parseHosts("")).toEqual([]);
	});
});

describe("canonicalPath", () => {
	it.each([
		["/fr/Medecin-Generaliste/75-Paris", "/fr/medecin-generaliste/75-paris"],
		["/FR/annuaire", "/fr/annuaire"],
		["/fr-en/About", "/fr-en/about"],
		["/fr/m%C3%A9decin-generaliste", null],
		["/fr/praticien/camille-exemple-19999990013", null],
		// Practitioner-space paths may carry case-sensitive identifiers.
		["/fr/pro/invitation/AbC123", null],
		["/fr-en/pro/revendiquer/AbC", null],
	])("%s → %s", (before, after) => {
		expect(canonicalPath(before)).toBe(after);
	});
});
