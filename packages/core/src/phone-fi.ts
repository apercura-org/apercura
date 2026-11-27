/**
 * Finnish phone numbers (`+358`) and postcodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (Traficom, the Finnish numbering plan): a trunk prefix `0`, then an area code of one
 * or two digits (`9` Helsinki, `3` Tampere, `17` Kuopio, `18` Åland), a mobile prefix (`40` to
 * `50`, `457`) or a national service prefix (`100`, `20`, `29`, `30`, `600`, `700`, `800`);
 * national significant numbers have five to twelve digits. Written with the trunk prefix and
 * the code apart (`09 310 5015`, `040 123 4567`, `0295 000 000`). Postcodes (postinumero, set
 * by Posti): five digits, `00100` (Helsinki) to `99999`, Åland's `22xxx` included.
 */

/**
 * Converts a Finnish number as published (`+358 9 310 5015`, `09 3105015`, `064384844`,
 * `+358 40 123 4567`, `00358 40 1234567`) to E.164 (`+35893105015`). Returns null when it is not
 * a plausible Finnish number: a trunk `0` (or the country code) then five to twelve digits, the
 * first not `0`. A list of numbers (`09 123 456, 09 654 321`) gives its first one. Numbers of
 * another country keep their international form.
 */
export function toE164Fi(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| tai | eller /i)[0] ?? "";
	let digits = first.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+358")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00358")) {
		digits = digits.slice(5);
	} else if (digits.startsWith("358") && digits.length >= 9) {
		digits = digits.slice(3);
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	return /^[1-9]\d{4,11}$/.test(digits) ? `+358${digits}` : null;
}

/**
 * The prefix a Finnish national number is written apart, without its trunk `0`: a national
 * service prefix (`100`, `200`, `300`, `600`, `700`, `800`, `295`, `20`, `29`, `30`, `75`), a
 * mobile prefix (`40`–`46`, `50`, `457`), a two-digit area code (`13`–`19`) or a one-digit one
 * (`2`, `3`, `5`, `6`, `8`, `9`).
 */
function prefixLength(national: string): number {
	if (/^(?:[1-37-8]00|600|295|457)/.test(national)) return 3;
	if (/^(?:2[09]|30|4\d|50|75|1[3-9])/.test(national)) return 2;
	return 1;
}

/** The subscriber digits in groups: three then four, or threes, the last group of two to four. */
function groups(rest: string): string {
	if (rest.length <= 4) return rest;
	if (rest.length === 5) return `${rest.slice(0, 2)} ${rest.slice(2)}`;
	if (rest.length === 7) return `${rest.slice(0, 3)} ${rest.slice(3)}`;
	if (rest.length === 8) return `${rest.slice(0, 4)} ${rest.slice(4)}`;
	return `${rest.slice(0, 3)} ${groups(rest.slice(3))}`;
}

/**
 * Prints a Finnish E.164 number the way it is written in Finland, with its trunk prefix
 * (`+35893105015` → `09 310 5015`, `+358401234567` → `040 123 4567`, `+35864384844` →
 * `06 438 4844`, `+358295000000` → `0295 000 000`). Numbers of another country are returned
 * unchanged.
 */
export function formatPhoneFi(e164: string): string {
	if (!e164.startsWith("+358")) return e164;
	const national = e164.slice(4);
	if (!/^\d{5,12}$/.test(national)) return e164;
	const length = prefixLength(national);
	return `0${national.slice(0, length)} ${groups(national.slice(length))}`;
}

/** A Finnish postcode: five digits (`00100`, `33100`, `22100`). */
export const FI_POSTCODE = /^\d{5}$/;

/**
 * A postcode as published (`33100`, ` 33 100 `, `FI-33100`) in its written form, five digits;
 * null when it is not a Finnish postcode.
 */
export function normalizeFiPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").replace(/^FI-?/i, "");
	return FI_POSTCODE.test(compact) ? compact : null;
}
