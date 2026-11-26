/**
 * Italian phone numbers (`+39`) and postcodes: normalization and display in the
 * national forms. Pure functions, no I/O.
 *
 * Numbering (AGCOM's national numbering plan, delibera 8/15/CIR): no trunk prefix
 * to drop, the leading `0` of a fixed line is part of the number and stays after
 * `+39`. Fixed lines begin with `0` (area code of two to four digits: `06` Rome,
 * `02` Milan, `011` Turin, `0471` Bolzano), six to eleven digits in all; mobile
 * numbers begin with `3`, nine or ten digits; toll-free and shared-cost numbers
 * begin with `80` or `84`. Postcodes (CAP): five digits.
 */

/**
 * The area codes of two and three digits; every other fixed-line area code has four
 * (`0471`, `0583`). Two digits: Milan and Rome. Three: the large cities and their
 * districts (`011` Turin, `081` Naples, `091` Palermo…).
 */
const TWO_DIGIT_AREAS: ReadonlySet<string> = new Set(["02", "06"]);
const THREE_DIGIT_AREAS: ReadonlySet<string> = new Set([
	"010",
	"011",
	"015",
	"019",
	"030",
	"031",
	"035",
	"039",
	"040",
	"041",
	"045",
	"049",
	"050",
	"051",
	"055",
	"059",
	"070",
	"071",
	"075",
	"079",
	"080",
	"081",
	"085",
	"089",
	"090",
	"091",
	"095",
	"099",
]);

/** A national number: a fixed line (`0…`, 6 to 11 digits), a mobile (`3…`, 9 or 10), toll-free or shared cost (`80…`, `84…`). */
const NATIONAL = /^(?:0\d{5,10}|3\d{8,9}|8[04]\d{4,8})$/;

/**
 * Converts an Italian number as published (`06 1234 5678`, `+39 06 12345678`,
 * `0039 333 1234567`, `333/1234567`) to E.164 (`+390612345678`). Returns null when it
 * is not a plausible Italian number. A list of numbers (`0612345678 - 0612345679`,
 * `06 1234567; 06 7654321`, `06 1234567 o 06 7654321`) gives its first one. Numbers
 * of another country keep their international form.
 */
export function toE164It(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;]| - | o | oppure | e /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+39")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0039")) {
		digits = digits.slice(4);
	} else if (/^39[03]/.test(digits) && digits.length >= 11) {
		digits = digits.slice(2);
	}
	return NATIONAL.test(digits) ? `+39${digits}` : null;
}

/** The area code of a fixed line written nationally (`0612345678` → `06`). */
function areaCodeOf(national: string): string {
	if (TWO_DIGIT_AREAS.has(national.slice(0, 2))) return national.slice(0, 2);
	if (THREE_DIGIT_AREAS.has(national.slice(0, 3))) return national.slice(0, 3);
	return national.slice(0, 4);
}

/**
 * Prints an Italian E.164 number the way it is written in Italy: a fixed line as its
 * area code and the rest (`06 12345678`, `011 5612345`, `0471 123456`), a mobile in
 * three groups (`333 123 4567`), a toll-free number after its prefix (`800 123456`).
 * Numbers of another country are returned unchanged.
 */
export function formatPhoneIt(e164: string): string {
	if (!e164.startsWith("+39")) return e164;
	const national = e164.slice(3);
	if (!NATIONAL.test(national)) return e164;
	if (national.startsWith("0")) {
		const area = areaCodeOf(national);
		return `${area} ${national.slice(area.length)}`;
	}
	if (national.startsWith("3")) {
		return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
	}
	return `${national.slice(0, 3)} ${national.slice(3)}`;
}

/** An Italian postcode (CAP): five digits (`00184`, `20121`). */
export const IT_POSTCODE = /^\d{5}$/;

/**
 * A postcode as published (`184`, `00184`, ` 20121 `) in its written form, five
 * digits; null when it is not an Italian postcode (or the placeholder `00000`). A
 * code that lost its leading zeros in a spreadsheet gets them back.
 */
export function normalizeItPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "");
	if (!/^\d{3,5}$/.test(compact)) return null;
	const padded = compact.padStart(5, "0");
	return padded === "00000" ? null : padded;
}
