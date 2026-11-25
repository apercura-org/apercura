/**
 * United Kingdom phone numbers (`+44`) and postcodes: normalization and display in
 * the national forms. Pure functions, no I/O.
 *
 * Numbering (Ofcom, National Telephone Numbering Plan): a trunk prefix `0` then
 * 10 digits (9 in a few old areas), `+44` without the `0` in international form.
 * Postcodes (Royal Mail): an outward code (area letters, district), a space and an
 * inward code (a digit and two letters), `SW1A 1AA`.
 */

/**
 * Converts a UK number as published (`01642 672351`, `+44 (0)20 7946 0000`,
 * `0044 113 496 0000`, `07966 769281`) to E.164 (`+441642672351`). Returns null
 * when it is not a plausible UK number: 9 or 10 digits after the trunk `0`,
 * starting with 1, 2, 3, 5, 7, 8 or 9. Numbers of another country keep their
 * international form.
 */
export function toE164Gb(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let digits = raw.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+44")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0044")) {
		digits = digits.slice(4);
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	return /^[1235789]\d{8,9}$/.test(digits) ? `+44${digits}` : null;
}

/**
 * Prints a UK E.164 number the way it is written in the UK, grouped after its
 * area code: `020 7946 0000` (London and the other 02 areas), `0113 496 0000`
 * (the 011x cities and 0121, 0131, 0141, 0151, 0161, 0191), `01642 672351` (other geographic numbers),
 * `07966 769281` (mobiles), `0300 123 4567` (non-geographic). Numbers of another
 * country are returned unchanged.
 */
export function formatPhoneGb(e164: string): string {
	if (!e164.startsWith("+44")) return e164;
	const national = `0${e164.slice(3)}`;
	if (!/^0\d{9,10}$/.test(national)) return e164;
	if (national.length === 10) return `${national.slice(0, 5)} ${national.slice(5)}`;
	if (/^02/.test(national)) {
		return `${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`;
	}
	if (/^01(1\d|[234569]1)/.test(national) || /^0[3589]/.test(national)) {
		return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
	}
	return `${national.slice(0, 5)} ${national.slice(5)}`;
}

/** A UK postcode with its single space (`SW1A 1AA`, `M1 1AE`, `BT4 1NS`). */
export const GB_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/;

/**
 * A postcode as published (`ab101qn`, `TS18  1HU`, `SW1A1AA`) in its standard form,
 * uppercase with one space before the inward code; null when it is not a UK
 * postcode.
 */
export function normalizeGbPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	if (compact.length < 5 || compact.length > 7) return null;
	const postcode = `${compact.slice(0, -3)} ${compact.slice(-3)}`;
	return GB_POSTCODE.test(postcode) ? postcode : null;
}
