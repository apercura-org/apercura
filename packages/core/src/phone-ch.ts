/**
 * Swiss phone numbers (`+41`) and postcodes: normalization and display in the
 * national form. Pure functions, no I/O.
 *
 * Numbering (OFCOM's numbering plan, Verordnung über die Adressierungselemente im
 * Fernmeldebereich): a national number is the trunk prefix `0` and nine digits, the
 * `0` dropped after `+41`. Geographic numbers have a two-digit area code (`044`
 * Zürich, `022` Geneva, `091` Ticino), mobiles begin with `07`, and the service
 * numbers (`0800` free, `084x` shared cost, `090x` premium) have a three-digit
 * prefix. Postcodes: four digits, from `1000`.
 */

/** A national number after the trunk `0`: nine digits, never starting with `0`. */
const NATIONAL = /^[1-9]\d{8}$/;

/** Service numbers, printed after their three-digit prefix (`0800 123 456`). */
const SERVICE = /^(?:800|84[0-9]|90[0-9])/;

/**
 * Converts a Swiss number as published (`044 268 31 11`, `+41 44 268 31 11`,
 * `0041 (0)44 268 31 11`, `044/268.31.11`) to E.164 (`+41442683111`). Returns null when
 * it is not a plausible Swiss number. A list of numbers (`044 268 31 11 / 044 268 31 12`,
 * `044 268 31 11; 079 123 45 67`) gives its first one. Numbers of another country keep
 * their international form.
 */
export function toE164Ch(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// The first number of a list, split on separators that never occur inside one.
	const first = raw.split(/[,;]| \/ | - | oder | ou | o /i)[0] ?? "";
	// `+41 (0)44 …`: the bracketed trunk prefix is not dialled from abroad.
	let digits = first.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+41")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0041")) {
		digits = digits.slice(4);
	} else if (digits.startsWith("41") && digits.length === 11) {
		digits = digits.slice(2);
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	if (digits.startsWith("0")) digits = digits.slice(1);
	return NATIONAL.test(digits) ? `+41${digits}` : null;
}

/**
 * Prints a Swiss E.164 number the way it is written in Switzerland: the trunk `0`, the
 * area or mobile code and the rest in groups of three, two and two (`044 268 31 11`,
 * `079 123 45 67`), a service number after its prefix (`0800 123 456`). Numbers of
 * another country are returned unchanged.
 */
export function formatPhoneCh(e164: string): string {
	if (!e164.startsWith("+41")) return e164;
	const national = e164.slice(3);
	if (!NATIONAL.test(national)) return e164;
	if (SERVICE.test(national)) {
		return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
	}
	return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7)}`;
}

/** A Swiss postcode (PLZ, NPA, NPA): four digits, from 1000 (`8001`, `1204`, `6900`). */
export const CH_POSTCODE = /^[1-9]\d{3}$/;

/**
 * A postcode as published (`8001`, ` 1204 `, `CH-8001`, `8001 Zürich`) in its written form;
 * null when it is not a Swiss postcode. Liechtenstein's postcodes (`9485`–`9498`), which the
 * Swiss post also serves, are not Swiss: null.
 */
export function normalizeChPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const match = /^\s*(?:CH\s*-\s*)?([1-9]\d{3})(?:\s|$)/i.exec(raw);
	const code = match?.[1];
	if (!code) return null;
	const value = Number(code);
	return value >= 9485 && value <= 9498 ? null : code;
}
