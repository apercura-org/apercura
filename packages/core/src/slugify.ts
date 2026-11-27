const LIGATURES: Record<string, string> = {
	œ: "oe",
	Œ: "oe",
	æ: "ae",
	Æ: "ae",
	ß: "ss",
};

/**
 * Turns free text (names, cities, specialties) into a URL-safe slug:
 * lowercase ASCII letters and digits separated by single dashes.
 *
 * - French diacritics are stripped (`é` -> `e`, `ç` -> `c`).
 * - Ligatures are expanded (`œ` -> `oe`, `æ` -> `ae`).
 * - Apostrophes, spaces and any other separator become `-`.
 * - Repeated dashes are collapsed and leading/trailing dashes removed.
 */
export function slugify(text: string): string {
	return text
		.replace(/[œŒæÆß]/g, (char) => LIGATURES[char] ?? char)
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** German umlauts and ß, spelled out as German writes them without the letters. */
const GERMAN_LETTERS: Record<string, string> = {
	ä: "ae",
	Ä: "ae",
	ö: "oe",
	Ö: "oe",
	ü: "ue",
	Ü: "ue",
	ß: "ss",
	ẞ: "ss",
};

/**
 * {@link slugify} for German text: umlauts are spelled out (`ä` -> `ae`,
 * `Döbling` -> `doebling`, `Kärnten` -> `kaernten`) instead of losing their
 * dots, the way German URLs and street signs write them without the letters.
 */
export function slugifyDe(text: string): string {
	return slugify(text.replace(/[äÄöÖüÜßẞ]/g, (char) => GERMAN_LETTERS[char] ?? char));
}

/**
 * {@link slugify} for Polish text: `ł` has no decomposition and would be lost, so it is written
 * `l` first (`Łódź` -> `lodz`, `Białystok` -> `bialystok`), the way Polish URLs write it.
 */
export function slugifyPl(text: string): string {
	return slugify(text.replace(/[łŁ]/g, "l"));
}
