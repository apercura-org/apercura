import {
	AT_ID_SCHEMES,
	type AtIdScheme,
	isValidRpps,
	parseAtPractitionerSegment,
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

/**
 * Reads the short reference forms and the services take (claims, removal
 * requests, error reports, contact requests): an RPPS in France
 * (`19999990013`), the list letters and number in Austria (`w7983`, the end of
 * an Austrian page address). Whitespace and case are forgiven; a page address
 * or slug is read from its last segment. Null for anything else.
 */
export function parsePractitionerRef(value: string | null | undefined): PractitionerRef | null {
	if (!value) return null;
	const segment = value.trim().replace(/\/+$/, "").split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const compact = segment.replace(/\s+/g, "").toLowerCase();
	if (/^\d{11}$/.test(compact)) {
		return isValidRpps(compact) ? { country: "FR", idScheme: "RPPS", nationalId: compact } : null;
	}
	const rppsAtEnd = /-(\d{11})$/.exec(compact);
	if (rppsAtEnd?.[1]) return parsePractitionerRef(rppsAtEnd[1]);
	const austrian = parseAtPractitionerSegment(compact);
	if (!austrian) return null;
	return { country: "AT", idScheme: austrian.idScheme, nationalId: austrian.nationalId };
}

/** The short reference of a practitioner (`19999990013`, `w7983`), as `parsePractitionerRef` reads it. */
export function practitionerRefOf(practitioner: { idScheme: string; nationalId: string }): string {
	const prefix = AT_ID_SCHEMES[practitioner.idScheme as AtIdScheme];
	return prefix ? `${prefix}${practitioner.nationalId}` : practitioner.nationalId;
}

/** True when the reference names a French RPPS (the methods of France apply). */
export function isRppsRef(ref: PractitionerRef): boolean {
	return ref.country === "FR" && ref.idScheme === "RPPS";
}
