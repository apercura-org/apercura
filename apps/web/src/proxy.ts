import { parseSearchQuery } from "@apercura/core";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getPathname } from "./i18n/navigation";
import { type Locale, routing } from "./i18n/routing";
import { canonicalPath } from "./lib/canonical-path";
import { searchRedirect } from "./server/search-redirect";

const intl = createMiddleware(routing);

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * The public origin from APP_URL, when the canonical host redirect applies:
 * production only, and not disabled with CANONICAL_HOST_REDIRECT=false.
 */
function canonicalOrigin(): URL | null {
	if (process.env.NODE_ENV !== "production") return null;
	if (process.env.CANONICAL_HOST_REDIRECT === "false") return null;
	try {
		return process.env.APP_URL ? new URL(process.env.APP_URL) : null;
	} catch {
		return null;
	}
}

/**
 * Host as the visitor typed it. Behind trusted proxies (TRUSTED_PROXY_COUNT >
 * 0) the forwarded host wins; otherwise the Host header.
 */
function requestHost(request: NextRequest): string | null {
	const trusted = Number(process.env.TRUSTED_PROXY_COUNT ?? 0) > 0;
	const forwarded = trusted ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() : null;
	return forwarded || request.headers.get("host");
}

/** Search pages by locale (`/recherche`, `/en/search`, `/de/suche`…). */
const SEARCH_PATHS: Record<string, Locale> = Object.fromEntries(
	routing.locales.map((locale) => [getPathname({ href: "/recherche", locale }), locale]),
);

/**
 * A search query that names a page (an RPPS number, a specialty in a place)
 * answers a real 307, decided here before the page starts streaming.
 */
async function searchShortcut(request: NextRequest): Promise<NextResponse | null> {
	const locale = SEARCH_PATHS[request.nextUrl.pathname];
	const params = request.nextUrl.searchParams;
	if (!locale || (!params.get("quoi") && !params.get("ou"))) return null;
	const page = Number(params.get("page") ?? "1");
	try {
		const target = await searchRedirect(
			parseSearchQuery({
				quoi: params.get("quoi"),
				ou: params.get("ou"),
				pres: params.get("pres"),
			}),
			Number.isInteger(page) && page > 0 ? page : 1,
		);
		if (!target) return null;
		return NextResponse.redirect(new URL(getPathname({ href: target, locale }), request.url), 307);
	} catch {
		// The page applies the same rules; never fail a search in the proxy.
		return null;
	}
}

const LOCALE_PREFIX = new RegExp(`^/(?:${routing.locales.join("|")})(?:/|$)`);

/**
 * 1. Canonical host: any other host (www., the hosting provider's default
 *    domain) answers 308 to the same path on APP_URL. Loopback hosts are left
 *    alone so health checks and local runs of a production build keep working.
 * 2. Canonical path: 308 to the unprefixed, lowercase form (`canonicalPath`).
 * 3. Search shortcuts: 307 to the page a query names.
 * 4. Locale routing (next-intl): French without a prefix, other locales under
 *    theirs (/en, /de, /es, /it).
 *    Its redirects of an explicitly prefixed path (`/en/annuaire` →
 *    `/en/directory`) are permanent; the locale detection of an unprefixed
 *    path stays temporary (307), as it depends on the visitor.
 */
export default async function proxy(request: NextRequest) {
	const canonical = canonicalOrigin();
	const host = requestHost(request);
	if (canonical && host && host !== canonical.host && !LOOPBACK.test(host)) {
		const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
		return NextResponse.redirect(target, 308);
	}
	const path = canonicalPath(request.nextUrl.pathname);
	if (path) {
		const target = request.nextUrl.clone();
		target.pathname = path;
		return NextResponse.redirect(target, 308);
	}
	const shortcut = await searchShortcut(request);
	if (shortcut) return shortcut;
	const response = intl(request);
	if (response.status === 307 && LOCALE_PREFIX.test(request.nextUrl.pathname)) {
		return new NextResponse(null, { status: 308, headers: response.headers });
	}
	return response;
}

export const config = {
	// Skip API routes, Next.js internals and files with an extension (sitemaps,
	// robots.txt, images), which the canonical host check does not need either:
	// crawlers reach them from the canonical robots.txt.
	// The site icons (`/icon/{size}`, `/apple-icon`) are metadata routes, outside the locales.
	matcher: "/((?!api|trpc|_next|_vercel|icon/|apple-icon|.*\\..*).*)",
};
