/**
 * Names, towns and keys of the Irish lists. A facility's name is kept as its list publishes it,
 * cleaned of typographic noise (stray spaces and trailing commas, text encoded twice) and, when
 * the whole name is written in capitals, cased. Towns are compared by a key that folds the ways
 * the lists write them (`St. Mary's`, `Saint Marys`, `Dublin 15`). Pure functions.
 */
import { slugify } from "@apercura/core";

/** Zero-width characters, soft hyphens and byte-order marks. */
const INVISIBLE = /[\u00ad\u200b-\u200d\ufeff]/g;

/** The bytes Windows-1252 gives the characters of 0x80–0x9F (UTF-8 read as that code page). */
const CP1252: Readonly<Record<string, number>> = {
	"€": 0x80,
	"‚": 0x82,
	ƒ: 0x83,
	"„": 0x84,
	"…": 0x85,
	"†": 0x86,
	"‡": 0x87,
	ˆ: 0x88,
	"‰": 0x89,
	Š: 0x8a,
	"‹": 0x8b,
	Œ: 0x8c,
	Ž: 0x8e,
	"‘": 0x91,
	"’": 0x92,
	"“": 0x93,
	"”": 0x94,
	"•": 0x95,
	"–": 0x96,
	"—": 0x97,
	"˜": 0x98,
	"™": 0x99,
	š: 0x9a,
	"›": 0x9b,
	œ: 0x9c,
	ž: 0x9e,
	Ÿ: 0x9f,
};

/** A lead byte of UTF-8 read as Windows-1252 (`Ã`, `Â`, `Ä`…), followed by a continuation. */
const MOJIBAKE =
	/[\u00c2-\u00f4][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/;

/** One round of repair: the text's characters as Windows-1252 bytes, read as UTF-8; null if not. */
function undoOnce(text: string): string | null {
	const bytes: number[] = [];
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code < 0x100) bytes.push(code);
		else if (CP1252[char] !== undefined) bytes.push(CP1252[char]);
		else return null;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
	} catch {
		return null;
	}
}

/**
 * Text that was encoded in UTF-8 and read back as Windows-1252 once or twice (`Ionad
 * SlÃƒÂ¡inte` for `Ionad Sláinte`), as the HSE's health centres layer has it: repaired while a
 * round reads as valid UTF-8; other text is returned unchanged.
 */
export function repairMojibake(text: string): string {
	let current = text;
	for (let round = 0; round < 3 && MOJIBAKE.test(current); round++) {
		const repaired = undoOnce(current);
		if (repaired === null || repaired === current) break;
		current = repaired;
	}
	return current;
}

/** A list's text as a page prints it: repaired, invisible characters dropped, spaces collapsed. */
export function cleanText(value: string | null | undefined): string {
	return repairMojibake(value ?? "")
		.replace(INVISIBLE, "")
		.replace(/[\u00a0\s]+/g, " ")
		.trim();
}

/** Text without a trailing comma, dash or semicolon (`Enniscorthy Health Centre, `). */
export function trimPunctuation(value: string): string {
	let text = value.trim();
	while (/[\s,;–-]$/.test(text)) text = text.slice(0, -1).trimEnd();
	while (/^[\s,;–-]/.test(text)) text = text.slice(1).trimStart();
	return text;
}

/** True when a text has letters and none of them is lower case (`ST JAMES'S PHARMACY`). */
export const isUpperCase = (value: string) => /\p{Lu}/u.test(value) && !/\p{Ll}/u.test(value);

/** Words a cased name keeps in lower case, except first. */
const SMALL_WORDS = new Set(["and", "of", "the", "on", "in", "at", "for", "na", "an", "le"]);

/**
 * A name written in capitals, cased (`MCCABES PHARMACY` → `Mccabes Pharmacy`, `O'BRIEN'S` →
 * `O'Brien's`, `ST. JAMES'S` → `St. James's`, `CARRICK-ON-SUIR` → `Carrick-On-Suir`); a name with any lower-case letter is returned as
 * published.
 */
