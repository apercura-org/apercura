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
 * the pages of the UK market, in British English, under `/gb`, `cs-CZ` Czechia's, in
 * Czech, under `/cz`, `es-ES` Spain's, in Spanish, under `/es` (`es` stays the Spanish
 * interface of France's pages, under `/fr-es`), `it-IT` Italy's, in Italian, under `/it` (`it`
 * stays the Italian interface of France's pages, under `/fr-it`), and `de-DE` Germany's, in
 * German, under `/de` (`de` stays the German interface of France's pages, under `/fr-de`); Switzerland speaks three:
 * `de-CH` under `/ch` (German, the majority language), `fr-CH` under `/ch-fr` and `it-CH` under
 * `/ch-it`, all three market languages of their own, indexed, not interface translations; and
 * `et-EE` Estonia's, in Estonian, under `/ee`; `pl-PL` is
 * Poland's, in Polish, under `/pl`; and `nb-NO` Norway's, in Norwegian Bokmål, under `/no`; `en-IE` Ireland's, in English, under `/ie`; `fi-FI` Finland's, in Finnish, under `/fi`; `sl-SI` Slovenia's, in Slovenian, under `/si`; and `el-CY` Cyprus's, in Greek, under `/cy`
 * (docs/adr/0002-multi-country.md, section 2: once a second market opens, a
 * market's languages are locales of their own); `lt-LT` is Lithuania's, in Lithuanian, under `/lt`. Locale ids are BCP 47 tags, so next-intl formats dates, numbers
 * and plurals the market's way; the URL prefix is the segment.
 */
export const LOCALES = [
	"fr",
	"en",
	"de",
	"es",
	"it",
	"de-AT",
	"en-GB",
	"cs-CZ",
	"es-ES",
	"it-IT",
	"de-DE",
	"de-CH",
	"fr-CH",
	"it-CH",
	"et-EE",
	"pl-PL",
	"nb-NO",
	"en-IE",
	"fi-FI",
	"lt-LT",
	"sl-SI",
	"el-CY",
	"lv-LV",
] as const;

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

/** The path segment of the Spanish market (`/es/dentistas/madrid`). */
export const SPAIN_SEGMENT = "es";

/** The path segment of the Italian market (`/it/farmacie/roma/roma`). */
export const ITALY_SEGMENT = "it";

/** The path segment of the German market (`/de/krankenhaeuser/berlin`). */
export const GERMANY_SEGMENT = "de";

/**
 * The path segment of the Swiss market (`/ch/spital/zuerich`): `/{market}` for its main language
 * (German), `/{market}-{language}` for its other ones (`/ch-fr`, `/ch-it`), as the ADR's scheme
 * has it. Unlike `/fr-de`, those are market languages: indexed, with hreflang between them.
 */
export const SWITZERLAND_SEGMENT = "ch";

/** The path segment of the Estonian market (`/ee/perearstikeskused/tallinn`). */
export const ESTONIA_SEGMENT = "ee";

/** The path segment of the Polish market (`/pl/szpitale/krakow`). */
export const POLAND_SEGMENT = "pl";
/** The path segment of the Norwegian market (`/no/legekontorer/oslo`). */
export const NORWAY_SEGMENT = "no";
/** The path segment of the Cypriot market (`/cy/farmakeia/eparchia-lefkosias`). */
export const CYPRUS_SEGMENT = "cy";

/** The path segment of the Irish market (`/ie/pharmacy/cork`). */
export const IRELAND_SEGMENT = "ie";

/** The path segment of the Finnish market (`/fi/terveysasemat/pirkanmaan-hyvinvointialue/tampere`). */
export const FINLAND_SEGMENT = "fi";

/** The path segment of the Lithuanian market (`/lt/odontologijos-klinikos/vilniaus-miesto-savivaldybe`). */
export const LITHUANIA_SEGMENT = "lt";

/** The path segment of the Slovenian market (`/si/druzinski-zdravnik/osrednjeslovenska/ljubljana`). */
export const SLOVENIA_SEGMENT = "si";

/** The path segment of the Latvian market (`/lv/aptiekas/riga`). */
export const LATVIA_SEGMENT = "lv";

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
	"es-ES": `/${SPAIN_SEGMENT}`,
	"it-IT": `/${ITALY_SEGMENT}`,
	"de-DE": `/${GERMANY_SEGMENT}`,
	"de-CH": `/${SWITZERLAND_SEGMENT}`,
	"fr-CH": `/${SWITZERLAND_SEGMENT}-fr`,
	"it-CH": `/${SWITZERLAND_SEGMENT}-it`,
	"et-EE": `/${ESTONIA_SEGMENT}`,
	"pl-PL": `/${POLAND_SEGMENT}`,
	"nb-NO": `/${NORWAY_SEGMENT}`,
	"en-IE": `/${IRELAND_SEGMENT}`,
	"fi-FI": `/${FINLAND_SEGMENT}`,
	"lt-LT": `/${LITHUANIA_SEGMENT}`,
	"sl-SI": `/${SLOVENIA_SEGMENT}`,
	"el-CY": `/${CYPRUS_SEGMENT}`,
	"lv-LV": `/${LATVIA_SEGMENT}`,
} as const satisfies Record<Locale, `/${string}`>;

/**
 * The market whose pages a locale shows (ISO 3166-1 alpha-2): France for `fr`
 * and its interface translations, Austria for `de-AT`, the UK for `en-GB`, Czechia for `cs-CZ`, Spain for `es-ES`, Italy for `it-IT`, Germany for `de-DE`, Switzerland for `de-CH`, `fr-CH` and `it-CH`, Estonia for `et-EE`, Poland for `pl-PL`, Norway for `nb-NO`, Ireland for `en-IE`, Finland for `fi-FI`, Lithuania for `lt-LT`, Slovenia for `sl-SI`, Cyprus for `el-CY`, Latvia for `lv-LV`. Every query of a public
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
	"es-ES": "ES",
	"it-IT": "IT",
	"de-DE": "DE",
	"de-CH": "CH",
	"fr-CH": "CH",
	"it-CH": "CH",
	"et-EE": "EE",
	"pl-PL": "PL",
	"nb-NO": "NO",
	"en-IE": "IE",
	"fi-FI": "FI",
	"lt-LT": "LT",
	"sl-SI": "SI",
	"el-CY": "CY",
	"lv-LV": "LV",
} as const satisfies Record<Locale, string>;

export type MarketCountry = (typeof LOCALE_MARKETS)[Locale];

/** The market of a locale's pages. */
export function marketOf(locale: Locale): MarketCountry {
	// The market is the first two letters of the locale's prefix (`/fr-de` → FR, `/gb` → GB),
	// which spares the client islands a second table (tested against LOCALE_MARKETS).
	return LOCALE_PREFIXES[locale].slice(1, 3).toUpperCase() as MarketCountry;
}

/**
 * The locale of a market's own language (`FR` → `fr`, `AT` → `de-AT`, `GB` → `en-GB`,
 * `CZ` → `cs-CZ`, `ES` → `es-ES`, `IT` → `it-IT`, `DE` → `de-DE`, `PL` → `pl-PL`, `FI` → `fi-FI`, `LT` → `lt-LT`, `LV` → `lv-LV`, `CH` → `de-CH`: German under `/ch`, the
 * search's `pays` value; a French or Italian reader lands on `/ch-fr` or `/ch-it` through
 * `marketLocaleFor`), `EE` → `et-EE`, `NO` → `nb-NO`, `IE` → `en-IE`, `SI` → `sl-SI`, `CY` → `el-CY`.
 */
export const MARKET_LOCALES: Record<MarketCountry, Locale> = {
	FR: "fr",
	AT: "de-AT",
	GB: "en-GB",
	CZ: "cs-CZ",
	ES: "es-ES",
	IT: "it-IT",
	DE: "de-DE",
	CH: "de-CH",
	EE: "et-EE",
	PL: "pl-PL",
	NO: "nb-NO",
	IE: "en-IE",
	FI: "fi-FI",
	LT: "lt-LT",
	SI: "sl-SI",
	CY: "el-CY",
	LV: "lv-LV",
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
 * the practitioner space's rarer screens fall back to English; `es-ES` reads the Spanish catalog
 * with Spain's overrides (`messages/es-ES.json`: `es.json` is the Spanish language's catalog, the
 * one `/fr-es` reads), and `it-IT` the Italian catalog with Italy's overrides
 * (`messages/it-IT.json`: `it.json` is the one `/fr-it` reads), and `de-DE` the German catalog
 * with Germany's overrides (`messages/de-DE.json`: `de.json` is the one `/fr-de` reads and
 * Austria's `de-AT` builds on); `pl-PL` reads the English catalog with the Polish texts on top
 * (`messages/pl.json`), as Czechia does. Switzerland's three read their
 * language's catalog with the Swiss texts on top (`messages/de-CH.json`, `fr-CH.json`,
 * `it-CH.json`; `it-CH` is not Italy's `it-IT`), and `de-CH` writes "ss" for every "ß", as Swiss
 * Standard German does. `et-EE` reads the English catalog with the Estonian texts on top
 * (`messages/ee.json`), as Czechia does, `nb-NO` the English catalog with the Norwegian
 * Bokmål texts on top (`messages/no.json`), `sl-SI` with the Slovenian texts on top
 * (`messages/si.json`); `en-IE` reads the English catalog with Ireland's overrides
 * (`messages/en-IE.json`; `en-GB` is the UK's), and `fi-FI` the English catalog with the Finnish texts on top
 * (`messages/fi.json`); `lt-LT` reads it with the Lithuanian texts on top (`messages/lt.json`), and `el-CY` the English catalog with the Greek texts on top
 * (`messages/cy.json`).
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
	"es-ES": "es",
	"it-IT": "it",
	"de-DE": "de",
	"de-CH": "de",
	"fr-CH": "fr",
	"it-CH": "it",
	"et-EE": "et",
	"pl-PL": "pl",
	"nb-NO": "nb",
	"en-IE": "en",
	"fi-FI": "fi",
	"lt-LT": "lt",
	"sl-SI": "sl",
	"el-CY": "el",
	"lv-LV": "lv",
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
 * language (France in French, Austria in German, the UK in English, Czechia in Czech, Spain in
 * Spanish, Italy in Italian, Germany in German, Switzerland in each of its three languages, Estonia in
 * Estonian, Poland in
 * Polish, Norway in Norwegian, Ireland in English, Lithuania in Lithuanian, Slovenia in Slovenian, Cyprus in Greek). Interface translations
 * of a market's pages (`/fr-de`) stay `noindex`, out of the sitemaps and without hreflang.
 */
export const INDEXABLE_LOCALES: readonly Locale[] = [
	"fr",
	"de-AT",
	"en-GB",
	"cs-CZ",
	"es-ES",
	"it-IT",
	"de-DE",
	"de-CH",
	"fr-CH",
	"it-CH",
	"et-EE",
	"pl-PL",
	"nb-NO",
	"en-IE",
	"fi-FI",
	"lt-LT",
	"sl-SI",
	"el-CY",
	"lv-LV",
];

/**
 * The indexable locales of a market (`CH` → `de-CH`, `fr-CH`, `it-CH`): the languages of one
 * page that print hreflang alternates to each other below the homes (`pageMetadata`). One for
 * every other market, whose pages have no alternate.
 */
export function marketLanguages(country: MarketCountry): Locale[] {
	return INDEXABLE_LOCALES.filter((locale) => marketOf(locale) === country);
}

/**
 * hreflang of the indexable locales: language and market (`fr-FR`, `de-AT`),
 * so a page of one market never reads as the same audience as another's.
 */
export const HREFLANGS: Partial<Record<Locale, string>> = {
	fr: "fr-FR",
	"de-AT": "de-AT",
	"en-GB": "en-GB",
	"cs-CZ": "cs-CZ",
	"es-ES": "es-ES",
	"it-IT": "it-IT",
	"de-DE": "de-DE",
	"de-CH": "de-CH",
	"fr-CH": "fr-CH",
	"it-CH": "it-CH",
	"et-EE": "et-EE",
	"pl-PL": "pl-PL",
	"nb-NO": "nb-NO",
	"en-IE": "en-IE",
	"fi-FI": "fi-FI",
	"lt-LT": "lt-LT",
	"sl-SI": "sl-SI",
	"el-CY": "el-CY",
	"lv-LV": "lv-LV",
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
	"es-ES": "es-ES",
	"it-IT": "it-IT",
	"de-DE": "de-DE",
	"de-CH": "de-CH",
	"fr-CH": "fr-CH",
	"it-CH": "it-CH",
	"et-EE": "et-EE",
	"pl-PL": "pl-PL",
	"nb-NO": "nb-NO",
	"en-IE": "en-IE",
	"fi-FI": "fi-FI",
	"lt-LT": "lt-LT",
	"sl-SI": "sl-SI",
	"el-CY": "el-CY",
	"lv-LV": "lv-LV",
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
	"es-ES": "es_ES",
	"it-IT": "it_IT",
	"de-DE": "de_DE",
	"de-CH": "de_CH",
	"fr-CH": "fr_CH",
	"it-CH": "it_CH",
	"et-EE": "et_EE",
	"pl-PL": "pl_PL",
	"nb-NO": "nb_NO",
	"en-IE": "en_IE",
	"fi-FI": "fi_FI",
	"lt-LT": "lt_LT",
	"sl-SI": "sl_SI",
	"el-CY": "el_CY",
	"lv-LV": "lv_LV",
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
