import { FRANCE_SEGMENT, LEGACY_LOCALE_SEGMENTS, LOCALE_SEGMENTS } from "~/i18n/locales";

/**
 * Old URLs, new URLs. Until November 2026 the French directory lived on its own
 * domain (apercura.fr) without a prefix (`/praticien/…`), its interface
 * translations under the locale code (`/en/practitioner/…`). Every market now
 * lives on one domain under its own segment (docs/adr/0002-multi-country.md,
 * section 2): France under `/fr`, its translations under `/fr-en`, `/fr-de`…
 * Translated route segments did not change, so a path keeps everything after
 * its prefix.
 */

/** Why a path moved, which decides how the proxy answers. */
export type MarketMove =
	/** The home of the former French domain: France's home now. */
	| "root"
	/** A French page of the former unprefixed scheme. */
	| "french"
	/**
	 * A page under a former locale prefix (`/en`, `/de`, `/es`, `/it`). `de` is also the segment
	 * of a future market: on the canonical host the redirect stays temporary. `es` and `it` are
	 * Spain's and Italy's segments since those markets opened (#148, #150): they move only on a
	 * former host.
	 */
	| "locale"
	/** A sitemap file of the former flat layout (`/sitemaps/praticien-0.xml`). */
	| "sitemap";

export type MarketRedirect = { path: string; move: MarketMove };

/** Paths that are not pages of a locale: files, API, framework internals, metadata routes. */
const NOT_A_PAGE =
	/^\/(?:api|trpc|_next|_vercel|og|media|icon|apple-icon|brand|sitemaps|\.well-known)(?:\/|$)|\./;

const OLD_SITEMAP = /^\/sitemaps\/([a-z]+-\d{1,6}\.xml)$/;

const CURRENT_PREFIXES = new Set(LOCALE_SEGMENTS);
const LEGACY_PREFIXES = new Set<string>(LEGACY_LOCALE_SEGMENTS);

/** True for a path that names a page (not a file, an API route or a metadata route). */
export function isPagePath(pathname: string): boolean {
	return !NOT_A_PAGE.test(pathname);
}

/**
 * Where a path of the former scheme lives now, or null when it already is a
 * path of the current one (or not a page at all).
 *
 * - `/` moves to `/fr` only on a former host of the French site
 *   (`legacyRoot`); on the canonical host it is the international home.
 * - `/en/…`, `/de/…`, `/es/…`, `/it/…` move to `/fr-en/…`, `/fr-de/…`…, except a prefix that
 *   is a market's own now (`/es`, Spain; `/it`, Italy): it moves only on a former host of the
 *   French site (`legacyRoot`), where `/es/…` and `/it/…` were the Spanish and Italian interfaces
 *   of France's pages.
 * - `/fr/…`, `/fr-en/…`, `/es/…`, `/it/…`… are current paths: unchanged.
 * - Any other page (`/praticien/…`, `/annuaire`, `/cardiologue/75-paris`,
 *   `/pro/connexion`, `/mentions-legales`…) moves under `/fr`.
 *
 * The first segment is compared without case (`/EN/About`); the rest is kept as
 * it is, for `canonicalPath` to lowercase.
 */
export function marketPath(
	pathname: string,
	{ legacyRoot }: { legacyRoot: boolean },
): MarketRedirect | null {
	const sitemap = OLD_SITEMAP.exec(pathname);
	if (sitemap) return { path: `/sitemaps/${FRANCE_SEGMENT}/${sitemap[1]}`, move: "sitemap" };
	if (!isPagePath(pathname)) return null;
	if (pathname === "/") return legacyRoot ? { path: `/${FRANCE_SEGMENT}`, move: "root" } : null;
	const slash = pathname.indexOf("/", 1);
	const first = (slash === -1 ? pathname.slice(1) : pathname.slice(1, slash)).toLowerCase();
	const rest = slash === -1 ? "" : pathname.slice(slash);
	if (CURRENT_PREFIXES.has(first) && !(legacyRoot && LEGACY_PREFIXES.has(first))) return null;
	if (LEGACY_PREFIXES.has(first)) {
		return { path: `/${FRANCE_SEGMENT}-${first}${rest === "/" ? "" : rest}`, move: "locale" };
	}
	return { path: `/${FRANCE_SEGMENT}${pathname}`, move: "french" };
}

/**
 * Host names from a comma-separated list (`LEGACY_HOSTS`), lowercased, without
 * blanks: `"apercura.fr, www.apercura.fr"` → `["apercura.fr", "www.apercura.fr"]`.
 */
export function parseHosts(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((host) => host.trim().toLowerCase())
		.filter(Boolean);
}
