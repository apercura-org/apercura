import {
	CATALOG_LANGUAGES,
	LOCALE_PREFIXES,
	LOCALE_TAGS,
	LOCALES,
	type Locale,
} from "~/i18n/locales";

/** The language of a catalog (`de-AT` reads `de`). */
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[Locale];

/** The first path segment of each locale (`fr-en` → `en`), to read a locale from a URL. */
const LOCALE_OF_SEGMENT: ReadonlyMap<string, Locale> = new Map(
	LOCALES.map((locale) => [LOCALE_PREFIXES[locale].slice(1), locale]),
);

/** The locale of a page from its path (`/fr-de/suche` → `de`), or null outside the locales. */
export function localeOfPath(pathname: string | null | undefined): Locale | null {
	const segment = pathname?.split("/")[1]?.toLowerCase() ?? "";
	return LOCALE_OF_SEGMENT.get(segment) ?? null;
}

/**
 * The document of the global error page from the URL it replaces: its `lang`, the language of
 * its text and the home it links back to (English and the international home outside the
 * locales).
 */
export function globalErrorDocument(pathname: string | null | undefined): {
	lang: string;
	language: CatalogLanguage;
	home: string;
} {
	const locale = localeOfPath(pathname);
	if (!locale) return { lang: "en", language: "en", home: "/" };
	const language = CATALOG_LANGUAGES[locale];
	return {
		lang: language === locale ? locale : LOCALE_TAGS[locale],
		language,
		home: LOCALE_PREFIXES[locale],
	};
}
