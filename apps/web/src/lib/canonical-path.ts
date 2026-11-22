import { routing } from "~/i18n/routing";

/** Practitioner-space paths may carry case-sensitive identifiers: never lowercased. */
const CASE_SENSITIVE = /^(?:\/en)?\/pro(?:\/|$)/;

/**
 * The canonical form of a public path, or null when it already is: the
 * default locale has no prefix (`/fr/cardiologue` → `/cardiologue`) and every
 * public URL is lowercase (`/Cardiologue` → `/cardiologue`; percent-escapes
 * are left as they are).
 */
export function canonicalPath(pathname: string): string | null {
	let path = pathname;
	if (path === `/${routing.defaultLocale}` || path.startsWith(`/${routing.defaultLocale}/`)) {
		path = path.slice(routing.defaultLocale.length + 1) || "/";
	}
	if (!CASE_SENSITIVE.test(path) && /[A-Z]/.test(path.replace(/%[0-9a-f]{2}/gi, ""))) {
		path = path.replace(/(%[0-9a-f]{2})|[A-Z]+/gi, (match, percentEscape) =>
			percentEscape ? match : match.toLowerCase(),
		);
	}
	return path === pathname ? null : path;
}
