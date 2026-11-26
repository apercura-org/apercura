import { type Locale, MARKET_LOCALES } from "~/i18n/locales";

/**
 * The countries the international home lists (docs/adr/0002-multi-country.md). An open market
 * links to its pages; a planned one is a line of text, never a page of its own, so the root
 * creates no thin or duplicate page. A market opens through the ADR's checklist, which adds
 * its segment, its locales and its sitemaps.
 */
export type Market =
	| {
			/** ISO 3166-1 alpha-2 code: the country name comes from `Intl.DisplayNames`. */
			country: string;
			status: "open";
			/** The market's own language, at `/{segment}`. */
			locale: Locale;
	  }
	| { country: string; status: "planned" };

export const MARKETS: readonly Market[] = [
	{ country: "FR", status: "open", locale: "fr" },
	{ country: "AT", status: "open", locale: MARKET_LOCALES.AT },
	{ country: "GB", status: "open", locale: MARKET_LOCALES.GB },
	{ country: "CZ", status: "open", locale: MARKET_LOCALES.CZ },
	{ country: "ES", status: "open", locale: MARKET_LOCALES.ES },
	{ country: "IT", status: "open", locale: MARKET_LOCALES.IT },
	{ country: "DE", status: "open", locale: MARKET_LOCALES.DE },
	{ country: "BE", status: "planned" },
	{ country: "CH", status: "planned" },
];

/**
 * Markets whose pages are practices or facilities, never people: the United Kingdom (NHS
 * practices), Czechia (NRPZS facilities), Spain (REGCESS centres), Italy (the Ministry of
 * Health's pharmacies and hospitals) and Germany (hospitals, clinics and pharmacies). Their page
 * names a place of care, without a
 * person's name split into first and last names, a gender or a kind of practice to tell apart.
 */
export const PRACTICE_MARKETS: ReadonlySet<string> = new Set(["GB", "CZ", "ES", "IT", "DE"]);

/** True when the market's pages are practices or facilities (`PRACTICE_MARKETS`). */
export function listsPractices(country: string): boolean {
	return PRACTICE_MARKETS.has(country);
}

/** The language of the international home (`/`): English, the source catalog. */
export const INTERNATIONAL_LOCALE = "en" satisfies Locale;
