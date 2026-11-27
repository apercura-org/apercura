/**
 * Irish phone numbers (`+353`) and Eircodes: normalization and display in the national form.
 * Pure functions, no I/O.
 *
 * Numbering (ComReg's National Numbering Conventions): a national number is the trunk prefix
 * `0` and seven to nine digits, the `0` dropped after `+353`. Geographic numbers have an area
 * code of one to three digits after the `0` (`01` Dublin, `021` Cork, `091` Galway, `0404`
 * Wicklow), mobiles begin with `08` (`083`–`089`), and the service numbers (`1800` freephone,
 * `0818` and `076` universal access) are written apart. The lists Apercura reads print numbers
 * in that national form (`071 967 0111`, `01 846 2115`, `045 880 400`).
 *
 * Eircodes (the postcodes since 2015): a three-character routing key (a letter and two digits,
 * or `D6W`) and a four-character unique identifier, written with one space (`D02 X285`). An
 * Eircode is printed as part of a published address; it never locates a facility, because the
 * Eircode database and its coordinates are licensed, not open data.
 */

/** A national number after the trunk `0`: seven to nine digits, never starting with `0`. */
const NATIONAL = /^[1-9]\d{6,8}$/;

/** Area codes of three digits after the trunk `0` (`0404` Wicklow, `0504` Thurles). */
const FOUR_DIGIT_AREAS = /^(?:402|404|504|505)/;

/**
 * Converts an Irish number as published (`071 967 0111`, `+353 (0)1 846 2115`,
 * `00353 86 215 1054`, `(01) 846-2115`) to E.164 (`+35318462115`). Returns null when it is not
 * a plausible Irish number. A list of numbers (`071 967 0111 / 071 967 0112`, `01 846 2115,
 * 086 215 1054`) gives its first one. Numbers of another country keep their international form.
 * The freephone and universal-access numbers (`1800 …`, `1850 …`), dialled without a trunk
 * prefix, are kept in their national form after `+353`.
 */
export function toE164Ie(raw: string | null | undefined): string | null {
	if (!raw) return null;
	// The first number of a list, split on separators that never occur inside one.
	const first = raw.split(/[,;]| \/ | or | - /i)[0] ?? "";
	// `+353 (0)1 …`: the bracketed trunk prefix is not dialled from abroad.
	let digits = first.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+353")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(4);
	} else if (digits.startsWith("00353")) {
		digits = digits.slice(5);
	} else if (/^1[58]\d{2}/.test(digits) && digits.length === 10) {
		// 1800 / 1850 / 1890 numbers have no trunk prefix.
		return `+353${digits}`;
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else {
		return null;
	}
	if (digits.startsWith("0")) digits = digits.slice(1);
	if (/^1[58]\d{8}$/.test(digits)) return `+353${digits}`;
	return NATIONAL.test(digits) ? `+353${digits}` : null;
}

/**
 * Prints an Irish E.164 number the way it is written in Ireland: the trunk `0` and the area or
 * mobile code, then the subscriber number in groups (`01 846 2115`, `021 490 1000`,
 * `086 215 1054`, `045 880 400`, `0404 67108`), a freephone number after its prefix
 * (`1800 123 456`). Numbers of another country are returned unchanged.
 */
export function formatPhoneIe(e164: string): string {
	if (!e164.startsWith("+353")) return e164;
	const national = e164.slice(4);
	if (/^1[58]\d{8}$/.test(national)) {
		return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
	}
	if (!NATIONAL.test(national)) return e164;
	// Dublin: `01` and seven digits.
	if (national.startsWith("1")) return `01 ${national.slice(1, 4)} ${national.slice(4)}`;
	if (FOUR_DIGIT_AREAS.test(national) && national.length === 8) {
		return `0${national.slice(0, 3)} ${national.slice(3)}`;
	}
	const area = national.slice(0, 2);
	const rest = national.slice(2);
	if (rest.length === 7) return `0${area} ${rest.slice(0, 3)} ${rest.slice(3)}`;
	if (rest.length === 6) return `0${area} ${rest.slice(0, 3)} ${rest.slice(3)}`;
	return `0${area} ${rest}`;
}

/** An Eircode with its single space (`D02 X285`, `D6W 1234`, `F52 AX24`). */
export const IE_EIRCODE = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W) [0-9AC-FHKNPRTV-Y]{4}$/;

/**
 * An Eircode as published (`d02x285`, `F52  AX24`, `H12T996` is not one: too short) in its
 * written form, uppercase with one space after the routing key; null when it is not an Eircode.
 */
export function normalizeEircode(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	if (compact.length !== 7) return null;
	const eircode = `${compact.slice(0, 3)} ${compact.slice(3)}`;
	return IE_EIRCODE.test(eircode) ? eircode : null;
}

/** The Eircode inside a line of an address (`Old Hospital Road, Y35 HK84`), or null. */
export function findEircode(line: string | null | undefined): string | null {
	if (!line) return null;
	const match = /\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W))\s?([0-9AC-FHKNPRTV-Y]{4})\b/i.exec(
		line.toUpperCase(),
	);
	return match ? normalizeEircode(`${match[1]}${match[2]}`) : null;
}
