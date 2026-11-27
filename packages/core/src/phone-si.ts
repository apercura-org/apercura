/**
 * Slovenian phone numbers (`+386`) and postcodes: normalization and display in the national
 * forms. Pure functions, no I/O.
 *
 * Numbering (AKOS, the national numbering plan): a trunk `0`, then eight digits. Geographic
 * numbers have a one-digit area code (1 Ljubljana, 2 Maribor, 3 Celje, 4 Kranj, 5 Koper and
 * Nova Gorica, 7 Novo mesto) and seven digits, written `01 234 56 78`; mobile and other
 * non-geographic numbers a two-digit code (`30`, `31`, `40`, `41`, `51`, `59`, `64`–`71`) and six
 * digits, written `041 123 456`. Freephone and premium numbers (`080`, `090`) have four to six
 * digits after their code (`080 1234`). Postcodes: four digits, the first 1 to 9
 * (`1000 Ljubljana`, `3211 Škofja vas`).
 */

/** Mobile and other non-geographic codes and their six digits. */
const NON_GEOGRAPHIC = /^(?:3[01]|4[01]|51|59|6[4-9]|7[01])\d{6}$/;

/**
 * Converts a Slovenian number as published (`01 30 77 300`, `+386 1 307 73 00`,
 * `00386 41 123 456`, `041/123-456`) to E.164 (`+38613077300`). Returns null when it is not a
 * plausible Slovenian number. A list of numbers (`01 234 56 78, 041 123 456`) gives its first
 * one; numbers of another country keep their international form.
 */
export function toE164Si(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;]| ali /)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+386")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4).replace(/^0/, "");
	} else if (digits.startsWith("00386")) {
		digits = digits.slice(5).replace(/^0/, "");
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	if (/^[1-57]\d{7}$/.test(digits) || NON_GEOGRAPHIC.test(digits)) return `+386${digits}`;
	return /^(?:80|90)\d{4,6}$/.test(digits) ? `+386${digits}` : null;
}

/**
 * Prints a Slovenian E.164 number the way it is written in Slovenia: `01 234 56 78` for a
 * geographic number, `041 123 456` for a mobile one, `080 1234` for a freephone one. Numbers of
 * another country are returned unchanged.
 */
export function formatPhoneSi(e164: string): string {
	if (!e164.startsWith("+386")) return e164;
	const national = e164.slice(4);
	if (/^[1-57]\d{7}$/.test(national) && !NON_GEOGRAPHIC.test(national)) {
		return `0${national.slice(0, 1)} ${national.slice(1, 4)} ${national.slice(4, 6)} ${national.slice(6)}`;
	}
	if (/^\d{8}$/.test(national)) {
		return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
	}
	if (/^(?:80|90)\d{4,6}$/.test(national)) return `0${national.slice(0, 2)} ${national.slice(2)}`;
	return e164;
}

/** A Slovenian postcode (`1000`, `3211`). */
export const SI_POSTCODE = /^[1-9]\d{3}$/;

/** A postcode as published (`1000`, `SI-1000`, `1000.0`) in its written form, or null. */
export function normalizeSiPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw
		.trim()
		.replace(/^SI\s*-\s*/i, "")
		.replace(/\.0$/, "");
	return SI_POSTCODE.test(compact) ? compact : null;
}
