import { parseSearchQuery } from "@apercura/core";
import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { clientEnv } from "./env";
import { LOCALE_SEGMENTS } from "./i18n/locales";
import { getPathname } from "./i18n/navigation";
import { type Locale, routing } from "./i18n/routing";
import { canonicalPath } from "./lib/canonical-path";
import { isPagePath, marketPath, parseHosts } from "./lib/market-path";
import { publicPageCacheControl } from "./lib/public-cache";
import {
	contentSecurityPolicy,
	newNonce,
	noncePathPattern,
	originOf,
} from "./lib/security-headers";
import { searchRedirect } from "./server/search-redirect";

const intl = createMiddleware(routing);

const NONCE_PATHS = noncePathPattern(LOCALE_SEGMENTS);

function cspOptions() {
	const production = process.env.NODE_ENV === "production";
	return {
		development: process.env.NODE_ENV === "development",
		mapOrigins: [originOf(clientEnv.NEXT_PUBLIC_MAP_STYLE_URL)].filter((o) => o !== null),
		imageOrigins: [originOf(process.env.S3_PUBLIC_URL)].filter((o) => o !== null),
		upgradeInsecureRequests: production && Boolean(process.env.APP_URL?.startsWith("https://")),
	};
}

let staticPolicy: string | undefined;

/**
 * The page's Content-Security-Policy (see ~/lib/security-headers): with a
 * fresh nonce for the practitioner space and the appointment page, rendered
 * per request; the static policy for cached public pages and redirects.
 */
function pagePolicy(request: NextRequest): { csp: string; nonce?: string } {
	const perRequest =
		(request.method === "GET" || request.method === "HEAD") &&
		NONCE_PATHS.test(request.nextUrl.pathname);
	if (!perRequest) {
		staticPolicy ??= contentSecurityPolicy(cspOptions());
		return { csp: staticPolicy };
	}
	const nonce = newNonce();
	return { csp: contentSecurityPolicy({ ...cspOptions(), nonce }), nonce };
}

/**
 * The request Next.js renders: with the policy in its headers, Next.js reads
 * the nonce from it and puts it on its own scripts. Client-sent copies of
 * these headers are always replaced.
 */
function withPolicy(request: NextRequest, policy: { csp: string; nonce?: string }) {
	if (!policy.nonce) return request;
	const headers = new Headers(request.headers);
	headers.set("content-security-policy", policy.csp);
	headers.set("x-nonce", policy.nonce);
	return new NextRequest(request.url, { headers, method: request.method });
}

function secured<T extends Response>(response: T, policy: { csp: string }): T {
	response.headers.set("Content-Security-Policy", policy.csp);
	response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
	return response;
}

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

/**
 * Former hosts of the French site (`LEGACY_HOSTS`, e.g. `apercura.fr,www.apercura.fr`): all of
 * their URLs redirect, robots.txt, sitemaps and Open Graph images included, and their home `/`
 * is France's (`/fr`). Any other host only has its pages redirected, its home to the
 * international one.
 */
function isLegacyHost(host: string): boolean {
	return parseHosts(process.env.LEGACY_HOSTS).includes(host.toLowerCase());
}

/** 301 for GET and HEAD (understood by every client), 308 otherwise (keeps method and body). */
const permanent = (request: NextRequest) =>
	request.method === "GET" || request.method === "HEAD" ? 301 : 308;

/**
 * The redirect from any host other than APP_URL's to the same page there, moved to the
 * current scheme on the way (`apercura.fr/praticien/x` → `apercura.org/fr/praticien/x`).
 */
function offHostRedirect(request: NextRequest, canonical: URL, host: string): NextResponse | null {
	const pathname = request.nextUrl.pathname;
	const page = isPagePath(pathname);
	const legacy = isLegacyHost(host);
	// API calls and files of an unknown host (the container name the import calls, a provider's
	// default domain) are served where they are, as before.
	if (!page && !legacy) return null;
	// `www.` of the canonical host is the same site: its home stays the international one.
	const legacyRoot = legacy && host.toLowerCase() !== `www.${canonical.host}`;
	const moved = marketPath(pathname, { legacyRoot })?.path ?? pathname;
	const path = page ? (canonicalPath(moved) ?? moved) : moved;
	return NextResponse.redirect(
		new URL(path + request.nextUrl.search, canonical),
		permanent(request),
	);
}

/**
 * The redirect of a path of the former scheme on the canonical host itself (`/annuaire` →
 * `/fr/annuaire`, `/en/about` → `/fr-en/about`). Former locale prefixes answer a temporary
 * 307: `/de`, `/es` and `/it` are the segments of markets still to open.
 */
