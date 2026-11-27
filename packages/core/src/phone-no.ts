/**
 * Norwegian phone numbers (`+47`) and postcodes: normalization and display in the national
 * form. Pure functions, no I/O.
 *
 * Numbering (Nasjonal kommunikasjonsmyndighet, the national numbering plan): no trunk prefix
 * and no area codes since 1993; eight digits for every subscriber number, mobile numbers
 * starting with `4` or `9` (`412 34 567`), fixed lines with `2`, `3`, `5`, `6` or `7`
 * (`22 12 34 56`), and the free and shared-cost numbers with `8` (`800 12 345`). Five-digit
 * short numbers (`02xxx`, `1xxx`) are not subscriber numbers. Postcodes (postnummer, set by
 * Posten): four digits, `0001` to `9991`.
 */

/**
 * Converts a Norwegian number as published (`+47 22 12 34 56`, `22123456`, `0047 412 34 567`,
 * `+4791234567`) to E.164 (`+4722123456`). Returns null when it is not a plausible Norwegian
 * subscriber number: eight digits starting with 2 to 9. A list of numbers (`22123456 /
 * 91234567`) gives its first one. Numbers of another country keep their international form.
 */
export function toE164No(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| eller /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+47")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0047")) {
		digits = digits.slice(4);
	} else if (digits.length === 10 && digits.startsWith("47")) {
		digits = digits.slice(2);
	}
	return /^[2-9]\d{7}$/.test(digits) ? `+47${digits}` : null;
}

/**
 * Prints a Norwegian E.164 number the way it is written in Norway: a mobile number as three,
 * two and three digits (`+4791234567` → `912 34 567`), a fixed line in pairs (`+4722123456` →
 * `22 12 34 56`), a number starting with 8 as three, two and three (`+4780012345` →
 * `800 12 345`). Numbers of another country are returned unchanged.
 */
export function formatPhoneNo(e164: string): string {
	if (!e164.startsWith("+47")) return e164;
	const national = e164.slice(3);
	if (!/^\d{8}$/.test(national)) return e164;
	if (/^[489]/.test(national)) {
		return `${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5)}`;
	}
	return national.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** A Norwegian postcode: four digits (`0150`, `5021`, `9990`). */
export const NO_POSTCODE = /^\d{4}$/;

/**
 * A postcode as published (`0150`, ` 50 21 `, `NO-5021`, `N-5021`) in its written form, four
 * digits; null when it is not a Norwegian postcode.
 */
export function normalizeNoPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").replace(/^NO?-?/i, "");
	return NO_POSTCODE.test(compact) && compact !== "0000" ? compact : null;
}
