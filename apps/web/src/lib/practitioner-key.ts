import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	parseAtPractitionerSegment,
	parseGbPracticeSegment,
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
 * in Austria (`anna-muster-w7983`), `{practice-name}-{key}` in the United Kingdom
 * (`the-densham-surgery-a81001`, `muirhead-medical-centre-sg10002`). Null for anything else,
 * so malformed or other-market URLs never reach the database.
 */
export function parsePractitionerKey(locale: Locale, segment: string): PractitionerKey | null {
	const country = marketOf(locale);
	if (country === "GB") {
		const parsed = parseGbPracticeSegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
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
 * The marker of a UK page's segment outside a locale (the Open Graph image, `gb.{slug}`): an
 * ODS code of a Welsh practice (`w91234`) would otherwise read as a Vienna list key.
 */
export const GB_SEGMENT_MARKER = "gb.";

/**
 * The segment naming a practitioner page outside a locale (the Open Graph image): its slug,
 * marked with its market for a UK page (`gb.the-densham-surgery-a81001`).
 */
export function marketSegmentOf(country: string, slug: string): string {
	return country === "GB" ? `${GB_SEGMENT_MARKER}${slug}` : slug;
}

/**
 * Parses the segment of a practitioner URL of any market, for routes outside a locale (the
 * Open Graph image): a marked segment is British (`marketSegmentOf`), an RPPS slug French, a
 * regional list key Austrian.
 */
export function parseAnyPractitionerKey(segment: string): PractitionerKey | null {
	if (segment.startsWith(GB_SEGMENT_MARKER)) {
		return parsePractitionerKey(MARKET_LOCALES.GB, segment.slice(GB_SEGMENT_MARKER.length));
	}
	return parsePractitionerKey("fr", segment) ?? parsePractitionerKey(MARKET_LOCALES.AT, segment);
}

/**
 * The identifier printed on a practitioner's page and card: the RPPS number in France; in
 * Austria the list letter and number of the page URL (`w7983`), since the lists publish no
 * national number; in the UK the ODS code as the NHS prints it (`A81001`), else the list
 * letters and number of the page URL (`sg10002`).
 */
export function displayId(key: Pick<PractitionerKey, "idScheme" | "nationalId">): string {
	const gb = GB_ID_SCHEMES[key.idScheme as GbIdScheme];
	if (gb) return gb.prefix ? gbUrlKey(key.idScheme as GbIdScheme, key.nationalId) : key.nationalId;
	const prefix = AT_ID_SCHEMES[key.idScheme as AtIdScheme];
	return prefix ? `${prefix}${key.nationalId}` : key.nationalId;
}

/** The identity part of a key (the cache key of the page queries: never the name part). */
export function identityOf(
	key: PractitionerKey,
): Pick<PractitionerKey, "country" | "idScheme" | "nationalId"> {
	return { country: key.country, idScheme: key.idScheme, nationalId: key.nationalId };
}
