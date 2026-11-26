import { MARKET_COUNTRIES, type MarketCountry, marketLocaleFor } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";

export interface MarketHome {
	country: MarketCountry;
	/** The locale of that market's pages for this visitor. */
	locale: Locale;
	/** The path of its home (`/fr-en`, `/at`…). */
	href: string;
}

/**
 * The homes of the open markets for a visitor reading `locale`, France first: each in the
 * visitor's language when that market offers it, else in its own (`marketLocaleFor`).
 */
export function marketHomes(locale: Locale): MarketHome[] {
	return MARKET_COUNTRIES.map((country) => {
		const target = marketLocaleFor(country, locale);
		return { country, locale: target, href: getPathname({ href: "/", locale: target }) };
	});
}
