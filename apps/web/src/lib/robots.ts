import type { Metadata } from "next";
import { isIndexableLocale, type Locale } from "~/i18n/locales";

/**
 * Robots directive of a public page. Only the locales of an open market (French
 * in v1) are indexed; `noindex` pages keep `follow` so their links still count,
 * and robots.txt never disallows them (a crawler must fetch a page to see its
 * noindex).
 */
export function robotsFor(locale: Locale, indexable: boolean): Metadata["robots"] {
	return isIndexableLocale(locale) && indexable
		? { index: true, follow: true }
		: { index: false, follow: true };
}
