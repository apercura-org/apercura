import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	GB_ID_SCHEMES,
	type GbIdScheme,
	gbUrlKey,
	isValidRpps,
	parseAtPractitionerSegment,
	parseGbPracticeSegment,
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

/**
 * Reads the short reference forms and the services take (claims, removal
 * requests, error reports, contact requests): an RPPS in France
 * (`19999990013`), the list letters and number in Austria (`w7983`, the end of
 * an Austrian page address), `gb:` and the key in the United Kingdom (`gb:a81001`,
 * `gb:sg10002`). A page address is read from its last segment, in the market its first
 * path segment names (`/gb/practice/…`). Whitespace and case are forgiven. `market` is the
 * market the reference was typed in: on a UK page a bare key (`A81001`, `W91234`) is the UK's.
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
	const parts = trimmed.split(/[?#]/)[0]?.split("/").filter(Boolean) ?? [];
	const segment = trimmed.split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const compact = segment.replace(/\s+/g, "").toLowerCase();
	// A page address of the UK: `/gb/` is its first path segment (after the host).
	const path = /^https?:$/i.test(parts[0] ?? "") ? parts.slice(2) : parts;
	if (path.length > 1 && path[0]?.toLowerCase() === "gb") return gbRef(compact);
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
 * The short reference of a practitioner (`19999990013`, `w7983`, `gb:a81001`), as
 * `parsePractitionerRef` reads it.
 */
export function practitionerRefOf(practitioner: { idScheme: string; nationalId: string }): string {
	if (GB_ID_SCHEMES[practitioner.idScheme as GbIdScheme]) {
		return `${GB_REF}${gbUrlKey(practitioner.idScheme as GbIdScheme, practitioner.nationalId)}`;
	}
	const prefix = AT_ID_SCHEMES[practitioner.idScheme as AtIdScheme];
	return prefix ? `${prefix}${practitioner.nationalId}` : practitioner.nationalId;
}

/**
 * A reference as typed in a market's form, in the form every service reads the same way: a bare
 * key typed on a UK page (`W91234`) becomes `gb:w91234`, never an Austrian key. A value that
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
