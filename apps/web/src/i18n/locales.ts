/**
 * Interface locales and what each one means for formatting and indexing. Plain
 * data with no framework import, so routing, server code, input validation and
 * tests share one list.
 */

/**
 * French is the default (the language of the first market); English is the
 * source catalog (British English); German, Spanish and Italian are interface
 * translations of France's pages. `de-AT` is Austria's own locale: the pages
 * of the Austrian market, in German, under `/at`, `en-GB` the United Kingdom's:
 * the pages of the UK market, in British English, under `/gb`, and `cs-CZ` Czechia's, in
 * Czech, under `/cz`
 * (docs/adr/0002-multi-country.md, section 2: once a second market opens, a
 * market's languages are locales of their own). Locale ids are BCP 47 tags, so next-intl formats dates, numbers
 * and plurals the market's way; the URL prefix is the segment.
 */
export const LOCALES = ["fr", "en", "de", "es", "it", "de-AT", "en-GB", "cs-CZ"] as const;

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

/** The path segment of the Czech market (`/cz/prakticky-lekar/praha`). */
export const CZECHIA_SEGMENT = "cz";

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
	"cs-CZ": `/${CZECHIA_SEGMENT}`,
} as const satisfies Record<Locale, `/${string}`>;

/**
 * The market whose pages a locale shows (ISO 3166-1 alpha-2): France for `fr`
 * and its interface translations, Austria for `de-AT`, the UK for `en-GB`, Czechia for `cs-CZ`. Every query of a public
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
	"cs-CZ": "CZ",
} as const satisfies Record<Locale, string>;

export type MarketCountry = (typeof LOCALE_MARKETS)[Locale];

/** The market of a locale's pages. */
export function marketOf(locale: Locale): MarketCountry {
	// The market is the first two letters of the locale's prefix (`/fr-de` → FR, `/gb` → GB),
	// which spares the client islands a second table (tested against LOCALE_MARKETS).
	return LOCALE_PREFIXES[locale].slice(1, 3).toUpperCase() as MarketCountry;
}

/** The locale of a market's own language (`FR` → `fr`, `AT` → `de-AT`, `GB` → `en-GB`, `CZ` → `cs-CZ`). */
export const MARKET_LOCALES: Record<MarketCountry, Locale> = {
	FR: "fr",
	AT: "de-AT",
	GB: "en-GB",
	CZ: "cs-CZ",
};

/** The open markets, France first: the order a search looks a place up in after its own. */
export const MARKET_COUNTRIES = Object.keys(MARKET_LOCALES) as MarketCountry[];

/** The path segment of a market's own pages (`GB` → `gb`), also the search's `pays` value. */
export function marketSegment(country: MarketCountry): string {
	return LOCALE_PREFIXES[MARKET_LOCALES[country]].slice(1);
}

/** The market a segment names (`gb` → `GB`, any case), or null. */
export function marketOfSegment(value: string | null | undefined): MarketCountry | null {
	const segment = value?.trim().toLowerCase();
	return MARKET_COUNTRIES.find((country) => marketSegment(country) === segment) ?? null;
}

/**
 * The locale of a market's pages for a visitor reading `visitor`: the visitor's own locale in
 * its market, else the market's locale in the visitor's language when it has one (an English
 * reader of `/gb` reads France at `/fr-en`), else the market's own language (`/fr` → `/cz`).
 */
export function marketLocaleFor(country: MarketCountry, visitor: Locale): Locale {
	if (marketOf(visitor) === country) return visitor;
	return (
		LOCALES.find(
			(locale) =>
				marketOf(locale) === country && CATALOG_LANGUAGES[locale] === CATALOG_LANGUAGES[visitor],
		) ?? MARKET_LOCALES[country]
	);
}

/**
 * The language of each locale's catalog: `de-AT` reads the German catalog, with
 * Austrian overrides (`messages/at.json`) where Austria words or rules differ; `en-GB`
 * reads the English catalog with the UK's overrides (`messages/gb.json`); `cs-CZ` reads the English
 * catalog with the Czech texts on top (`messages/cz.json`): every key shown under `/cz` is Czech,
 * the practitioner space's rarer screens fall back to English.
 */
export const CATALOG_LANGUAGES = {
	fr: "fr",
	en: "en",
	de: "de",
	es: "es",
	it: "it",
	"de-AT": "de",
	"en-GB": "en",
	"cs-CZ": "cs",
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
 * language (France in French, Austria in German, the UK in English, Czechia in Czech). Interface translations of a
 * market's pages (`/fr-de`) stay `noindex`, out of the sitemaps and without
 * hreflang.
 */
export const INDEXABLE_LOCALES: readonly Locale[] = ["fr", "de-AT", "en-GB", "cs-CZ"];

/**
 * hreflang of the indexable locales: language and market (`fr-FR`, `de-AT`),
 * so a page of one market never reads as the same audience as another's.
 */
export const HREFLANGS: Partial<Record<Locale, string>> = {
	fr: "fr-FR",
	"de-AT": "de-AT",
	"en-GB": "en-GB",
	"cs-CZ": "cs-CZ",
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
	"cs-CZ": "cs-CZ",
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
	"cs-CZ": "cs_CZ",
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
