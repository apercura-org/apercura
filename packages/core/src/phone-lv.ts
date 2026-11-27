/**
 * Latvian phone numbers (`+371`) and postcodes: normalization and display in the
 * national forms. Pure functions, no I/O.
 *
 * Numbering (Electronic Communications Office, numbering plan): eight digits, no
 * trunk prefix, `+371` before them in international form; the first digit is 2
 * (mobile), 6 (fixed lines), 8 (toll-free, `80…`) or 9 (premium rate, `90…`).
 * Postcodes (pasta indekss): `LV-` and four digits (`LV-1050`).
 */

/**
 * Converts a Latvian number as published (`+37167123456`, `+371 67 123 456`,
 * `00371 67123456`, `67123456`, `371 2912 3456`) to E.164 (`+37167123456`). Returns
 * null when it is not a plausible Latvian number: eight digits starting with 2, 6, 8 or
 * 9. A list of numbers (`67123456, 29123456`, `67123456; 29123456`) gives its first one.
 * Numbers of another country keep their international form.
 */
export function toE164Lv(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| vai /)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+371")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00371")) {
		digits = digits.slice(5);
	} else if (digits.length === 11 && digits.startsWith("371")) {
		digits = digits.slice(3);
	}
	return /^[2689]\d{7}$/.test(digits) ? `+371${digits}` : null;
}

/**
 * Prints a Latvian E.164 number the way it is written in Latvia, in groups of two, three
 * and three digits (`67 123 456`, `29 123 456`). Numbers of another country are returned
 * unchanged.
 */
export function formatPhoneLv(e164: string): string {
	if (!e164.startsWith("+371")) return e164;
	const national = e164.slice(4);
	if (!/^\d{8}$/.test(national)) return e164;
	return `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** A Latvian postcode in its written form (`LV-1050`, `LV-4601`). */
export const LV_POSTCODE = /^LV-\d{4}$/;

/**
 * A postcode as published (`LV-1050`, `lv 1050`, `1050`) in its written form (`LV-1050`);
 * null when it is not a Latvian postcode (four digits, the first 1 to 5).
 */
export function normalizeLvPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").toUpperCase().replace(/^LV-?/, "");
	if (!/^[1-5]\d{3}$/.test(compact)) return null;
	return `LV-${compact}`;
}
