import { THEME_SCRIPT } from "~/lib/theme";

/**
 * `/theme.js`: applies the stored colour theme before the first paint (~/lib/theme). It reads
 * nothing from the request, so it is prerendered at build time: the same file for everyone,
 * cached an hour by browsers and shared caches (a change reaches every visitor within the hour).
 */
export function GET() {
	return new Response(THEME_SCRIPT, {
		headers: {
			"Content-Type": "text/javascript; charset=utf-8",
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
		},
	});
}
