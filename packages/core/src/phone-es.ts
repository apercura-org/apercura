/**
 * Spanish phone numbers (`+34`) and postcodes: normalization and display in the
 * national forms. Pure functions, no I/O.
 *
 * Numbering (Real Decreto 2296/2004 and the CNMC's numbering plan): nine digits, no
 * trunk prefix, `+34` before them in international form; the first digit is 6 or 7
 * (mobile), 8 or 9 (geographic and non-geographic fixed lines). Postcodes (código
 * postal): five digits, the first two the province's INE code (`01` to `52`).
 */

/**
 * Converts a Spanish number as published (`965950865`, `965 95 08 65`, `+34 965950865`,
 * `0034965950865`) to E.164 (`+34965950865`). Returns null when it is not a plausible
 * Spanish number: nine digits starting with 6 to 9. A list of numbers (`965939033,
 * 965988900`, `965939033 / 965988900`, `965939033 - 965988900`) gives its first one.
 * Numbers of another country keep their international form.
 */
export function toE164Es(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| - | y | o /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+34")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0034")) {
		digits = digits.slice(4);
	} else if (digits.length === 11 && digits.startsWith("34")) {
		digits = digits.slice(2);
	}
	return /^[6-9]\d{8}$/.test(digits) ? `+34${digits}` : null;
}

/**
 * Prints a Spanish E.164 number the way it is written in Spain, in three groups of
 * three digits (`965 950 865`, `653 655 567`). Numbers of another country are
 * returned unchanged.
 */
export function formatPhoneEs(e164: string): string {
	if (!e164.startsWith("+34")) return e164;
	const national = e164.slice(3);
	if (!/^\d{9}$/.test(national)) return e164;
	return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** A Spanish postcode: five digits, the first two a province code (`01`–`52`). */
export const ES_POSTCODE = /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/;

/**
 * A postcode as published (`3110`, `03110`, ` 03110 `) in its written form, five
 * digits; null when it is not a Spanish postcode. A four-digit code lost its leading
 * zero in a spreadsheet and gets it back.
 */
export function normalizeEsPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let compact = raw.replace(/\s+/g, "");
	if (/^\d{4}$/.test(compact)) compact = `0${compact}`;
	return ES_POSTCODE.test(compact) ? compact : null;
}
