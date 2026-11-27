/**
 * Estonian phone numbers (`+372`) and postcodes: normalization and display in the national
 * form. Pure functions, no I/O.
 *
 * Numbering (Tarbijakaitse ja Tehnilise Järelevalve Amet, numbering plan): no trunk prefix and
 * no area codes since 2004; seven digits for a fixed line (`3`, `4`, `6`, `7`: `612 3456`) and
 * for the oldest mobile numbers (`5`), eight for mobile numbers (`5`, `81`, `82`: `5123 4567`)
 * and the eight-digit free numbers (`8000`); service numbers `800`, `900` have seven. Postcodes
 * (sihtnumber, set by Omniva): five digits, `10001` to `99999`.
 */

/**
 * Converts an Estonian number as published (`+372 605 9600`, `+3726208200`, `6109490`,
 * `5135 780`, `00372 5123 4567`) to E.164 (`+3726059600`). Returns null when it is not a
 * plausible Estonian number: seven digits starting with 3 to 9, or eight starting with 5 or 8.
 * A list of numbers (`6566411; 6507237`) gives its first one. Numbers of another country keep
 * their international form.
 */
export function toE164Ee(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| või /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+372")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00372")) {
		digits = digits.slice(5);
	} else if ((digits.length === 10 || digits.length === 11) && digits.startsWith("372")) {
		digits = digits.slice(3);
	}
	return /^(?:[3-9]\d{6}|[58]\d{7})$/.test(digits) ? `+372${digits}` : null;
}

/**
 * Prints an Estonian E.164 number the way it is written in Estonia: seven digits as three and
 * four (`+3726109490` → `610 9490`), eight as four and four (`+37251234567` → `5123 4567`).
 * Numbers of another country are returned unchanged.
 */
export function formatPhoneEe(e164: string): string {
	if (!e164.startsWith("+372")) return e164;
	const national = e164.slice(4);
	if (/^\d{7}$/.test(national)) return `${national.slice(0, 3)} ${national.slice(3)}`;
	if (/^\d{8}$/.test(national)) return `${national.slice(0, 4)} ${national.slice(4)}`;
	return e164;
}

/** An Estonian postcode: five digits, the first not 0 (`10117`, `50412`). */
export const EE_POSTCODE = /^[1-9]\d{4}$/;

/**
 * A postcode as published (`50412`, ` 50 412 `, `EE-50412`) in its written form, five digits;
 * null when it is not an Estonian postcode.
 */
export function normalizeEePostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").replace(/^EE-?/i, "");
	return EE_POSTCODE.test(compact) ? compact : null;
}
