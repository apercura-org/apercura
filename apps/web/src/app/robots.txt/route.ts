import { connection } from "next/server";
import { LOCALE_PREFIXES } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";
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

/** Every locale's prefix (`/fr`, `/fr-en`…): the international home `/` has no private area. */
const PREFIXES = Object.values(LOCALE_PREFIXES);

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
		...routing.locales.map((locale) => `Disallow: ${getPathname({ href: "/recherche", locale })}`),
		"Disallow: /api/",
		...PREFIXES.map((prefix) => `Disallow: ${prefix}/_ui`),
		...PRO_APP.flatMap((path) => PREFIXES.map((prefix) => `Disallow: ${prefix}${path}`)),
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