function marketRedirect(request: NextRequest): NextResponse | null {
	const moved = marketPath(request.nextUrl.pathname, { legacyRoot: false });
	if (!moved) return null;
	const target = request.nextUrl.clone();
	target.pathname = canonicalPath(moved.path) ?? moved.path;
	return NextResponse.redirect(target, moved.move === "locale" ? 307 : permanent(request));
}

/** Search pages by locale (`/fr/recherche`, `/fr-en/search`, `/fr-de/suche`…). */
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

/** The public pages' Cache-Control on a page about to render (not on redirects). */
function cacheable<T extends Response>(request: NextRequest, response: T): T {
	if (response.status >= 300) return response;
	const value = publicPageCacheControl({
		method: request.method,
		pathname: request.nextUrl.pathname,
	});
	if (value) response.headers.set("Cache-Control", value);
	return response;
}

const LOCALE_PREFIX = new RegExp(`^/(?:${LOCALE_SEGMENTS.join("|")})(?:/|$)`, "i");

/**
 * 1. Canonical host: any other host (apercura.fr, www., the hosting provider's default
 *    domain) answers a permanent redirect (301 for GET and HEAD, 308 otherwise) to the same
 *    page on APP_URL, moved to the current scheme (~/lib/market-path). The former hosts listed
 *    in LEGACY_HOSTS redirect their robots.txt, sitemaps and images too. Loopback hosts are
 *    left alone so health checks and local runs of a production build keep working.
 * 2. Files and metadata routes on the canonical host are served as they are (old sitemap
 *    names redirect to France's).
 * 3. The root `/` is the international home (`app/(international)`), outside the locales.
 * 4. Former scheme: unprefixed French paths and the old locale prefixes redirect under
 *    `/fr`, `/fr-en`… (`marketRedirect`).
 * 5. Canonical path: 308 to the lowercase form (`canonicalPath`).
 * 6. Search shortcuts: 307 to the page a query names.
 * 7. Locale routing (next-intl): every locale under its prefix (`/fr`, `/fr-en`, `/fr-de`…).
 *    Its redirects of a localized path in the wrong form (`/fr-en/annuaire` →
 *    `/fr-en/directory`) are permanent.
 *
 * Every page answer carries the page's Content-Security-Policy (`pagePolicy`), and the public
 * pages about to render their CDN-friendly Cache-Control (`cacheable`, ~/lib/public-cache).
 */
export default async function proxy(request: NextRequest) {
	const canonical = canonicalOrigin();
	const host = requestHost(request);
	if (canonical && host && host !== canonical.host && !LOOPBACK.test(host)) {
		const redirect = offHostRedirect(request, canonical, host);
		// Files keep the headers they always had; pages get their policy, as every page answer.
		if (redirect && !isPagePath(request.nextUrl.pathname)) return redirect;
		if (redirect) return secured(redirect, pagePolicy(request));
	}
	if (!isPagePath(request.nextUrl.pathname)) {
		return marketRedirect(request) ?? NextResponse.next();
	}
	const policy = pagePolicy(request);
	if (request.nextUrl.pathname === "/") {
		return cacheable(request, secured(NextResponse.next(), policy));
	}
	const moved = marketRedirect(request);
	if (moved) return secured(moved, policy);
	const path = canonicalPath(request.nextUrl.pathname);
	if (path) {
		const target = request.nextUrl.clone();
		target.pathname = path;
		return secured(NextResponse.redirect(target, 308), policy);
	}
	const shortcut = await searchShortcut(request);
	if (shortcut) return secured(shortcut, policy);
	const response = intl(withPolicy(request, policy));
	if (response.status === 307 && LOCALE_PREFIX.test(request.nextUrl.pathname)) {
		return secured(new NextResponse(null, { status: 308, headers: response.headers }), policy);
	}
	return cacheable(request, secured(response, policy));
}

export const config = {
	matcher: [
		// Pages: everything but API routes, Next.js internals and files with an extension.
		// The site icons (`/icon/{size}`, `/apple-icon`) are metadata routes, outside the locales.
		"/((?!api|trpc|_next|_vercel|icon/|apple-icon|.*\\..*).*)",
		// What a former host must redirect too, for crawlers and shared links: robots.txt,
		// sitemaps, the Open Graph images, security.txt and the icons. Never API routes, whose
		// request bodies a proxy would buffer.
		"/robots.txt",
		"/sitemap.xml",
		"/sitemaps/:path*",
		"/og/:path*",
		"/.well-known/:path*",
		"/manifest.webmanifest",
		"/icon/:path*",
		"/apple-icon",
	],
};
