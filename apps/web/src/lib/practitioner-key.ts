import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	parseAtPractitionerSegment,
	parsePractitionerSegment,
} from "@apercura/core";
import { type CountryAdapter, countryAdapter } from "@apercura/core/country";
import { type Locale, MARKET_LOCALES, type MarketCountry, marketOf } from "~/i18n/locales";

/** The identity behind a practitioner URL segment, in the market of the page. */
export type PractitionerKey = {
	country: MarketCountry;
	/** `directory.practitioners.id_scheme`: `RPPS`, `AT-WIEN`, `AT-STMK`… */
	idScheme: string;
	nationalId: string;
	/** Name part before the identifier, possibly empty (a wrong one redirects). */
	namePart: string;
};

/**
 * Parses the last segment of a practitioner URL for the market of `locale`:
 * `{prenom-nom}-{rpps}` in France (Luhn-checked), `{vorname-nachname}-{list}{number}`
 * in Austria (`anna-muster-w7983`). Null for anything else, so malformed or
 * other-market URLs never reach the database.
 */
export function parsePractitionerKey(locale: Locale, segment: string): PractitionerKey | null {
	const country = marketOf(locale);
	if (country === "AT") {
		const parsed = parseAtPractitionerSegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	const parsed = parsePractitionerSegment(segment);
	return parsed
		? { country, idScheme: "RPPS", nationalId: parsed.rpps, namePart: parsed.namePart }
		: null;
}

/** The country adapter of a locale's market (features, phone and address formats, sources). */
export function marketAdapter(locale: Locale): CountryAdapter {
	return countryAdapter(marketOf(locale));
}

/**
 * Parses the segment of a practitioner URL of any market, for routes outside a locale (the
 * Open Graph image): an RPPS slug is French, a regional list key Austrian.
 */
export function parseAnyPractitionerKey(segment: string): PractitionerKey | null {
	return parsePractitionerKey("fr", segment) ?? parsePractitionerKey(MARKET_LOCALES.AT, segment);
}

/**
 * The identifier printed on a practitioner's page and card: the RPPS number in France; in
 * Austria the list letter and number of the page URL (`w7983`), since the lists publish no
 * national number.
 */
export function displayId(key: Pick<PractitionerKey, "idScheme" | "nationalId">): string {
	const prefix = AT_ID_SCHEMES[key.idScheme as AtIdScheme];
	return prefix ? `${prefix}${key.nationalId}` : key.nationalId;
}

/** The identity part of a key (the cache key of the page queries: never the name part). */
export function identityOf(
	key: PractitionerKey,
): Pick<PractitionerKey, "country" | "idScheme" | "nationalId"> {
	return { country: key.country, idScheme: key.idScheme, nationalId: key.nationalId };
}
