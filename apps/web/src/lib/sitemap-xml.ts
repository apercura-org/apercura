import { LOCALE_PREFIXES, LOCALES, type Locale } from "~/i18n/locales";
import { routing } from "~/i18n/routing";
import type { SitemapMarket } from "~/server/queries/sitemap-sql";

/** XML of sitemaps and sitemap indexes (sitemaps.org 0.9), without changefreq or priority. */

const escapeXml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export function sitemapIndexXml(entries: { loc: string; lastmod?: string }[]): string {
	const items = entries
		.map(
			(entry) =>
				`<sitemap><loc>${escapeXml(entry.loc)}</loc>${
					entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""
				}</sitemap>`,
		)
		.join("\n");
	return `${HEADER}<sitemapindex xmlns="${NAMESPACE}">\n${items}\n</sitemapindex>\n`;
}

export function urlSetXml(entries: { loc: string; lastmod?: string }[]): string {
	const items = entries
		.map(
			(entry) =>
				`<url><loc>${escapeXml(entry.loc)}</loc>${
					entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""
				}</url>`,
		)
		.join("\n");
	return `${HEADER}<urlset xmlns="${NAMESPACE}">\n${items}\n</urlset>\n`;
}

/**
 * Sitemaps change with every import: browsers ask again on every visit and a shared cache
 * keeps one five minutes at most (`max-age=3600` let any cache serve the index from before an
 * import for an hour).
 */
export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=300";

export const xmlResponse = (body: string) =>
	new Response(body, {
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control": SITEMAP_CACHE_CONTROL,
		},
	});

/** A French path of the directory (`/praticien/…`, `/` for the home) under France's segment. */
export const francePath = (path: string) =>
	path === "/" ? LOCALE_PREFIXES.fr : `${LOCALE_PREFIXES.fr}${path}`;

/**
 * First segments of the internal (French) paths and their form in each locale
 * (`praticien` → `arzt` in Austria), from the routing table: the read models
 * store internal paths, the sitemaps print public ones. Listing slugs, place
 * slugs and dynamic segments are data and stay as they are.
 */
const FIRST_SEGMENTS: ReadonlyMap<string, Record<Locale, string>> = (() => {
	const map = new Map<string, Record<Locale, string>>();
	for (const [pathname, entry] of Object.entries(routing.pathnames)) {
		const first = pathname.split("/")[1];
		if (!first || first.startsWith("[") || typeof entry === "string") continue;
		const forms = Object.fromEntries(
			Object.entries(entry as Record<Locale, string>).map(([locale, path]) => [
				locale,
				path.split("/")[1] ?? first,
			]),
		) as Record<Locale, string>;
		map.set(first, forms);
	}
	return map;
})();

/** The locale of a sitemap segment: the one whose pages live under it (`ch-fr` → `fr-CH`). */
function localeOfSegment(market: SitemapMarket): Locale {
	const locale = LOCALES.find((candidate) => LOCALE_PREFIXES[candidate] === `/${market}`);
	if (!locale) throw new RangeError(`No locale lives under /${market}`);
	return locale;
}

/**
 * An internal (French) path of a market's directory under the segment of one of its languages,
 * with that language's route segments: `marketPagePath("at", "/praticien/x")` is `/at/arzt/x`,
 * `marketPagePath("fr", "/annuaire")` is `/fr/annuaire`, `marketPagePath("ch-fr", "/annuaire")`
 * is `/ch-fr/annuaire`.
 */
export function marketPagePath(market: SitemapMarket, path: string): string {
	const locale = localeOfSegment(market);
	const prefix = LOCALE_PREFIXES[locale];
	if (path === "/") return prefix;
	const [, first = "", ...rest] = path.split("/");
	const translated = FIRST_SEGMENTS.get(first)?.[locale] ?? first;
	return `${prefix}/${[translated, ...rest].join("/")}`;
}

/** Indexable pages that do not come from the read models, as French paths. */
export const STATIC_PATHS = [
	"/",
	"/pro",
	"/annuaire",
	"/a-propos",
	"/open-source",
	"/donnees",
	"/accessibilite",
	"/confidentialite",
	"/mentions-legales",
	"/conditions",
] as const;

/**
 * The static pages of each market's sitemap. Austria and the UK list no practitioner space
 * (their claims go through documents, the space's entry pages are France's); Austria has no
 * accessibility statement of its own (none is required of a private site there), the UK has
 * one (`/gb/accessibility`), and so do Czechia (`/cz/pristupnost`), Poland (`/pl/dostepnosc`), Spain (`/es/accesibilidad`),
 * Italy (`/it/accessibilita`), Germany (`/de/barrierefreiheit`), Switzerland and Estonia
 * (`/ee/ligipaasetavus`), voluntary statements.
 */
export const MARKET_STATIC_PATHS: Record<SitemapMarket, readonly string[]> = {
	fr: STATIC_PATHS,
	at: STATIC_PATHS.filter((path) => path !== "/pro" && path !== "/accessibilite"),
	gb: STATIC_PATHS.filter((path) => path !== "/pro"),
	cz: STATIC_PATHS.filter((path) => path !== "/pro"),
	es: STATIC_PATHS.filter((path) => path !== "/pro"),
	it: STATIC_PATHS.filter((path) => path !== "/pro"),
	de: STATIC_PATHS.filter((path) => path !== "/pro"),
	ch: STATIC_PATHS.filter((path) => path !== "/pro"),
	"ch-fr": STATIC_PATHS.filter((path) => path !== "/pro"),
	"ch-it": STATIC_PATHS.filter((path) => path !== "/pro"),
	ee: STATIC_PATHS.filter((path) => path !== "/pro"),
	pl: STATIC_PATHS.filter((path) => path !== "/pro"),
	no: STATIC_PATHS.filter((path) => path !== "/pro"),
};
