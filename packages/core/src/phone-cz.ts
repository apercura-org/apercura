/**
 * Czech phone numbers (`+420`) and postcodes: normalization and display in the
 * national forms. Pure functions, no I/O.
 *
 * Numbering (Czech Telecommunication Office, numbering plan): nine digits, no
 * trunk prefix, `+420` before them in international form; the first digit is 2
 * to 9 (2 to 5 geographic, 6 and 7 mobile, 8 and 9 non-geographic). Postcodes
 * (PSČ): five digits, written with a space after the third (`110 00`).
 */

/**
 * Converts a Czech number as published (`+420326357125`, `+420 326 357 125`,
 * `00420 326 357 125`, `326357125`) to E.164 (`+420326357125`). Returns null when
 * it is not a plausible Czech number: nine digits starting with 2 to 9. A list of
 * numbers (`326357125, 603422530`, `604123456/604123457`) gives its first one.
 * Numbers of another country keep their international form.
 */
export function toE164Cz(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| nebo /)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+420")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00420")) {
		digits = digits.slice(5);
	} else if (digits.length === 12 && digits.startsWith("420")) {
		digits = digits.slice(3);
	}
	return /^[2-9]\d{8}$/.test(digits) ? `+420${digits}` : null;
}

/**
 * Prints a Czech E.164 number the way it is written in Czechia, in three groups
 * of three digits (`326 357 125`). Numbers of another country are returned
 * unchanged.
 */
export function formatPhoneCz(e164: string): string {
	if (!e164.startsWith("+420")) return e164;
	const national = e164.slice(4);
	if (!/^\d{9}$/.test(national)) return e164;
	return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** A Czech postcode with its space (`110 00`, `407 21`). */
export const CZ_POSTCODE = /^[1-7]\d{2} \d{2}$/;

/**
 * A postcode as published (`40721`, `407 21`) in its written form, with a space
 * after the third digit; null when it is not a Czech postcode (five digits, the
 * first 1 to 7).
 */
export function normalizeCzPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "");
	if (!/^[1-7]\d{4}$/.test(compact)) return null;
	return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}
