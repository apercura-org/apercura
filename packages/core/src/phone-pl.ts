/**
 * Polish phone numbers (`+48`) and postcodes: normalization and display in the national forms.
 * Pure functions, no I/O.
 *
 * Numbering (Urząd Komunikacji Elektronicznej, Plan numeracji krajowej): closed numbering of
 * nine digits, no trunk prefix since 2005, `+48` before them in international form. A fixed line
 * starts with a two-digit area code (`12` Kraków, `22` Warszawa, `71` Wrocław) and is written in
 * groups `12 345 67 89`; a mobile number starts with a mobile prefix (`45`, `50`, `51`, `53`,
 * `57`, `60`, `66`, `69`, `72`, `73`, `78`, `79`, `88`) and is written `512 345 678`, like the
 * non-geographic numbers (`800`, `801`…). Registers still print the former trunk `0` before an
 * area code (`071 338-00-78`), slashes and hyphens (`74/8680242`, `76 856-14-37`), and several
 * numbers in one field. Postcodes (kod pocztowy): five digits written `NN-NNN` (`59-220`).
 */

/** Mobile prefixes of the numbering plan: their numbers are printed in groups of three. */
const MOBILE = /^(?:45|50|51|53|57|60|66|69|72|73|78|79|88)/;

/** Non-geographic prefixes (freephone, shared cost, premium rate), printed like mobiles. */
const NON_GEOGRAPHIC = /^(?:70|80|39)/;

/**
 * Converts a Polish number as published (`+48 74 868 02 42`, `0048748680242`, `74/8680242`,
 * `071 338-00-78`, `509-308-757`) to E.164 (`+48748680242`). Returns null when it is not a
 * plausible Polish number: nine digits, the first 1 to 9. A list of numbers (`74 86-81-513, 74
 * 8680 242`, `74/8681513 74/8680242`) gives its first one. Numbers of another country keep
 * their international form.
 */
export function toE164Pl(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// Several numbers: split on commas, semicolons, " lub ", " i ", or two numbers side by side.
	const first = raw.split(/[,;]| lub | i | albo |\bwew\.?|\bfax\b/i)[0] ?? "";
	let digits = first.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+48")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0048")) {
		digits = digits.slice(4);
	} else if (digits.length === 11 && digits.startsWith("48")) {
		digits = digits.slice(2);
	} else if (digits.length === 10 && digits.startsWith("0")) {
		// The former trunk prefix before an area code (`071 338-00-78`).
		digits = digits.slice(1);
	} else if (digits.length === 18 || digits.length === 20) {
		// Two numbers written side by side without a separator (`74/8681513 74/8680242`).
		const half = digits.length / 2;
		digits = digits.slice(0, half).replace(/^0(?=\d{9}$)/, "");
	}
	return /^[1-9]\d{8}$/.test(digits) ? `+48${digits}` : null;
}

/**
 * Prints a Polish E.164 number the way it is written in Poland: a mobile or non-geographic one
 * in three groups of three digits (`512 345 678`, `800 100 100`), a fixed line with its area
 * code apart (`74 868 02 42`). Numbers of another country are returned unchanged.
 */
export function formatPhonePl(e164: string): string {
	if (!e164.startsWith("+48")) return e164;
	const national = e164.slice(3);
	if (!/^\d{9}$/.test(national)) return e164;
	if (MOBILE.test(national) || NON_GEOGRAPHIC.test(national)) {
		return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
	}
	return `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5, 7)} ${national.slice(7)}`;
}

/** A Polish postcode in its written form (`59-220`, `00-001`). */
export const PL_POSTCODE = /^\d{2}-\d{3}$/;

/**
 * A postcode as published (`59-220`, `59220`, `59 - 220`) in its written form; null when it is
 * not five digits.
 */
export function normalizePlPostcode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.replace(/[\s-]+/g, "");
	if (!/^\d{5}$/.test(compact)) return null;
	return `${compact.slice(0, 2)}-${compact.slice(2)}`;
}
