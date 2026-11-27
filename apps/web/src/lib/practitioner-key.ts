import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	CH_ID_SCHEMES,
	type ChIdScheme,
	chUrlKey,
	DE_ID_SCHEMES,
	type DeIdScheme,
	deUrlKey,
	EE_ID_SCHEMES,
	type EeIdScheme,
	eeLicenceNumber,
	eeUrlKey,
	FI_ID_SCHEMES,
	type FiIdScheme,
	fiPtvChannelId,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	IE_ID_SCHEMES,
	type IeIdScheme,
	ieUrlKey,
	NO_ID_SCHEMES,
	type NoIdScheme,
	noOrgNumber,
	parseAtPractitionerSegment,
	parseChFacilitySegment,
	parseCzFacilitySegment,
	parseDeFacilitySegment,
	parseEeFacilitySegment,
	parseEsCentreSegment,
	parseFiFacilitySegment,
	parseGbPracticeSegment,
	parseIeFacilitySegment,
	parseItPlaceSegment,
	parseLtFacilitySegment,
	parseNoFacilitySegment,
	parsePlFacilitySegment,
	parsePractitionerSegment,
	parseSiPractitionerSegment,
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
 * (`kantonsspital-beispiel-h123456789`, in each of its three languages), `{ime-priimek}-si{number}`
 * in Slovenia (`miran-kolar-si7774`, the insurer's number). Null for anything else,
 * (`kantonsspital-beispiel-h123456789`, in each of its three languages), `{name}-{source}{key}`
 * in Estonia (`perearstikeskus-naide-l01909`, `naidisapteek-ap457`), `{name}-{number}` in
 * Poland (`przychodnia-przykladowa-290629`, the RPWDL establishment number), `{name}-{orgnr}` in Norway
 * (`eksempel-legesenter-910000039`, the establishment's organisation number), `{name}-{list}{key}` in Ireland (`example-pharmacy-p10000612`,
 * `example-hospital-h123456789`), `{name}-{number}-{address}` in Lithuania
 * (`uab-pavyzdine-klinika-5271-12679435`, VASPVT's institution number and the Address Register's
 * code). Null for anything else,
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
	if (country === "EE") {
		const parsed = parseEeFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "PL") {
		const parsed = parsePlFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "NO") {
		const parsed = parseNoFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "IE") {
		const parsed = parseIeFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "FI") {
		const parsed = parseFiFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "LT") {
		const parsed = parseLtFacilitySegment(segment);
		return parsed ? { country, ...parsed } : null;
	}
	if (country === "SI") {
		const parsed = parseSiPractitionerSegment(segment);
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

/**
 * The marker of an Estonian page's segment outside a locale (`ee.{slug}`): a pharmacy key
 * (`ap457`) would otherwise read like an Austrian list key.
 */
export const EE_SEGMENT_MARKER = "ee.";

/** The marker of a Polish page's segment outside a locale (`pl.{slug}`): a bare RPWDL number reads as Czechia's. */
export const PL_SEGMENT_MARKER = "pl.";
/**
 * The marker of a Norwegian page's segment outside a locale (`no.{slug}`): its nine digits would
 * otherwise read like another market's number.
 */
export const NO_SEGMENT_MARKER = "no.";

/**
 * The marker of an Irish page's segment outside a locale (`ie.{slug}`): a hospital key
 * (`h123456789`) would otherwise read as a Swiss one.
 */
export const IE_SEGMENT_MARKER = "ie.";

/** The marker of a Finnish page's segment outside a locale (`fi.{slug}`): its key names no market by itself. */
export const FI_SEGMENT_MARKER = "fi.";

/**
 * The marker of a Lithuanian page's segment outside a locale (`lt.{slug}`): a page key
 * (`5271-12679435`) reads as no other market's, but a marked segment never has to be guessed.
 */
export const LT_SEGMENT_MARKER = "lt.";

/** The marker of each market whose segments are marked outside a locale. */
const SEGMENT_MARKERS: Readonly<Partial<Record<MarketCountry, string>>> = {
	GB: GB_SEGMENT_MARKER,
	CZ: CZ_SEGMENT_MARKER,
	ES: ES_SEGMENT_MARKER,
	IT: IT_SEGMENT_MARKER,
	DE: DE_SEGMENT_MARKER,
	CH: CH_SEGMENT_MARKER,
	EE: EE_SEGMENT_MARKER,
	PL: PL_SEGMENT_MARKER,
	NO: NO_SEGMENT_MARKER,
	IE: IE_SEGMENT_MARKER,
	FI: FI_SEGMENT_MARKER,
	LT: LT_SEGMENT_MARKER,
};

/**
 * The segment naming a practitioner page outside a locale (the Open Graph image): its slug,
 * marked with its market for a UK, Czech, Spanish, Italian or German page
 * (`gb.the-densham-surgery-a81001`, `cz.mudr-hana-bohackova-39781`,
 * `es.clinica-dental-ejemplo-1328000001`, `it.farmacia-esempio-f9000001`,
 * `de.klinikum-beispiel-k0a1b2c3d4e`, `ie.example-pharmacy-p10000612`).
 */
export function marketSegmentOf(country: string, slug: string): string {
	const marker = SEGMENT_MARKERS[country as MarketCountry];
	return marker ? `${marker}${slug}` : slug;
}

/**
 * Parses the segment of a practitioner URL of any market, for routes outside a locale (the
 * Open Graph image): a marked segment is British, Czech, Spanish, Italian, German, Swiss, Irish or Lithuanian (`marketSegmentOf`), an RPPS slug
 * French, a key ending in `si` and a number Slovenian (`miran-kolar-si7774`), a regional list
 * key Austrian.
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
	return (
		parsePractitionerKey("fr", segment) ??
		parsePractitionerKey(MARKET_LOCALES.SI, segment) ??
		parsePractitionerKey(MARKET_LOCALES.AT, segment)
	);
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
 * reference reads, since most lists number no facility and a derived key alone means nothing; in
 * Slovenia the insurer's doctor number (`7774`).
 * Estonia a provider's first activity licence number as the Health Board writes it (`L01909`)
 * and a pharmacy's key of the page URL (`ap457`); in Norway the establishment's organisation
 * number in groups of three, as Norway prints it (`910 000 039`); in Ireland the key of the page URL too (`p10000612`, `n738`,
 * `h123456789`), since a bare PSI or HIQA number names neither list; in Finland the Finnish Service Catalogue's id
 * of the service location, in its own form (`b18aa7f8-7eca-4b97-a8e8-b438d2e29427`); in Lithuania
 * the page key (`5271-12679435`).
 */
export function displayId(key: Pick<PractitionerKey, "idScheme" | "nationalId">): string {
	if (NO_ID_SCHEMES[key.idScheme as NoIdScheme]) return noOrgNumber(key.nationalId);
	if (key.idScheme === "EE-TTL") return eeLicenceNumber(key.nationalId);
	if (FI_ID_SCHEMES[key.idScheme as FiIdScheme]) return fiPtvChannelId(key.nationalId);
	if (EE_ID_SCHEMES[key.idScheme as EeIdScheme]) {
		return eeUrlKey(key.idScheme as EeIdScheme, key.nationalId);
	}
	if (DE_ID_SCHEMES[key.idScheme as DeIdScheme]) {
		return deUrlKey(key.idScheme as DeIdScheme, key.nationalId);
	}
	if (CH_ID_SCHEMES[key.idScheme as ChIdScheme]) {
		return chUrlKey(key.idScheme as ChIdScheme, key.nationalId);
	}
	if (IE_ID_SCHEMES[key.idScheme as IeIdScheme]) {
		return ieUrlKey(key.idScheme as IeIdScheme, key.nationalId);
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
