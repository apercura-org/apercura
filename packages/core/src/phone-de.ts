/**
 * German phone numbers (`+49`) and postcodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (Bundesnetzagentur, Nummernplan): a trunk prefix `0`, an area code
 * (Ortsnetzkennzahl) of two to five digits, then the subscriber number; area codes are
 * prefix-free. Berlin (30), Hamburg (40), Frankfurt am Main (69) and München (89) have two
 * digits, the larger cities three, everywhere else four, and only the eastern `03` zone has
 * five. Mobile numbers start with 15, 16 or 17. Postcodes (Postleitzahl): five digits, `01067`
 * to `99998`.
 */

/** Two-digit area codes. */
const TWO_DIGIT = ["30", "40", "69", "89"];

/**
 * Three-digit area codes: the pattern `[2-9]d1` of the old main cities (`221` Köln, `711`
 * Stuttgart) and the cities numbered otherwise (`228` Bonn, `234` Bochum, `335` Frankfurt
 * (Oder), `340` Dessau…).
 */
const THREE_DIGIT_EXTRA = [
	"202",
	"203",
	"208",
	"209",
	"212",
	"214",
	"228",
	"234",
	"335",
	"340",
	"345",
	"355",
	"365",
	"375",
	"385",
	"395",
];

/** Mobile network prefixes printed apart: 015x (four digits), 016x and 017x (three). */
function mobilePrefix(national: string): number {
	if (/^15\d/.test(national)) return 4;
	if (/^1[67]\d/.test(national)) return 3;
	return 0;
}

/**
 * The length of the area code of a national number (without its trunk 0), or 0 when it cannot
 * be told without the full list of area codes (a number of the `03` zone that is not one of its
 * three-digit cities: four or five digits).
 */
function areaCodeLength(national: string): number {
	const mobile = mobilePrefix(national);
	if (mobile) return mobile;
	if (/^(?:800|180|900|700)/.test(national)) return 3;
	if (TWO_DIGIT.some((code) => national.startsWith(code))) return 2;
	const three = national.slice(0, 3);
	if (/^[2-9]\d1$/.test(three) || THREE_DIGIT_EXTRA.includes(three)) return 3;
	if (national.startsWith("3")) return 0;
	return 4;
}

/**
 * Converts a German number as published (`0461 812-0`, `040 1818-850`, `+49 (0)30 4505-0`,
 * `0049 89 12345`, `(0351) 458-0`) to E.164 (`+494618120`). Returns null when it is not a
 * plausible German number: no trunk 0 or international prefix, or fewer than 6 or more than 13
 * digits after `+49`. A list of numbers (`0461 812-0, 0461 812-1`) gives its first one.
 * Numbers of another country keep their international form.
 */
export function toE164De(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// `0461 / 812-0` is one number written the old way (area code, slash, subscriber).
	const first = raw.split(/[,;]| oder | und /i)[0] ?? "";
	let digits = first.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+49")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0049")) {
		digits = digits.slice(4);
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	return /^[1-9]\d{5,12}$/.test(digits) ? `+49${digits}` : null;
}

/**
 * Prints a German E.164 number the way it is written in Germany (DIN 5008): the area code with
 * its trunk 0, a space, the subscriber number (`+494618120` → `0461 8120`, `+493045050` →
 * `030 45050`, `+4915112345678` → `01511 2345678`). A number whose area code cannot be told
 * (`03…` zone, four or five digits) is printed without the space rather than with a guessed one;
 * numbers of another country are returned unchanged.
 */
export function formatPhoneDe(e164: string): string {
	if (!e164.startsWith("+49")) return e164;
	const national = e164.slice(3);
	if (!/^\d+$/.test(national)) return e164;
	const length = areaCodeLength(national);
	if (!length || national.length <= length) return `0${national}`;
	return `0${national.slice(0, length)} ${national.slice(length)}`;
}

/** A German postcode: five digits, `01001` to `99998`. */
export const DE_POSTCODE = /^(?!00)\d{5}$/;

/**
 * A postcode as published (`24939`, ` 1067 `, `D-01067`) in its written form, five digits; null
 * when it is not a German postcode. A four-digit code lost its leading zero in a spreadsheet
 * and gets it back.
 */
export function normalizeDePostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let compact = raw.replace(/\s+/g, "").replace(/^D-?/i, "");
	if (/^\d{4}$/.test(compact)) compact = `0${compact}`;
	return DE_POSTCODE.test(compact) ? compact : null;
}
