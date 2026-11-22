import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";

/**
 * Private areas that nothing public links to: the signed-in practitioner
 * space (behind sign-in, `noindex, nofollow` anyway). The entry pages of
 * `/pro` (sign in, sign up, claim a page) stay crawlable: practitioner pages
 * link to them, so crawlers must be able to read their `noindex`.
 */
const PRO_APP = [
	"/pro/tableau-de-bord",
	"/pro/aujourdhui",
	"/pro/agenda",
	"/pro/equipe",
	"/pro/page",
	"/pro/bienvenue",
	"/pro/admin/",
	"/pro/revendiquer/",
];

/**
 * robots.txt. Only search results (also `noindex`; a crawl trap of endless
 * query combinations), the API, the component gallery and the practitioner app
 * area are disallowed: `noindex` pages must stay crawlable, or crawlers never
 * see their `noindex`. Rendered at request time so APP_URL is the runtime one.
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
		...PRO_APP.flatMap((path) => [`Disallow: ${path}`, `Disallow: /en${path}`]),
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
