import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	CH_ID_SCHEMES,
	type ChIdScheme,
	chUrlKey,
	DE_ID_SCHEMES,
	type DeIdScheme,
	deUrlKey,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	parseAtPractitionerSegment,
	parseChFacilitySegment,
	parseCzFacilitySegment,
	parseDeFacilitySegment,
	parseEsCentreSegment,
	parseGbPracticeSegment,
	parseItPlaceSegment,
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
 * (`the-densham-surgery-a81001`, `muirhead-medical-centre-sg10002`), `{facility-name}-{number}`
 * in Czechia (`mudr-hana-bohackova-39781`, the NRPZS number), `{centre-name}-{code}` in Spain
 * (`clinica-dental-ejemplo-1328000001`, the REGCESS code), `{name}-{list}{code}` in Italy
 * (`farmacia-esempio-f9000001`, the ministry's code), `{facility-name}-{source}{key}` in Germany
 * (`klinikum-beispiel-k0a1b2c3d4e`, `beispiel-apotheke-th9001`), `{name}-{list}{key}` in Switzerland
 * (`kantonsspital-beispiel-h123456789`, in each of its three languages). Null for anything else,
 * so malformed or other-market URLs never reach the database.
 */
export function parsePractitionerKey(locale: Locale, segment: string): PractitionerKey | null {
	const country = marketOf(locale);
	if (country === "CZ") {
		const parsed = parseCzFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "ES") {
		const parsed = parseEsCentreSegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "IT") {
		const parsed = parseItPlaceSegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "DE") {
		const parsed = parseDeFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "CH") {
		const parsed = parseChFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
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
 * The marker of a Czech page's segment outside a locale (`cz.{slug}`): an NRPZS number alone
 * reads as nothing else, but a marked segment never has to be guessed.
 */
export const CZ_SEGMENT_MARKER = "cz.";

/** The marker of a Spanish page's segment outside a locale (`es.{slug}`). */
export const ES_SEGMENT_MARKER = "es.";

/**
 * The marker of an Italian page's segment outside a locale (`it.{slug}`): a list key
 * (`s010030`) would otherwise read as an Austrian one.
 */
export const IT_SEGMENT_MARKER = "it.";

/**
 * The marker of a German page's segment outside a locale (`de.{slug}`): a pharmacy key of
 * Thuringia (`th420`) would otherwise read like an Austrian list key.
 */
export const DE_SEGMENT_MARKER = "de.";
/**
 * The marker of a Swiss page's segment outside a locale (`ch.{slug}`): a list key (`ju123456789`)
 * would otherwise read as another market's.
 */
export const CH_SEGMENT_MARKER = "ch.";

/** The marker of each market whose segments are marked outside a locale. */
const SEGMENT_MARKERS: Readonly<Partial<Record<MarketCountry, string>>> = {
	GB: GB_SEGMENT_MARKER,
	CZ: CZ_SEGMENT_MARKER,
	ES: ES_SEGMENT_MARKER,
	IT: IT_SEGMENT_MARKER,
	DE: DE_SEGMENT_MARKER,
	CH: CH_SEGMENT_MARKER,
};

/**
 * The segment naming a practitioner page outside a locale (the Open Graph image): its slug,
 * marked with its market for a UK, Czech, Spanish, Italian or German page
 * (`gb.the-densham-surgery-a81001`, `cz.mudr-hana-bohackova-39781`,
 * `es.clinica-dental-ejemplo-1328000001`, `it.farmacia-esempio-f9000001`,
 * `de.klinikum-beispiel-k0a1b2c3d4e`).
 */
export function marketSegmentOf(country: string, slug: string): string {
	const marker = SEGMENT_MARKERS[country as MarketCountry];
	return marker ? `${marker}${slug}` : slug;
}

/**
 * Parses the segment of a practitioner URL of any market, for routes outside a locale (the
 * Open Graph image): a marked segment is British, Czech, Spanish, Italian or Swiss (`marketSegmentOf`), an RPPS slug
 * French, a regional list key Austrian.
 */
export function parseAnyPractitionerKey(segment: string): PractitionerKey | null {
	for (const [country, marker] of Object.entries(SEGMENT_MARKERS)) {
		if (segment.startsWith(marker)) {
			return parsePractitionerKey(
				MARKET_LOCALES[country as MarketCountry],
				segment.slice(marker.length),
			);
		}
	}
	return parsePractitionerKey("fr", segment) ?? parsePractitionerKey(MARKET_LOCALES.AT, segment);
}

/**
 * The identifier printed on a practitioner's page and card: the RPPS number in France; in
 * Austria the list letter and number of the page URL (`w7983`), since the lists publish no
 * national number; in the UK the ODS code as the NHS prints it (`A81001`), else the list
 * letters and number of the page URL (`sg10002`); in Czechia the NRPZS facility number; in
 * Spain the REGCESS centre code; in Italy the ministry's code (`9000001`, `002112`, `010030`); in
 * Germany the source letters and key of the page URL (`k0a1b2c3d4e`, `th9001`), since no German
 * source publishes a national number; in
 * Switzerland the key of the page URL (`h123456789`, `blp7601001796874`), what its `ch:`
 * reference reads, since most lists number no facility and a derived key alone means nothing.
 */
export function displayId(key: Pick<PractitionerKey, "idScheme" | "nationalId">): string {
	if (DE_ID_SCHEMES[key.idScheme as DeIdScheme]) {
		return deUrlKey(key.idScheme as DeIdScheme, key.nationalId);
	}
	if (CH_ID_SCHEMES[key.idScheme as ChIdScheme]) {
		return chUrlKey(key.idScheme as ChIdScheme, key.nationalId);
	}
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
