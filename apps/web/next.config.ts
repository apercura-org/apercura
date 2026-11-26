// Load the root `.env` first, then validate it (skipped with SKIP_ENV_VALIDATION=1).
import { monorepoRoot } from "./src/load-root-env";
import "./src/env";

import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { INDEXABLE_LOCALES, LOCALE_PREFIXES, LOCALE_SEGMENTS } from "./src/i18n/locales";
import { routing } from "./src/i18n/routing";
import { API_CONTENT_SECURITY_POLICY, baseSecurityHeaders } from "./src/lib/security-headers";
import { OG_FONT_FILES } from "./src/server/og/font-files";

const nextConfig: NextConfig = {
	cacheComponents: true,
	// The site has two root layouts (the international home and the locales): a URL no route
	// matches gets app/global-not-found.tsx, a document of its own, instead of Next.js's page.
	experimental: { globalNotFound: true },
	partialPrefetching: true,
	output: "standalone",
	outputFileTracingRoot: monorepoRoot,
	// The Open Graph images read their fonts with fs at request time, which tracing cannot
	// follow: ship those exact files with the routes that draw them.
	outputFileTracingIncludes: {
		"/og/**": OG_FONT_FILES.map((file) => `./${file}`),
	},
	// Pages, route responses and "use cache" results go to Valkey when CACHE_REDIS_URL is set
	// at run time, bounded by its memory limit; otherwise these handlers hand every call to
	// Next.js's own caches (see cache-handler/runtime.mjs). Next.js traces them, and their
	// imports, into the standalone output.
	cacheHandler: path.resolve("cache-handler/incremental.mjs"),
	cacheHandlers: {
		default: path.resolve("cache-handler/data.mjs"),
		remote: path.resolve("cache-handler/data.mjs"),
	},
	// The guides (content/guides/*.md) are imported as their text and parsed at build time.
	turbopack: {
		rules: { "*.md": { type: "text" } },
	},
	reactStrictMode: true,
	poweredByHeader: false,
	transpilePackages: ["@apercura/core", "@apercura/db", "@apercura/ui"],
	async redirects() {
		// Browsers ask for /favicon.ico whatever the page says: the 48 px site icon.
		return [{ source: "/favicon.ico", destination: "/icon/48", permanent: true }];
	},
	async headers() {
		// Every response: nosniff, referrer, framing, permissions, opener isolation and, in an
		// HTTPS production build, HSTS (with `preload` when HSTS_PRELOAD is set at build time).
		// Pages get their Content-Security-Policy from the proxy.
		const security = baseSecurityHeaders({
			production: process.env.NODE_ENV === "production",
			appUrl: process.env.APP_URL,
			preload: ["true", "1"].includes(process.env.HSTS_PRELOAD ?? ""),
		});
		// API answers are data: nothing may run, load or frame them, nor read them cross-origin.
		// The claim document route sets its own sandboxed policy.
		const api = [
			{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
			{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
		];
		// The appointment page reads its token from the URL fragment: no referrer may leave it,
		// it is never indexed and never stored by a shared cache.
		const manage = [
			{ key: "Referrer-Policy", value: "no-referrer" },
			{ key: "X-Robots-Tag", value: "noindex, nofollow" },
			{ key: "Cache-Control", value: "private, no-store" },
		];
		// The same directives as the pages' robots meta, for crawlers that read headers only:
		// pages in a locale other than French (`/fr-en`, `/fr-de`…) are never indexed in v1, nor
		// search results, the practitioner space and the per-practitioner forms. `/fr/pro` itself
		// (the practitioners' page) and the international home `/` stay indexable.
		const noindex = [{ key: "X-Robots-Tag", value: "noindex" }];
		const noindexNofollow = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
		const unindexed = routing.locales
			.filter((locale) => !INDEXABLE_LOCALES.includes(locale))
			.map((locale) => LOCALE_PREFIXES[locale].slice(1));
		const notIndexed = `:prefix(${unindexed.join("|")})`;
		const anyPrefix = `:prefix(${LOCALE_SEGMENTS.join("|")})`;
		const forms = [
			"/praticien/[slug]/signaler",
			"/praticien/[slug]/retrait",
			"/praticien/[slug]/c-est-moi",
		] as const;
		return [
			{ source: "/:path*", headers: security },
			{ source: "/api/:path((?!admin/claim-documents/).*)", headers: api },
			{ source: `/${notIndexed}`, headers: noindex },
			{ source: `/${notIndexed}/:path*`, headers: noindex },
			{ source: `${LOCALE_PREFIXES.fr}/recherche`, headers: noindex },
			{ source: `/${anyPrefix}/pro/:path+`, headers: noindexNofollow },
			...routing.locales.flatMap((locale) =>
				forms.map((form) => ({
					source: `${LOCALE_PREFIXES[locale]}${routing.pathnames[form][locale].replace("[slug]", ":slug")}`,
					headers: noindexNofollow,
				})),
			),
			// Last, so they win over the rules above.
			{ source: `/${anyPrefix}/rdv`, headers: manage },
		];
	},
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
