/**
 * Swedish phone numbers (`+46`) and postcodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (Post- och telestyrelsen, the national numbering plan): a trunk prefix `0`, area
 * codes of one to three digits after it (`08` Stockholm, `031` Göteborg, `0480` Kalmar), mobile
 * numbers under `07` (`070`, `072`, `073`, `076`, `079`), and national significant numbers of seven
 * to nine digits. Postcodes (postnummer, set by PostNord): five digits, written as three and two
 * (`111 22`).
 */

/** The two-digit area codes (written with the trunk prefix: `011`, `031`, `040`…). */
const TWO_DIGIT_AREAS = new Set([
	"11",
	"13",
	"16",
	"18",
	"19",
	"21",
	"23",
	"26",
	"31",
	"33",
	"35",
	"36",
	"40",
	"42",
	"44",
	"46",
	"54",
	"60",
	"63",
	"90",
]);

/**
 * Converts a Swedish number as published (`08-123 456 78`, `+46 8 123 456 78`, `0046 70 123 45
 * 67`, `070-123 45 67`) to E.164 (`+46812345678`). Returns null when it is not a plausible Swedish
 * number: seven to nine national digits after the trunk prefix, none starting with `0`. A list of
 * numbers (`08-123 456 78, 070-123 45 67`) gives its first one. Numbers of another country keep
 * their international form.
 */
export function toE164Se(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const first = raw.split(/[,;/]| eller /i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+46")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3).replace(/^0/, "");
	} else if (digits.startsWith("0046")) {
		digits = digits.slice(4).replace(/^0/, "");
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	return /^[1-9]\d{6,8}$/.test(digits) ? `+46${digits}` : null;
}

/** A subscriber number in the groups Swedish writes it (`123 456 78`, `12 34 56`, `123 45`). */
function groupSubscriber(number: string): string {
	switch (number.length) {
		case 5:
			return `${number.slice(0, 3)} ${number.slice(3)}`;
		case 6:
			return `${number.slice(0, 2)} ${number.slice(2, 4)} ${number.slice(4)}`;
		case 7:
			return `${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5)}`;
		case 8:
			return `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
		default:
			return number;
	}
}

/**
 * Prints a Swedish E.164 number the way it is written in Sweden: the area code with its trunk
 * prefix, a dash, then the subscriber number in groups (`+46812345678` → `08-123 456 78`,
 * `+46701234567` → `070-123 45 67`, `+4631123456` → `031-12 34 56`, `+46480123456` →
 * `0480-12 34 56`). Numbers of another country are returned unchanged.
 */
export function formatPhoneSe(e164: string): string {
	if (!e164.startsWith("+46")) return e164;
	const national = e164.slice(3);
	if (!/^[1-9]\d{6,8}$/.test(national)) return e164;
	let area: string;
	if (national.startsWith("8")) area = national.slice(0, 1);
	// A mobile number's prefix is two digits after the trunk prefix (`070`), like the two-digit
	// area codes (`031`); every other area code is three (`0480`).
	else if (national.startsWith("7") || TWO_DIGIT_AREAS.has(national.slice(0, 2))) {
		area = national.slice(0, 2);
	} else area = national.slice(0, 3);
	return `0${area}-${groupSubscriber(national.slice(area.length))}`;
}

/** A Swedish postcode in its written form: five digits, three and two (`111 22`, `413 45`). */
export const SE_POSTCODE = /^[1-9]\d{2} \d{2}$/;

/**
 * A postcode as published (`11122`, `111 22`, `SE-111 22`, `S-41345`) in its written form,
 * `111 22`; null when it is not a Swedish postcode.
 */
export function normalizeSePostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/\s+/g, "").replace(/^SE?-?/i, "");
	return /^[1-9]\d{4}$/.test(compact) ? `${compact.slice(0, 3)} ${compact.slice(3)}` : null;
}
