/**
 * Interface locales and what each one means for formatting and indexing. Plain
 * data with no framework import, so routing, server code, input validation and
 * tests share one list.
 */

/**
 * French is the default (served without a prefix); English is the source
 * catalog (British English); German, Spanish and Italian prepare future markets.
 */
export const LOCALES = ["fr", "en", "de", "es", "it"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** The locales served under a prefix (`/en`, `/de`…). */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/**
 * Locales whose pages may be indexed: those of an open market. Only France is
 * open in v1; the other languages exist for visitors and stay `noindex`, out of
 * the sitemaps and without hreflang until their market opens.
 */
export const INDEXABLE_LOCALES: readonly Locale[] = ["fr"];

/** BCP 47 tag used to format dates and numbers, and as the content language (JSON-LD). */
export const LOCALE_TAGS: Record<Locale, string> = {
	fr: "fr-FR",
	en: "en-GB",
	de: "de-DE",
	es: "es-ES",
	it: "it-IT",
};

/** Open Graph locales (`og:locale`). */
export const OG_LOCALES: Record<Locale, string> = {
	fr: "fr_FR",
	en: "en_GB",
	de: "de_DE",
	es: "es_ES",
	it: "it_IT",
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** A stored or submitted locale, or the default one when it is unknown. */
export function toLocale(value: unknown): Locale {
	return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function isIndexableLocale(locale: Locale): boolean {
	return INDEXABLE_LOCALES.includes(locale);
}

/** Weekday names written in running text with a capital: English and German. */
export function capitalisesWeekdays(locale: Locale): boolean {
	return locale === "en" || locale === "de";
}

/**
 * Common nouns written with a capital inside a sentence: German only. French,
 * Spanish, Italian and English lowercase a profession there ("Dr Marie Dubois,
 * cardiologue à Paris", "Dr. Marie Dubois, Kardiologin in Paris").
 */
export function capitalisesNouns(locale: Locale): boolean {
	return locale === "de";
}
