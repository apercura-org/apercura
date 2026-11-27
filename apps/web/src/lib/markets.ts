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
	{ country: "CH", status: "open", locale: MARKET_LOCALES.CH },
	{ country: "EE", status: "open", locale: MARKET_LOCALES.EE },
	{ country: "PL", status: "open", locale: MARKET_LOCALES.PL },
	{ country: "NO", status: "open", locale: MARKET_LOCALES.NO },
	{ country: "IE", status: "open", locale: MARKET_LOCALES.IE },
	{ country: "FI", status: "open", locale: MARKET_LOCALES.FI },
	{ country: "LT", status: "open", locale: MARKET_LOCALES.LT },
	{ country: "SI", status: "open", locale: MARKET_LOCALES.SI },
	{ country: "CY", status: "open", locale: MARKET_LOCALES.CY },
	{ country: "BE", status: "planned" },
];

/**
 * Markets whose pages are practices or facilities, never people: the United Kingdom (NHS
 * practices), Czechia (NRPZS facilities), Spain (REGCESS centres), Italy (the Ministry of
 * Health's pharmacies and hospitals), Germany (hospitals, clinics and pharmacies), Switzerland
 * (hospitals, homes, pharmacies) and Poland (RPWDL's establishments), Switzerland
 * (hospitals, nursing homes and pharmacies) and Estonia (healthcare providers holding an activity
 * licence, and pharmacies) and Ireland (pharmacies, nursing homes, hospitals and health
 * centres) and Lithuania (VASPVT's licensed institutions). Their page names a place of care,
 * without a
 * person's name split into first and last names, a gender or a kind of practice to tell apart.
 */
export const PRACTICE_MARKETS: ReadonlySet<string> = new Set([
	"GB",
	"CZ",
	"ES",
	"IT",
	"DE",
	"CH",
	"EE",
	"PL",
	"NO",
	"IE",
	"FI",
	"LT",
	"CY",
]);

/** True when the market's pages are practices or facilities (`PRACTICE_MARKETS`). */
export function listsPractices(country: string): boolean {
	return PRACTICE_MARKETS.has(country);
}

/** The language of the international home (`/`): English, the source catalog. */
export const INTERNATIONAL_LOCALE = "en" satisfies Locale;
