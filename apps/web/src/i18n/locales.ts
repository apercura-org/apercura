/**
 * Interface locales and what each one means for formatting and indexing. Plain
 * data with no framework import, so routing, server code, input validation and
 * tests share one list.
 */

/**
 * French is the default (the language of the only open market); English is the
 * source catalog (British English); German, Spanish and Italian prepare future
 * markets.
 */
export const LOCALES = ["fr", "en", "de", "es", "it"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/**
 * The path segment of the France market: every page of the French directory
 * lives under it (`/fr/annuaire`), on one domain shared by all markets
 * (docs/adr/0002-multi-country.md, section 2).
 */
export const FRANCE_SEGMENT = "fr";

/**
 * The URL prefix of each interface locale: `/{market}` for the market's own
 * language, `/{market}-{language}` for an interface translation of its pages
 * (`/fr-en/practitioner/…`). The locale stays the internal `[locale]` segment;
 * next-intl rewrites the prefix to it.
 */
export const LOCALE_PREFIXES = {
	fr: `/${FRANCE_SEGMENT}`,
	en: `/${FRANCE_SEGMENT}-en`,
	de: `/${FRANCE_SEGMENT}-de`,
	es: `/${FRANCE_SEGMENT}-es`,
	it: `/${FRANCE_SEGMENT}-it`,
} as const satisfies Record<Locale, `/${string}`>;

/** The first path segment of each locale's pages (`fr`, `fr-en`…). */
export const LOCALE_SEGMENTS: readonly string[] = Object.values(LOCALE_PREFIXES).map((prefix) =>
	prefix.slice(1),
);

/**
 * The prefixes of the site before every market moved under its own segment:
 * French had none, the other locales their code (`/en/directory`). Old links
 * redirect to the prefixes above (~/lib/market-path).
 */
export const LEGACY_LOCALE_SEGMENTS = ["en", "de", "es", "it"] as const satisfies readonly Locale[];

/**
 * Locales whose pages may be indexed: those of an open market. Only France is
 * open in v1; the other languages exist for visitors and stay `noindex`, out of
 * the sitemaps and without hreflang until their market opens.
 */
export const INDEXABLE_LOCALES: readonly Locale[] = ["fr"];

/**
 * hreflang of the indexable locales: language and market (`fr-FR`), so a later
 * `fr-BE` or `fr-CH` page of another market never reads as the same audience.
 */
export const HREFLANGS: Partial<Record<Locale, string>> = { fr: "fr-FR" };

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
