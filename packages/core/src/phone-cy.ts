/**
 * Cypriot phone numbers (`+357`) and postcodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (the Office of the Commissioner of Electronic Communications and Postal Regulation,
 * the national numbering plan): no trunk prefix; eight digits for every subscriber number, fixed
 * lines starting with `2` (an area code of two digits: `22` Nicosia, `25` Limassol, `24` Larnaca,
 * `26` Paphos, `23` Famagusta), mobile numbers with `9` (`99 123456`), shared-cost numbers with
 * `77`, free numbers with `800` and premium ones with `90`. Postcodes (ταχυδρομικοί κώδικες, set by
 * Cyprus Post): four digits, the first naming the district (`1010` Nicosia, `3011` Limassol).
 */

/**
 * Converts a Cypriot number as published (`22603000`, `22 603000`, `+357 22 603000`,
 * `00357 99123456`) to E.164 (`+35722603000`). Returns null when it is not a plausible Cypriot
 * subscriber number: eight digits starting with 2, 7, 8 or 9. A list of numbers (`22347780;
 * 22347188`) gives its first one. Numbers of another country keep their international form.
 */
export function toE164Cy(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| ή /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+357")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00357")) {
		digits = digits.slice(5);
	} else if (digits.length === 11 && digits.startsWith("357")) {
		digits = digits.slice(3);
	}
	return /^[2789]\d{7}$/.test(digits) ? `+357${digits}` : null;
}

/** True when an E.164 number is a Cypriot mobile one (`+3579…`): a person's more often than not. */
export function isCyMobile(e164: string): boolean {
	return /^\+3579\d{7}$/.test(e164);
}

/**
 * Prints a Cypriot E.164 number the way it is written in Cyprus: the area code or the mobile
 * prefix, then six digits (`+35722603000` → `22 603000`, `+35799123456` → `99 123456`); a free
 * number as `800 12345`. Numbers of another country are returned unchanged.
 */
export function formatPhoneCy(e164: string): string {
	if (!e164.startsWith("+357")) return e164;
	const national = e164.slice(4);
	if (!/^\d{8}$/.test(national)) return e164;
	if (national.startsWith("800")) return `${national.slice(0, 3)} ${national.slice(3)}`;
	return `${national.slice(0, 2)} ${national.slice(2)}`;
}

/** A Cypriot postcode: four digits, the first from 1 to 9 (`1010`, `3011`, `8020`). */
export const CY_POSTCODE = /^[1-9]\d{3}$/;

/**
 * A postcode as published (`1010`, ` 30 11 `, `CY-3011`, `Τ.Κ. 3011`) in its written form, four
 * digits; null when it is not a Cypriot postcode.
 */
export function normalizeCyPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw
		.replace(/\s+/g, "")
		.replace(/^(?:CY-?|Τ\.?Κ\.?)/i, "")
		.trim();
	return CY_POSTCODE.test(compact) ? compact : null;
}
