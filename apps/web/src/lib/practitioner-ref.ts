import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	CZ_ID_SCHEME,
	DE_ID_SCHEMES,
	type DeIdScheme,
	deUrlKey,
	ES_ID_SCHEME,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	IT_ID_SCHEMES,
	type ItIdScheme,
	isValidRpps,
	itUrlKey,
	parseAtPractitionerSegment,
	parseCzFacilitySegment,
	parseDeFacilitySegment,
	parseEsCentreSegment,
	parseGbPracticeSegment,
	parseItPlaceSegment,
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
 * Reads the short reference forms and the services take (claims, removal
 * requests, error reports, contact requests): an RPPS in France
 * (`19999990013`), the list letters and number in Austria (`w7983`, the end of
 * an Austrian page address), `gb:` and the key in the United Kingdom (`gb:a81001`,
 * `gb:sg10002`), `cz:` and the NRPZS number in Czechia (`cz:39781`), `es:` and the REGCESS
 * centre code in Spain (`es:1328000001`), `it:` and the list letter and ministry code in Italy
 * (`it:f9000001`), `de:` and the source letters and key in Germany (`de:k0a1b2c3d4e`,
 * `de:th9001`). A page address is read from its last segment, in the market its first path
 * segment names (`/gb/practice/…`, `/cz/zarizeni/…`, `/es/centro/…`, `/it/struttura/…`,
 * `/de/einrichtung/…`).
 * Whitespace and case are forgiven. `market` is the market the reference was typed in: on a UK
 * page a bare key (`A81001`, `W91234`) is the UK's, on a Czech page a bare number (`39781`) is
 * Czechia's, on a Spanish page a ten-digit code is Spain's (as is any ten-digit code: no other
 * market has one), on an Italian page a list key (`f9000001`) is Italy's, on a German page a key
 * (`th9001`) is Germany's.
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
	const parts = trimmed.split(/[?#]/)[0]?.split("/").filter(Boolean) ?? [];
	const segment = trimmed.split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const compact = segment.replace(/\s+/g, "").toLowerCase();
	// A page address of the UK: `/gb/` is its first path segment (after the host).
	const path = /^https?:$/i.test(parts[0] ?? "") ? parts.slice(2) : parts;
	if (path.length > 1 && path[0]?.toLowerCase() === "gb") return gbRef(compact);
	// A page address of Czechia (`/cz/zarizeni/…`), or a number typed on a Czech page.
	if (path.length > 1 && path[0]?.toLowerCase() === "cz") return czRef(compact);
	// A page address of Spain (`/es/centro/…`; `/es/` was France in Spanish before, whose RPPS
	// addresses still read below), or a code typed on a Spanish page.
	if (path.length > 1 && path[0]?.toLowerCase() === "es") {
		const spanish = esRef(compact);
		if (spanish) return spanish;
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
	if (market === "CZ") {
		const czech = czRef(compact);
		if (czech) return czech;
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
 * `es:1328000001`, `it:f9000001`, `de:k0a1b2c3d4e`), as `parsePractitionerRef` reads it.
 */
export function practitionerRefOf(practitioner: { idScheme: string; nationalId: string }): string {
	if (practitioner.idScheme === CZ_ID_SCHEME) return `${CZ_REF}${practitioner.nationalId}`;
	if (practitioner.idScheme === ES_ID_SCHEME) return `${ES_REF}${practitioner.nationalId}`;
	if (IT_ID_SCHEMES[practitioner.idScheme as ItIdScheme]) {
		return `${IT_REF}${itUrlKey(practitioner.idScheme as ItIdScheme, practitioner.nationalId)}`;
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
 * German page (`th9001`) `de:th9001`. A value that
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
