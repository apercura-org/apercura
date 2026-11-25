import { LOCALE_SEGMENTS } from "~/i18n/locales";

/** Practitioner-space paths may carry case-sensitive identifiers: never lowercased. */
const CASE_SENSITIVE = new RegExp(`^/(?:${LOCALE_SEGMENTS.join("|")})/pro(?:/|$)`, "i");

/**
 * The canonical form of a public path, or null when it already is: every
 * public URL is lowercase (`/fr/Cardiologue` → `/fr/cardiologue`; percent-escapes
 * are left as they are). Paths of the former scheme are moved first
 * (~/lib/market-path).
 */
export function canonicalPath(pathname: string): string | null {
	let path = pathname;
	if (!CASE_SENSITIVE.test(path) && /[A-Z]/.test(path.replace(/%[0-9a-f]{2}/gi, ""))) {
		path = path.replace(/(%[0-9a-f]{2})|[A-Z]+/gi, (match, percentEscape) =>
			percentEscape ? match : match.toLowerCase(),
		);
	}
	return path === pathname ? null : path;
}
