// Load the root `.env` first, then validate it (skipped with SKIP_ENV_VALIDATION=1).
import { monorepoRoot } from "./src/load-root-env";
import "./src/env";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PREFIXED_LOCALES } from "./src/i18n/locales";
import { routing } from "./src/i18n/routing";

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
		// The appointment page reads its token from the URL fragment: no referrer may leave it,
		// it is never indexed and never stored by a shared cache.
		const manage = [
			{ key: "Referrer-Policy", value: "no-referrer" },
			{ key: "X-Robots-Tag", value: "noindex, nofollow" },
			{ key: "Cache-Control", value: "private, no-store" },
		];
		// The same directives as the pages' robots meta, for crawlers that read headers only:
		// pages in a locale other than French are never indexed in v1, nor search results, the
		// practitioner space and the per-practitioner forms. `/pro` itself (the practitioners'
		// page) stays indexable.
		const noindex = [{ key: "X-Robots-Tag", value: "noindex" }];
		const noindexNofollow = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
		const prefixed = `:locale(${PREFIXED_LOCALES.join("|")})`;
		const forms = ["/praticien/[slug]/signaler", "/praticien/[slug]/retrait"] as const;
		return [
			{ source: `/${prefixed}`, headers: noindex },
			{ source: `/${prefixed}/:path*`, headers: noindex },
			{ source: "/recherche", headers: noindex },
			{ source: `/${prefixed}?/pro/:path+`, headers: noindexNofollow },
			...routing.locales.flatMap((locale) =>
				forms.map((form) => ({
					source: `${locale === routing.defaultLocale ? "" : `/${locale}`}${routing.pathnames[form][locale].replace("[slug]", ":slug")}`,
					headers: noindexNofollow,
				})),
			),
			// Last, so they win over the rules above.
			{ source: "/rdv", headers: manage },
			{ source: `/${prefixed}/rdv`, headers: manage },
		];
	},
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