export function titleCaseIfUpper(value: string): string {
	if (!isUpperCase(value)) return value;
	return value
		.toLowerCase()
		.split(" ")
		.map((word, index) => {
			if (index > 0 && SMALL_WORDS.has(word)) return word;
			return word.replace(
				/(^o'|^|[-(/])(\p{Ll})/gu,
				(_match, before: string, letter: string) =>
					`${before.toUpperCase()}${letter.toUpperCase()}`,
			);
		})
		.join(" ");
}

/** A facility's name as its page prints it: cleaned, trailing punctuation dropped, cased if in capitals. */
export function facilityNameIe(raw: string | null | undefined): string {
	return titleCaseIfUpper(trimPunctuation(cleanText(raw)));
}

/** Folds a text for comparison: accents and apostrophes dropped, lower case, words split on any separator. */
function fold(value: string): string {
	return slugify(cleanText(value).replace(/['’`´]/g, "")).replace(/-/g, " ");
}

/**
 * A town as the places are matched by: accents and apostrophes dropped, `Saint`/`St.` as `st`,
 * a trailing ` city` or ` town` dropped (`Galway City`, `Kilkenny Town`), and a Dublin postal
 * district as Dublin (`Dublin 15`, `Dublin 6W`, `D15`). Empty when nothing is left.
 */
export function townKey(value: string | null | undefined): string {
	let key = fold(value ?? "")
		.replace(/\bsaint\b/g, "st")
		.replace(/\s+(?:city|town|village)$/, "")
		.trim();
	if (/^dublin\s*\d{1,2}\s*w?$/.test(key) || /^d\s?\d{1,2}w?$/.test(key)) key = "dublin";
	// Compared without spaces: `Newcastlewest` is Newcastle West.
	return key.replace(/\s+/g, "");
}

/** A direction or a side before or after a town's name (`Finglas West`, `Upper Kilmacow`). */
const SIDE = /^(?:upper|lower)\s+|\s+(?:west|east|north|south|upper|lower|village)$/i;

/**
 * The names a town written in a list may be: the text itself, its parts when it holds several
 * (`Bishopstown, Cork`, `Kilkenny via Waterford`), and each without a side (`Finglas West` →
 * Finglas), the text's own form first.
 */
export function townCandidates(raw: string): string[] {
	const text = cleanText(raw);
	if (!text) return [];
	const parts = text
		.split(/,|\s+via\s+/i)
		.map((part) => trimPunctuation(part))
		.filter(Boolean)
		.reverse();
	const names = [text, ...(parts.length > 1 ? parts : [])];
	const sides = names.map((name) => name.replace(SIDE, "").trim()).filter((name) => name);
	return [...new Set([...names, ...sides])];
}

/** Words of a compound town name that join its parts (`Carrick-on-Suir` is one town). */
const JOINING = /^(?:on|in|upon|by|the|le|na|an|of)$/i;

/**
 * The parts of a census town's compound name, each a name it is matched by: `Ballybofey-
 * Stranorlar` → Ballybofey and Stranorlar, `Muinebeag (Bagenalstown)` → Muinebeag and
 * Bagenalstown, `Laytown-Bettystown-Mornington-Donacarney` → its four; `Carrick-on-Suir` stays
 * whole. The whole name is not among them.
 */
export function compoundParts(name: string): string[] {
	const text = cleanText(name);
	const parts: string[] = [];
	const bracket = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text);
	const base = bracket ? (bracket[1] ?? "") : text;
	if (bracket?.[2]) parts.push(bracket[2].trim());
	const tokens = base.split("-");
	const joined: string[] = [];
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index] ?? "";
		const next = tokens[index + 1];
		if (JOINING.test(token.trim()) && joined.length > 0 && next !== undefined) {
			joined[joined.length - 1] = `${joined[joined.length - 1]}-${token}-${next}`;
			index++;
		} else {
			joined.push(token);
		}
	}
	if (joined.length > 1 || bracket) parts.push(...joined.map((part) => part.trim()));
	return [...new Set(parts.filter((part) => part && part !== text))];
}

/**
 * The census's name of a city (`Dublin city and suburbs`, `Mullingar and environs`) as a place
 * prints it: `Dublin`, `Mullingar`. Other names are kept as published.
 */
export function townName(raw: string): string {
	return cleanText(raw)
		.replace(/\s+city and suburbs$/i, "")
		.replace(/\s+and environs$/i, "")
		.trim();
}

/** Phrases that do not tell a nursing home from a community hospital in the same county. */
const KIND_PHRASES =
	/\b(?:community hospital|community nursing unit|district hospital|nursing home|care centre)\b/g;

/**
 * A facility's name for telling whether two lists' rows are one facility (an HSE community
 * hospital that is also a HIQA designated centre): folded, `Saint`/`St.` as `st`, and the words
 * of the kind of facility dropped (`St Joseph's Community Hospital` ↔ `St. Josephs`). Empty when
 * nothing is left.
 */
export function facilityMatchKey(name: string): string {
	return fold(name)
		.replace(/\bsaint\b/g, "st")
		.replace(KIND_PHRASES, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * A nine-digit key derived from what identifies a row of a list that gives no number (the HSE's
 * layers): FNV-1a over the parts, read as a number of 100,000,000–999,999,999, as the Swiss and
 * Austrian lists' derived keys are. The same parts always give the same key, so a page keeps its
 * address from one run to the next while its layer keeps the row.
 */
export function derivedKeyIe(parts: readonly string[]): string {
	const input = parts.map((part) => slugify(cleanText(part).replace(/['’`´]/g, ""))).join("|");
	let hash = 0x811c9dc5;
	for (const byte of Buffer.from(input, "utf8")) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return String(100_000_000 + (hash % 900_000_000));
}
