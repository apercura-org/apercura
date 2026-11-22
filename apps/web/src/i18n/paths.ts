import type { Locale } from "./locales";
import { type AppPathname, routing } from "./routing";

/**
 * The public path of an internal pathname in a locale, from the routing table
 * alone (`/praticien/[slug]` → `/de/behandler/…`). Free of React and Next.js, so
 * emails, jobs and configuration can build links outside a request.
 * Catch-all segments are not supported.
 */
export function localePath(
	locale: Locale,
	pathname: AppPathname,
	params: Record<string, string> = {},
): string {
	const entry: string | Record<Locale, string> = routing.pathnames[pathname];
	const template = typeof entry === "string" ? entry : entry[locale];
	const path = template.replace(/\[(\w+)\]/g, (_, name: string) => {
		const value = params[name];
		if (value === undefined) throw new Error(`Missing route parameter: ${name}`);
		return encodeURIComponent(value);
	});
	if (locale === routing.defaultLocale) return path;
	return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
