import { getPathname, type Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";

/**
 * Public origin of the site, from APP_URL. Static pages bake it into their
 * canonical URLs and JSON-LD, so APP_URL must be set at build time too.
 */
export function siteOrigin(): string {
	const url = process.env.APP_URL;
	try {
		return url ? new URL(url).origin : "http://localhost:3000";
	} catch {
		return "http://localhost:3000";
	}
}

/** Absolute URL of an internal page in a locale. */
export function absoluteUrl(href: Href, locale: Locale): string {
	return `${siteOrigin()}${getPathname({ href, locale })}`;
}
