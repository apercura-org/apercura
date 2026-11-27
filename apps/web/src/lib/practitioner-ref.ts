import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	CH_ID_SCHEMES,
	type ChIdScheme,
	CZ_ID_SCHEME,
	chUrlKey,
	DE_ID_SCHEMES,
	type DeIdScheme,
	deUrlKey,
	EE_ID_SCHEMES,
	type EeIdScheme,
	ES_ID_SCHEME,
	eeUrlKey,
	FI_ID_SCHEMES,
	type FiIdScheme,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	IE_ID_SCHEMES,
	type IeIdScheme,
	IT_ID_SCHEMES,
	type ItIdScheme,
	ieUrlKey,
	isValidRpps,
	itUrlKey,
	NO_ID_SCHEMES,
	type NoIdScheme,
	noUrlKey,
	PL_ID_SCHEME,
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
	parseNoFacilitySegment,
	parsePlFacilitySegment,
} from "@apercura/core";
import type { MarketCountry } from "~/i18n/locales";

/**
 * A practitioner's identity in the shared directory schema: the key of
 * `directory.practitioners` (`country`, `id_scheme`, `national_id`).
 */
export type PractitionerRef = {
	country: MarketCountry;
	idScheme: string;
	nationalId: string;
};

/** The prefix of a UK reference (`gb:a81001`): an ODS code alone could read as an Austrian key. */
const GB_REF = "gb:";

