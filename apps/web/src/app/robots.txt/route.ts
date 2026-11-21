import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";

/**
 * robots.txt. Only search results, the API, the component gallery and the
 * practitioner app area are disallowed: `noindex` pages must stay crawlable,
 * or crawlers never see their `noindex`. `/pro` itself (the claim entry page)
 * stays open. Rendered at request time so APP_URL is the runtime one.
 */
export async function GET() {
	await connection();
	const body = [
		"User-agent: *",
		"Disallow: /recherche",
		"Disallow: /en/search",
		"Disallow: /api/",
		"Disallow: /_ui",
		"Disallow: /en/_ui",
		"Disallow: /pro/",
		"Disallow: /en/pro/",
		"",
		`Sitemap: ${siteOrigin()}/sitemap.xml`,
		"",
	].join("\n");
	return new Response(body, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
}
