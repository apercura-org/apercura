// Load the root `.env` first, then validate it (skipped with SKIP_ENV_VALIDATION=1).
import { monorepoRoot } from "./src/load-root-env";
import "./src/env";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { API_CONTENT_SECURITY_POLICY, baseSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
	output: "standalone",
	outputFileTracingRoot: monorepoRoot,
	reactStrictMode: true,
	poweredByHeader: false,
	transpilePackages: ["@apercura/core", "@apercura/db", "@apercura/ui"],
	async redirects() {
		// Browsers ask for /favicon.ico whatever the page says: the 48 px site icon.
		return [{ source: "/favicon.ico", destination: "/icon/48", permanent: true }];
	},
	async headers() {
		// Every response: nosniff, referrer, framing, permissions, opener isolation and, in an
		// HTTPS production build, HSTS. Pages get their Content-Security-Policy from the proxy.
		const security = baseSecurityHeaders({
			production: process.env.NODE_ENV === "production",
			appUrl: process.env.APP_URL,
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
		// English pages are never indexed in v1, nor search results, the practitioner space and
		// the per-practitioner forms. `/pro` itself (the practitioners' page) stays indexable.
		const noindex = [{ key: "X-Robots-Tag", value: "noindex" }];
		const noindexNofollow = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
		return [
			{ source: "/:path*", headers: security },
			{ source: "/api/:path((?!admin/claim-documents/).*)", headers: api },
			{ source: "/en", headers: noindex },
			{ source: "/en/:path*", headers: noindex },
			{ source: "/recherche", headers: noindex },
			{ source: "/:locale(en)?/pro/:path+", headers: noindexNofollow },
			{ source: "/praticien/:slug/:form(signaler|retrait)", headers: noindexNofollow },
			{ source: "/en/practitioner/:slug/:form(report|removal)", headers: noindexNofollow },
			// Last, so they win over the rules above.
			{ source: "/rdv", headers: manage },
			{ source: "/en/rdv", headers: manage },
		];
	},
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
