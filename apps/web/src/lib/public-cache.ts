/**
 * Cache-Control of the public HTML pages, set by the proxy (`src/proxy.ts`) so a CDN or a
 * caching reverse proxy may keep them, briefly:
 *
 * - `s-maxage=300`: a shared cache serves a page for five minutes without asking. The app's
 *   own cache (revalidated by tag after each import, each booking change, each owner edit)
 *   stays the source of truth: five minutes is how late a shared cache may lag behind it.
 * - `stale-while-revalidate=3600`: for an hour after that it may answer with the copy it has
 *   while it fetches the new one, which the app serves from its cache.
 * - `max-age=0`: browsers check again on every visit (the app answers 304 or a cached page).
 *
 * Without it Next.js derives the header from the pages' cache lifetimes (`s-maxage=2592000`
 * for a practitioner, a year for a static page or a 404): a shared cache would keep a page
 * for a month after a removal request. Next.js keeps a Cache-Control the response already
 * has, and still answers errors with `private, no-store`.
 *
 * Never on what is personal or per request: the practitioner space (`/pro` and below, its
 * presentation page included), the appointment page (`/rdv`, both have a per-request nonce),
 * search results, the report and removal forms, API routes (outside the proxy's pages), and
 * anything but GET and HEAD.
 *
 * Client navigations fetch the same pages' RSC payloads, which get the header too (the proxy
 * cannot tell them apart: Next.js hides their headers and `_rsc` parameter from it). They hold
 * the same public content, and a shared cache keeps them apart from the HTML: Next.js answers
 * them with `Vary: rsc, next-router-state-tree…`, and their URL carries `?_rsc=…` for caches
 * that ignore Vary.
 */
import { LOCALE_PREFIXES } from "~/i18n/locales";
import { routing } from "~/i18n/routing";

export const PUBLIC_PAGE_CACHE_CONTROL =
	"public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

/**
 * A pattern matching the given page paths and everything below them. `[param]` segments
 * match any one segment.
 */
export function privatePagePattern(paths: readonly string[]): RegExp {
	const escaped = paths.map((path) =>
		path
			.split(/\[[^\]]+\]/)
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("[^/]+"),
	);
	return new RegExp(`^(?:${escaped.join("|")})(?:/.*)?$`, "i");
}

/**
 * Pages never stored by a shared cache, in every locale: the practitioner space and its
 * presentation page, the appointment page, search results, the per-practitioner forms and the
 * component gallery.
 */
export const PRIVATE_PAGES = privatePagePattern(
	routing.locales.flatMap((locale) =>
		(
			[
				"/pro",
				"/rdv",
				"/recherche",
				"/praticien/[slug]/signaler",
				"/praticien/[slug]/retrait",
				"/_ui",
			] as const
		).map((page) => {
			const localized = routing.pathnames[page];
			return `${LOCALE_PREFIXES[locale]}${typeof localized === "string" ? localized : localized[locale]}`;
		}),
	),
);

/** The Cache-Control a page answer gets, or null to leave the one Next.js sets. */
export function publicPageCacheControl(
	request: { method: string; pathname: string },
	privatePages: RegExp = PRIVATE_PAGES,
): string | null {
	if (request.method !== "GET" && request.method !== "HEAD") return null;
	if (privatePages.test(request.pathname)) return null;
	return PUBLIC_PAGE_CACHE_CONTROL;
}
