// Load the root `.env` first, then validate it (skipped with SKIP_ENV_VALIDATION=1).
import { monorepoRoot } from "./src/load-root-env";
import "./src/env";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
	output: "standalone",
	outputFileTracingRoot: monorepoRoot,
	reactStrictMode: true,
	poweredByHeader: false,
	transpilePackages: ["@apercura/core", "@apercura/db", "@apercura/ui"],
	async headers() {
		// The appointment page reads its token from the URL fragment: no referrer may leave it,
		// it is never indexed and never stored by a shared cache.
		const manage = [
			{ key: "Referrer-Policy", value: "no-referrer" },
			{ key: "X-Robots-Tag", value: "noindex, nofollow" },
			{ key: "Cache-Control", value: "private, no-store" },
		];
		return [
			{ source: "/rdv", headers: manage },
			{ source: "/en/rdv", headers: manage },
		];
	},
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
