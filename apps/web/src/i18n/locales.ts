/**
 * Interface locales and what each one means for formatting and indexing. Plain
 * data with no framework import, so routing, server code, input validation and
 * tests share one list.
 */

/**
 * French is the default (the language of the first market); English is the
 * source catalog (British English); German, Spanish and Italian are interface
 * translations of France's pages. `de-AT` is Austria's own locale: the pages
 * of the Austrian market, in German, under `/at`, and `en-GB` the United Kingdom's:
 * the pages of the UK market, in British English, under `/gb`
 * (docs/adr/0002-multi-country.md, section 2: once a second market opens, a
 * market's languages are locales of their own). Locale ids are BCP 47 tags, so next-intl formats dates, numbers
 * and plurals the market's way; the URL prefix is the segment.
 */
export const LOCALES = ["fr", "en", "de", "es", "it", "de-AT", "en-GB"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/**
 * The path segment of the France market: every page of the French directory
 * lives under it (`/fr/annuaire`), on one domain shared by all markets
 * (docs/adr/0002-multi-country.md, section 2).
 */
export const FRANCE_SEGMENT = "fr";

/** The path segment of the Austria market (`/at/allgemeinmedizin/wien`). */
export const AUSTRIA_SEGMENT = "at";

/** The path segment of the United Kingdom market (`/gb/gp-practices/camden`). */
export const UNITED_KINGDOM_SEGMENT = "gb";

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
	"de-AT": `/${AUSTRIA_SEGMENT}`,
	"en-GB": `/${UNITED_KINGDOM_SEGMENT}`,
} as const satisfies Record<Locale, `/${string}`>;

/**
 * The market whose pages a locale shows (ISO 3166-1 alpha-2): France for `fr`
 * and its interface translations, Austria for `de-AT`, the UK for `en-GB`. Every query of a public
 * page is scoped to it, so a market never lists another market's practitioners.
 */
export const LOCALE_MARKETS = {
	fr: "FR",
	en: "FR",
	de: "FR",
	es: "FR",
	it: "FR",
	"de-AT": "AT",
	"en-GB": "GB",
} as const satisfies Record<Locale, string>;

export type MarketCountry = (typeof LOCALE_MARKETS)[Locale];

/** The market of a locale's pages. */
export function marketOf(locale: Locale): MarketCountry {
	// The market is the first two letters of the locale's prefix (`/fr-de` → FR, `/gb` → GB),
	// which spares the client islands a second table (tested against LOCALE_MARKETS).
	return LOCALE_PREFIXES[locale].slice(1, 3).toUpperCase() as MarketCountry;
}

/** The locale of a market's own language (`FR` → `fr`, `AT` → `de-AT`, `GB` → `en-GB`). */
export const MARKET_LOCALES: Record<MarketCountry, Locale> = { FR: "fr", AT: "de-AT", GB: "en-GB" };

/**
 * The language of each locale's catalog: `de-AT` reads the German catalog, with
 * Austrian overrides (`messages/at.json`) where Austria words or rules differ; `en-GB`
 * reads the English catalog with the UK's overrides (`messages/gb.json`).
 */
export const CATALOG_LANGUAGES = {
	fr: "fr",
	en: "en",
	de: "de",
	es: "es",
	it: "it",
	"de-AT": "de",
	"en-GB": "en",
} as const satisfies Record<Locale, string>;

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
 * Locales whose pages may be indexed: those of an open market, in its own
 * language (France in French, Austria in German, the UK in English). Interface translations of a
 * market's pages (`/fr-de`) stay `noindex`, out of the sitemaps and without
 * hreflang.
 */
export const INDEXABLE_LOCALES: readonly Locale[] = ["fr", "de-AT", "en-GB"];

/**
 * hreflang of the indexable locales: language and market (`fr-FR`, `de-AT`),
 * so a page of one market never reads as the same audience as another's.
 */
export const HREFLANGS: Partial<Record<Locale, string>> = {
	fr: "fr-FR",
	"de-AT": "de-AT",
	"en-GB": "en-GB",
};

/** BCP 47 tag used to format dates and numbers, and as the content language (JSON-LD). */
export const LOCALE_TAGS: Record<Locale, string> = {
	fr: "fr-FR",
	en: "en-GB",
	de: "de-DE",
	es: "es-ES",
	it: "it-IT",
	"de-AT": "de-AT",
	"en-GB": "en-GB",
};

/** Open Graph locales (`og:locale`). */
export const OG_LOCALES: Record<Locale, string> = {
	fr: "fr_FR",
	en: "en_GB",
	de: "de_DE",
	es: "es_ES",
	it: "it_IT",
	"de-AT": "de_AT",
	"en-GB": "en_GB",
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
	// Locale ids are BCP 47 tags: their language subtag is the catalog's (CATALOG_LANGUAGES).
	return /^(?:en|de)\b/.test(locale);
}

/**
 * Common nouns written with a capital inside a sentence: German only. French,
 * Spanish, Italian and English lowercase a profession there ("Dr Marie Dubois,
 * cardiologue à Paris", "Dr. Marie Dubois, Kardiologin in Paris").
 */
export function capitalisesNouns(locale: Locale): boolean {
	return CATALOG_LANGUAGES[locale] === "de";
}