/** A UK practice from the end of a page address or slug, or from its key alone (`a81001`). */
function gbRef(segment: string): PractitionerRef | null {
	const parsed = parseGbPracticeSegment(segment);
	return parsed
		? { country: "GB", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/** The prefix of a Czech reference (`cz:39781`): a bare number names no market by itself. */
const CZ_REF = "cz:";

/** A Czech facility from the end of a page address or slug, or from its NRPZS number alone. */
function czRef(segment: string): PractitionerRef | null {
	const parsed = parseCzFacilitySegment(segment);
	return parsed
		? { country: "CZ", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/**
 * The prefix of a German reference (`de:k0a1b2c3d4e`, `de:th420`): a Thuringian pharmacy's key
 * alone would read like an Austrian list key.
 */
const DE_REF = "de:";

/** A German facility from the end of a page address or slug, or from its key alone. */
function deRef(segment: string): PractitionerRef | null {
	const parsed = parseDeFacilitySegment(segment);
	return parsed
		? { country: "DE", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/** The prefix of a Spanish reference (`es:1328000001`): a bare code names no market by itself. */
const ES_REF = "es:";

/** A Spanish centre from the end of a page address or slug, or from its REGCESS code alone. */
function esRef(segment: string): PractitionerRef | null {
	const parsed = parseEsCentreSegment(segment);
	return parsed
		? { country: "ES", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/**
 * The prefix of an Italian reference (`it:f9000001`): a list key alone (`s010030`) could read as
 * an Austrian one.
 */
const IT_REF = "it:";

/** An Italian place from the end of a page address or slug, or from its key (`f9000001`). */
function itRef(segment: string): PractitionerRef | null {
	const parsed = parseItPlaceSegment(segment);
	return parsed
		? { country: "IT", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/**
 * The prefix of a Swiss reference (`ch:h123456789`): a list key alone (`ju123456789`) could read
 * as another market's.
 */
const CH_REF = "ch:";

/** A Swiss facility from the end of a page address or slug, or from its key (`h123456789`). */
function chRef(segment: string): PractitionerRef | null {
	const parsed = parseChFacilitySegment(segment);
	return parsed
		? { country: "CH", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/**
 * The prefix of an Estonian reference (`ee:l01909`, `ee:ap457`): a pharmacy's key alone would
 * read like an Austrian list key.
 */
const EE_REF = "ee:";

/**
 * An Estonian provider or pharmacy from the end of a page address or slug, or from its key
 * (`l01909`, `ap457`; the licence number as printed, `L01909`, too).
 */
function eeRef(segment: string): PractitionerRef | null {
	const parsed = parseEeFacilitySegment(segment);
	return parsed
		? { country: "EE", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/** The prefix of a Finnish reference (`fi:b18aa7f87eca4b97a8e8b438d2e29427`). */
const FI_REF = "fi:";

/**
 * A Finnish service location from the end of a page address or slug, or from its key (32
 * hexadecimal digits, or the catalogue's UUID with its dashes).
 */
function fiRef(segment: string): PractitionerRef | null {
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(segment)
		? segment.replace(/-/g, "")
		: segment;
	const parsed = parseFiFacilitySegment(uuid);
	return parsed
		? { country: "FI", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/** The prefix of a Polish reference (`pl:290629`): a bare number names no market by itself. */
const PL_REF = "pl:";

/** A Polish establishment from the end of a page address or slug, or from its RPWDL number alone. */
function plRef(segment: string): PractitionerRef | null {
	const parsed = parsePlFacilitySegment(segment);
	return parsed
		? { country: "PL", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}
/**
 * The prefix of a Norwegian reference (`no:910000039`): nine digits alone would read as another
 * market's number.
 */
const NO_REF = "no:";

/**
 * A Norwegian establishment from the end of a page address or slug, or from its organisation
 * number (`910000039`; as printed, `910 000 039`, too), its check digit verified.
 */
function noRef(segment: string): PractitionerRef | null {
	const parsed = parseNoFacilitySegment(segment);
	return parsed
		? { country: "NO", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/**
 * The prefix of an Irish reference (`ie:p10000612`): a list key alone (`h123456789`) could read
 * as a Swiss one.
 */
const IE_REF = "ie:";

/** An Irish facility from the end of a page address or slug, or from its key (`p10000612`). */
function ieRef(segment: string): PractitionerRef | null {
	const parsed = parseIeFacilitySegment(segment);
	return parsed
		? { country: "IE", idScheme: parsed.idScheme, nationalId: parsed.nationalId }
		: null;
}

/** The first path segments of Switzerland's pages, in its three languages (`ch`, `ch-fr`, `ch-it`). */
const CH_PATH = /^ch(?:-[a-z]{2})?$/;

/**
 * Reads the short reference forms and the services take (claims, removal
 * requests, error reports, contact requests): an RPPS in France
 * (`19999990013`), the list letters and number in Austria (`w7983`, the end of
 * an Austrian page address), `gb:` and the key in the United Kingdom (`gb:a81001`,
 * `gb:sg10002`), `cz:` and the NRPZS number in Czechia (`cz:39781`), `es:` and the REGCESS
 * centre code in Spain (`es:1328000001`), `it:` and the list letter and ministry code in Italy
 * (`it:f9000001`), `de:` and the source letters and key in Germany (`de:k0a1b2c3d4e`,
 * `de:th9001`), `ch:` and the list letters and key in Switzerland (`ch:h123456789`), `ee:` and
 * the source letters and key in Estonia (`ee:l01909`, `ee:ap457`), `pl:` and the RPWDL
 * establishment number in Poland (`pl:290629`), `no:` and the organisation
 * number in Norway (`no:910000039`), `ie:` and the list letter and key in Ireland
 * (`ie:p10000612`, `ie:n738`). A page
 * address is read from its last segment, in the market its first path segment names
 * (`/gb/practice/…`, `/cz/zarizeni/…`, `/es/centro/…`, `/it/struttura/…`,
 * `/de/einrichtung/…`, `/ch/einrichtung/…`,
 * `/ch-fr/etablissement/…`, `/ch-it/struttura/…`, `/ee/asutus/…`, `/pl/placowka/…`, `/no/virksomhet/…`, `/ie/facility/…`).
 * Whitespace and case are forgiven. `market` is the market the reference was typed in: on a UK
 * page a bare key (`A81001`, `W91234`) is the UK's, on a Czech page a bare number (`39781`) is
 * Czechia's, on a Spanish page a ten-digit code is Spain's (as is any ten-digit code: no other
 * market has one), on an Italian page a list key (`f9000001`) is Italy's, on a German page a key
 * (`th9001`) is Germany's, on a Swiss page a list
 * key (`h123456789`) Switzerland's, on a Polish page a bare number (`290629`) Poland's, on a Norwegian page an organisation number (`910 000 039`)
 * Norway's, on an Irish page a list key (`p10000612`, `h123456789`) Ireland's.
 * Null for anything else.
 */
export function parsePractitionerRef(
	value: string | null | undefined,
	market?: MarketCountry,
): PractitionerRef | null {
	if (!value) return null;
	const trimmed = value.trim().replace(/\/+$/, "");
	if (trimmed.toLowerCase().startsWith(GB_REF)) {
		return gbRef(trimmed.slice(GB_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(CZ_REF)) {
		return czRef(trimmed.slice(CZ_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(DE_REF)) {
		return deRef(trimmed.slice(DE_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(ES_REF)) {
		return esRef(trimmed.slice(ES_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(IT_REF)) {
		return itRef(trimmed.slice(IT_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(CH_REF)) {
		return chRef(trimmed.slice(CH_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(EE_REF)) {
		return eeRef(trimmed.slice(EE_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(FI_REF)) {
		return fiRef(trimmed.slice(FI_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(PL_REF)) {
		return plRef(trimmed.slice(PL_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(NO_REF)) {
		return noRef(trimmed.slice(NO_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	if (trimmed.toLowerCase().startsWith(IE_REF)) {
		return ieRef(trimmed.slice(IE_REF.length).replace(/\s+/g, "").toLowerCase());
	}
	const parts = trimmed.split(/[?#]/)[0]?.split("/").filter(Boolean) ?? [];
	const segment = trimmed.split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const compact = segment.replace(/\s+/g, "").toLowerCase();
	// A page address of the UK: `/gb/` is its first path segment (after the host).
	const path = /^https?:$/i.test(parts[0] ?? "") ? parts.slice(2) : parts;
	if (path.length > 1 && path[0]?.toLowerCase() === "gb") return gbRef(compact);
	// A page address of Czechia (`/cz/zarizeni/…`), or a number typed on a Czech page.
	if (path.length > 1 && path[0]?.toLowerCase() === "cz") return czRef(compact);
	// A page address of Poland (`/pl/placowka/…`).
	if (path.length > 1 && path[0]?.toLowerCase() === "pl") return plRef(compact);
	// A page address of Spain (`/es/centro/…`; `/es/` was France in Spanish before, whose RPPS
	// addresses still read below), or a code typed on a Spanish page.
	if (path.length > 1 && path[0]?.toLowerCase() === "es") {
		const spanish = esRef(compact);
		if (spanish) return spanish;
	}
	// A page address of Ireland (`/ie/facility/…`), or a key typed on an Irish page: before
	// Switzerland's, whose hospital keys (`h123456789`) look like Ireland's.
	if ((path.length > 1 && path[0]?.toLowerCase() === "ie") || market === "IE") {
		const irish = ieRef(compact);
		if (irish) return irish;
	}
	// A page address of Switzerland in any of its languages, or a key typed on a Swiss page.
	if ((path.length > 1 && CH_PATH.test(path[0]?.toLowerCase() ?? "")) || market === "CH") {
		const swiss = chRef(compact);
		if (swiss) return swiss;
	}
	// A page address of Italy (`/it/struttura/…`; `/it/` was France in Italian before, whose RPPS
	// addresses still read below), or a key typed on an Italian page.
	if ((path.length > 1 && path[0]?.toLowerCase() === "it") || market === "IT") {
		const italian = itRef(compact);
		if (italian) return italian;
	}
	// A page address of Germany (`/de/einrichtung/…`; `/de/` was France in German before, whose
	// RPPS addresses still read below), or a key typed on a German page.
	if ((path.length > 1 && path[0]?.toLowerCase() === "de") || market === "DE") {
		const german = deRef(compact);
		if (german) return german;
	}
	// A page address of Estonia (`/ee/asutus/…`), or a key typed on an Estonian page.
	if ((path.length > 1 && path[0]?.toLowerCase() === "ee") || market === "EE") {
		const estonian = eeRef(compact);
		if (estonian) return estonian;
	}
	// A page address of Norway (`/no/virksomhet/…`), or an organisation number typed on a
	// Norwegian page.
	if ((path.length > 1 && path[0]?.toLowerCase() === "no") || market === "NO") {
		const norwegian = noRef(compact);
		if (norwegian) return norwegian;
	}
	if (market === "CZ") {
		const czech = czRef(compact);
		if (czech) return czech;
	}
	if (market === "PL") {
		const polish = plRef(compact);
		if (polish) return polish;
	}
	// A page address of Finland (`/fi/toimipiste/…`), or a key typed on a Finnish page.
	if ((path.length > 1 && path[0]?.toLowerCase() === "fi") || market === "FI") {
		const finnish = fiRef(compact);
		if (finnish) return finnish;
	}
	if (market === "ES" || /^\d{10}$/.test(compact)) {
		const spanish = esRef(compact);
		if (spanish) return spanish;
	}
	if (market === "GB") {
		const british = gbRef(compact);
		if (british) return british;
	}
	if (/^\d{11}$/.test(compact)) {
		return isValidRpps(compact) ? { country: "FR", idScheme: "RPPS", nationalId: compact } : null;
	}
	const rppsAtEnd = /-(\d{11})$/.exec(compact);
	if (rppsAtEnd?.[1]) return parsePractitionerRef(rppsAtEnd[1]);
	const austrian = parseAtPractitionerSegment(compact);
	if (austrian) {
		return { country: "AT", idScheme: austrian.idScheme, nationalId: austrian.nationalId };
	}
	return gbRef(compact);
}

/**
 * The short reference of a practitioner (`19999990013`, `w7983`, `gb:a81001`, `cz:39781`,
 * `es:1328000001`, `it:f9000001`, `de:k0a1b2c3d4e`, `ch:h123456789`, `ee:l01909`, `pl:290629`, `ie:p10000612`, `fi:b18aa7f87eca4b97a8e8b438d2e29427`), as
 * `parsePractitionerRef` reads it.
 */
export function practitionerRefOf(practitioner: { idScheme: string; nationalId: string }): string {
	if (CH_ID_SCHEMES[practitioner.idScheme as ChIdScheme]) {
		return `${CH_REF}${chUrlKey(practitioner.idScheme as ChIdScheme, practitioner.nationalId)}`;
	}
	if (IE_ID_SCHEMES[practitioner.idScheme as IeIdScheme]) {
		return `${IE_REF}${ieUrlKey(practitioner.idScheme as IeIdScheme, practitioner.nationalId)}`;
	}
	if (practitioner.idScheme === CZ_ID_SCHEME) return `${CZ_REF}${practitioner.nationalId}`;
	if (practitioner.idScheme === PL_ID_SCHEME) return `${PL_REF}${practitioner.nationalId}`;
	if (FI_ID_SCHEMES[practitioner.idScheme as FiIdScheme])
		return `${FI_REF}${practitioner.nationalId}`;
	if (practitioner.idScheme === ES_ID_SCHEME) return `${ES_REF}${practitioner.nationalId}`;
	if (IT_ID_SCHEMES[practitioner.idScheme as ItIdScheme]) {
		return `${IT_REF}${itUrlKey(practitioner.idScheme as ItIdScheme, practitioner.nationalId)}`;
	}
	if (NO_ID_SCHEMES[practitioner.idScheme as NoIdScheme]) {
		return `${NO_REF}${noUrlKey(practitioner.idScheme as NoIdScheme, practitioner.nationalId)}`;
	}
	if (EE_ID_SCHEMES[practitioner.idScheme as EeIdScheme]) {
		return `${EE_REF}${eeUrlKey(practitioner.idScheme as EeIdScheme, practitioner.nationalId)}`;
	}
	if (DE_ID_SCHEMES[practitioner.idScheme as DeIdScheme]) {
		return `${DE_REF}${deUrlKey(practitioner.idScheme as DeIdScheme, practitioner.nationalId)}`;
	}
	if (GB_ID_SCHEMES[practitioner.idScheme as GbIdScheme]) {
		return `${GB_REF}${gbUrlKey(practitioner.idScheme as GbIdScheme, practitioner.nationalId)}`;
	}
	const prefix = AT_ID_SCHEMES[practitioner.idScheme as AtIdScheme];
	return prefix ? `${prefix}${practitioner.nationalId}` : practitioner.nationalId;
}

/**
 * A reference as typed in a market's form, in the form every service reads the same way: a bare
 * key typed on a UK page (`W91234`) becomes `gb:w91234`, never an Austrian key, and a number
 * typed on a Czech page (`39781`) `cz:39781`, a code typed on a Spanish page (`1328000001`)
 * `es:1328000001`, a key typed on an Italian page (`F9000001`) `it:f9000001`, a key typed on a
 * German page (`th9001`) `de:th9001`, a key typed on a
 * Swiss page (`H123456789`) `ch:h123456789`, a licence number typed on an Estonian page (`L01909`)
 * `ee:l01909`, an organisation number typed on a Norwegian page (`910 000 039`) `no:910000039`, a key typed
 * on an Irish page (`P10000612`) `ie:p10000612`.
 * A value that
 * names no page is kept as typed, so the service answers its own error.
 */
export function marketRef(value: string, market: MarketCountry): string {
	const parsed = parsePractitionerRef(value, market);
	return parsed ? practitionerRefOf(parsed) : value.trim();
}

/** True when the reference names a French RPPS (the methods of France apply). */
export function isRppsRef(ref: PractitionerRef): boolean {
	return ref.country === "FR" && ref.idScheme === "RPPS";
}
