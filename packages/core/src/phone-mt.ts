/**
 * Maltese phone numbers (`+356`) and postcodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (the Malta Communications Authority's National Numbering Plan): a closed plan of
 * eight digits, dialled without a trunk prefix. Fixed lines begin with `2` (`21`, `22`, `23`,
 * `25`, `27`), mobiles with `7` or `9` (`79`, `77`, `99`), freephone with `800`. Written in two
 * groups of four (`2165 2226`, `7955 5536`), as the Medicines Authority's register and Maltese
 * directories print them.
 *
 * Postcodes (MaltaPost): three letters, a space and four digits (`BBG 2412`, `VLT 1111`), the
 * letters naming the locality.
 */

/** A Maltese number: eight digits, a fixed line (`2`), a mobile (`7`, `9`) or a service (`5`, `8`). */
const NATIONAL = /^[25789]\d{7}$/;

/**
 * Converts a Maltese number as published (`21652226`, `2123 4567`, `+356 2165 2226`,
 * `00356 79555536`) to E.164 (`+35621652226`). Returns null when it is not a plausible Maltese
 * number. A list of numbers (`21682251 / 79555536`, `21637615/ 79637615`, `21419070/1/2`) gives
 * its first one. Numbers of another country keep their international form.
 */
export function toE164Mt(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// The first number of a list: `/`, `,`, `;` and ` or ` never occur inside one.
	const first = raw.split(/[,;/]| or /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+356")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00356")) {
		digits = digits.slice(5);
	} else if (digits.startsWith("356") && digits.length === 11) {
		digits = digits.slice(3);
	}
	return NATIONAL.test(digits) ? `+356${digits}` : null;
}

/**
 * Prints a Maltese E.164 number the way Malta writes it: two groups of four digits
 * (`2165 2226`, `7955 5536`, `8007 2345`). Numbers of another country are returned unchanged.
 */
export function formatPhoneMt(e164: string): string {
	if (!e164.startsWith("+356")) return e164;
	const national = e164.slice(4);
	if (!NATIONAL.test(national)) return e164;
	return `${national.slice(0, 4)} ${national.slice(4)}`;
}

/** A Maltese postcode: three letters, a space, four digits (`BBG 2412`). */
export const MT_POSTCODE = /^[A-Z]{3} \d{4}$/;

/**
 * A postcode as published (`bbg2412`, `MST 2353`, `ŻRQ 1012`, its Maltese letters written
 * without their marks) in its written form, uppercase with one space; null when it is not one.
 */
export function normalizeMtPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.replace(/[ħĦ]/g, "H")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
	const match = /^([A-Z]{3})(\d{4})$/.exec(compact);
	return match ? `${match[1]} ${match[2]}` : null;
}
