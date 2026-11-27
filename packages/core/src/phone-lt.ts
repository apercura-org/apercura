/**
 * Lithuanian phone numbers (`+370`) and postcodes: normalization and display in the
 * national forms. Pure functions, no I/O.
 *
 * Numbering (the Communications Regulatory Authority's national numbering plan): eight
 * digits after `+370`; dialled at home with the trunk prefix `8` (`8 5 212 3456`). Fixed
 * lines begin with an area code: `5` Vilnius, two digits for Kaunas (`37`), Šiauliai (`41`),
 * Panevėžys (`45`) and Klaipėda (`46`), three digits elsewhere (`315` Alytus, `319` Birštonas);
 * mobile numbers begin with `6`, toll-free and premium ones with `8` and `9`. Postcodes:
 * five digits after `LT-` (`LT-01100`).
 */

/** The two-digit area codes; Vilnius has one digit (`5`), every other area three. */
const TWO_DIGIT_AREAS: ReadonlySet<string> = new Set(["37", "41", "45", "46"]);

/**
 * Converts a Lithuanian number as published (`+370 5 212 3456`, `8 5 212 3456`,
 * `(8 5) 212 3456`, `00370 612 34567`, `61234567`) to E.164 (`+37052123456`). Returns null
 * when it is not a plausible Lithuanian number: eight digits, the first 3 to 9. A list of
 * numbers (`8 5 212 3456, 8 612 34567`) gives its first one. Numbers of another country keep
 * their international form.
 */
export function toE164Lt(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| arba /)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+370")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00370")) {
		digits = digits.slice(5);
	} else if (digits.length === 11 && digits.startsWith("370")) {
		digits = digits.slice(3);
	} else if (digits.length === 9 && digits.startsWith("8")) {
		// The trunk prefix dialled inside Lithuania.
		digits = digits.slice(1);
	}
	return /^[3-9]\d{7}$/.test(digits) ? `+370${digits}` : null;
}

/**
 * Prints a Lithuanian E.164 number the way it is written in Lithuania, in its international
 * form with the area code apart: `+370 5 212 3456` (Vilnius), `+370 37 123 456` (Kaunas),
 * `+370 315 12345` (Alytus), `+370 612 34567` (a mobile), `+370 800 12345`. Numbers of
 * another country are returned unchanged.
 */
export function formatPhoneLt(e164: string): string {
	if (!e164.startsWith("+370")) return e164;
	const national = e164.slice(4);
	if (!/^\d{8}$/.test(national)) return e164;
	if (national.startsWith("5")) {
		return `+370 5 ${national.slice(1, 4)} ${national.slice(4)}`;
	}
	if (TWO_DIGIT_AREAS.has(national.slice(0, 2))) {
		return `+370 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
	}
	return `+370 ${national.slice(0, 3)} ${national.slice(3)}`;
}

/** A Lithuanian postcode in its written form (`LT-01100`). */
export const LT_POSTCODE = /^LT-\d{5}$/;

/**
 * A postcode as published (`LT-01100`, `LT 01100`, `01100`) in its written form, `LT-` and
 * five digits; null when it is not a Lithuanian postcode.
 */
export function normalizeLtPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").toUpperCase().replace(/^LT-?/, "");
	if (!/^\d{5}$/.test(compact)) return null;
	return `LT-${compact}`;
}
