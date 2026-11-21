/** First three digits of a French national significant number → overseas country code. */
const OVERSEAS_PREFIXES: ReadonlyMap<string, string> = new Map([
	// Guadeloupe, Saint-Barthélemy, Saint-Martin
	["590", "590"],
	["690", "590"],
	["691", "590"],
	// Martinique
	["596", "596"],
	["696", "596"],
	["697", "596"],
	// French Guiana
	["594", "594"],
	["694", "594"],
	// Réunion
	["262", "262"],
	["263", "262"],
	["692", "262"],
	["693", "262"],
	// Mayotte (shares +262 with Réunion)
	["269", "262"],
	["639", "262"],
]);

/** Country codes of the 10-digit French numbering plan: 9 digits after the code. */
const FRENCH_PLAN_CODES = ["33", "590", "596", "594", "262"] as const;

function fromFrenchNationalNumber(nsn: string): string {
	return `+${OVERSEAS_PREFIXES.get(nsn.slice(0, 3)) ?? "33"}${nsn}`;
}

function invalid(): never {
	throw new RangeError("Invalid phone number");
}

/**
 * Normalizes a phone number to E.164.
 *
 * - French national numbers (`06 12 34 56 78`, `0690 12 34 56`) get the right country code,
 *   overseas included: +590, +596, +594, +262 (Réunion and Mayotte).
 * - `00` becomes `+`, a `(0)` or trunk `0` after a French-plan code is dropped, and an overseas
 *   number written with +33 is moved to its own code, so one line always gives one value.
 * - Saint-Pierre-et-Miquelon (+508) has 6-digit numbers; other codes (including +269, Comoros)
 *   are kept as written, checked for 8 to 15 digits.
 *
 * @throws RangeError when the value is not a phone number.
 */
export function normalizePhone(value: string): string {
	let compact = value
		.trim()
		.replace(/\(0\)/g, "")
		.replace(/[\s.\-()/]/g, "");
	if (compact.startsWith("00")) {
		compact = `+${compact.slice(2)}`;
	}
	if (/^0[1-9]\d{8}$/.test(compact)) {
		return fromFrenchNationalNumber(compact.slice(1));
	}
	if (!/^\+[1-9]\d+$/.test(compact)) {
		invalid();
	}
	const digits = compact.slice(1);
	for (const code of FRENCH_PLAN_CODES) {
		if (digits.startsWith(code)) {
			const rest = digits.slice(code.length).replace(/^0(?=\d{9}$)/, "");
			if (!/^[1-9]\d{8}$/.test(rest)) {
				invalid();
			}
			return code === "33" ? fromFrenchNationalNumber(rest) : `+${code}${rest}`;
		}
	}
	if (digits.startsWith("508")) {
		const rest = digits.slice(3);
		return /^\d{6}$/.test(rest) ? `+508${rest}` : invalid();
	}
	return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : invalid();
}

/**
 * Normalizes an email address for blind indexing: Unicode NFC, trimmed, lowercased.
 *
 * @throws RangeError when the value does not look like an email address.
 */
export function normalizeEmail(value: string): string {
	const normalized = value.normalize("NFC").trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+$/.test(normalized)) {
		throw new RangeError("Invalid email address");
	}
	return normalized;
}
