/**
 * Austrian phone numbers (`+43`): normalization to E.164 and display in the
 * national form. Pure functions, no I/O.
 */

/**
 * Area codes ("Ortsnetzkennzahlen") and service prefixes printed apart from the
 * subscriber number, longest first when one is the prefix of another. Vienna
 * (1), the mobile networks (650–699), the location-independent and service
 * numbers (720, 780, 800, 810, 820, 821, 900, 901, 930, 931) and the cities
 * whose code the directory prints most; any other number is printed without
 * a break after its leading 0 rather than with a guessed one.
 */
const AREA_CODES: readonly string[] = [
	...Array.from({ length: 50 }, (_, index) => String(650 + index)),
	"720",
	"780",
	"800",
	"810",
	"820",
	"821",
	"900",
	"901",
	"930",
	"931",
	"316", // Graz
	"662", // Salzburg
	"732", // Linz
	"512", // Innsbruck
	"463", // Klagenfurt
	"2622", // Wiener Neustadt
	"2742", // St. Pölten
	"3842", // Leoben
	"3862", // Bruck an der Mur
	"3172", // Weiz
	"3452", // Leibnitz
	"3332", // Hartberg
	"3462", // Deutschlandsberg
	"3612", // Liezen
	"3852", // Mürzzuschlag
	"3142", // Voitsberg
	"3152", // Feldbach
	"3512", // Knittelfeld
	"3532", // Murau
	"3572", // Judenburg
	"3382", // Fürstenfeld
	"3124", // Gratkorn
	"2236", // Mödling
	"2252", // Baden
	"1",
];

/**
 * Converts an Austrian number as published (`01 7673315`, `+43 1 7673315`,
 * `0043 664 1234567`, `0677 62795797`) to E.164 (`+4317673315`). A number
 * without its leading 0 (`7673315`) takes `localAreaCode`, the area code of
 * the source when it only lists numbers of one city (Vienna: `1`), and is
 * refused without one. Returns null when the value is not a plausible
 * Austrian number: 4 to 13 digits after `+43`, never starting with 0.
 */
export function toE164At(
	raw: string | null | undefined,
	options: { localAreaCode?: string } = {},
): string | null {
	if (!raw) return null;
	let digits = raw.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		if (!digits.startsWith("+43")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
		digits = digits.slice(3);
	} else if (digits.startsWith("0043")) {
		digits = digits.slice(4);
	} else if (digits.startsWith("0")) {
		digits = digits.slice(1);
	} else if (options.localAreaCode) {
		digits = `${options.localAreaCode}${digits}`;
	} else {
		return null;
	}
	return /^[1-9]\d{3,12}$/.test(digits) ? `+43${digits}` : null;
}

/**
 * Prints an Austrian E.164 number the way it is written in Austria: the area
 * code with its leading 0, a space, the subscriber number (`+4317673315` ->
 * `01 7673315`, `+436641458428` -> `0664 1458428`, `+43316123456` ->
 * `0316 123456`). Unknown area codes are printed without the space; other
 * countries' numbers are returned unchanged.
 */
export function formatPhoneAt(e164: string): string {
	if (!e164.startsWith("+43")) return e164;
	const national = e164.slice(3);
	if (!/^\d+$/.test(national)) return e164;
	const code = AREA_CODES.filter((prefix) => national.startsWith(prefix)).sort(
		(a, b) => b.length - a.length,
	)[0];
	if (!code || national.length <= code.length) return `0${national}`;
	return `0${code} ${national.slice(code.length)}`;
}
