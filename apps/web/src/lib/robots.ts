import type { Metadata } from "next";
import type { Locale } from "~/i18n/routing";

/**
 * Robots directive of a public page. English pages are never indexed in v1;
 * `noindex` pages keep `follow` so their links still count, and robots.txt
 * never disallows them (a crawler must fetch a page to see its noindex).
 */
export function robotsFor(locale: Locale, indexable: boolean): Metadata["robots"] {
	return locale === "fr" && indexable
		? { index: true, follow: true }
		: { index: false, follow: true };
}
