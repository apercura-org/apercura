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
	{ country: "BE", status: "planned" },
	{ country: "DE", status: "planned" },
	{ country: "ES", status: "planned" },
	{ country: "IT", status: "planned" },
	{ country: "CH", status: "planned" },
	{ country: "GB", status: "planned" },
];

/** The language of the international home (`/`): English, the source catalog. */
export const INTERNATIONAL_LOCALE = "en" satisfies Locale;
