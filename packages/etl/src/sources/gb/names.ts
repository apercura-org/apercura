/**
 * Names and addresses of the UK lists as printed on the pages.
 *
 * The NHS lists write most names in capitals (`THE DENSHAM SURGERY`, `STOCKTON-ON-TEES`):
 * `titleCaseGb` gives them the case British English writes them in (`The Densham Surgery`,
 * `Stockton-on-Tees`, `St John's`, `McCann`, `NHS`), and spells out the abbreviations of the
 * 40-character legacy fields (`MEDICAL CTR` -> `Medical Centre`).
 *
 * Minimisation: the Open Government Licence "does not cover personal data", and the
 * directory lists practices, never people (docs/adr/0002-multi-country.md). A practice
 * whose published name names a person (`DR A EXAMPLE & PARTNERS`, `MR B SAMPLE`,
 * `Drs Demo, Test & Mock`) is shown under its premises (`Falls Road Surgery`), else its
 * street (`12 Example Street`), else its town; the person's name is never stored.
 */

/** Words printed in capitals whatever the source's case. */
const UPPERCASE = new Set([
	"NHS",
	"GP",
	"GPS",
	"UK",
	"LLP",
	"PLC",
	"PMS",
	"APMS",
	"GMS",
	"ICB",
	"CIC",
	"HC",
	"PCN",
	"BUPA",
	"YMCA",
	"HMP",
	"HMYOI",
	"II",
	"III",
	"IV",
]);

/** Words printed in lowercase inside a name (`Newcastle upon Tyne`, `Stockton-on-Tees`). */
const LOWERCASE = new Set([
	"and",
	"of",
	"the",
	"on",
	"upon",
	"in",
	"at",
	"by",
	"de",
	"la",
	"le",
	"under",
	"with",
	"for",
	"y",
	"yr",
	"a",
]);

/** Abbreviations of the legacy fields, spelled out. */
const SPELLED_OUT: Readonly<Record<string, string>> = {
	CTR: "Centre",
	CTRE: "Centre",
	CNTR: "Centre",
	PRACT: "Practice",
	PRAC: "Practice",
	SURG: "Surgery",
	HLTH: "Health",
	PRIM: "Primary",
};

/** Two-letter words without a vowel that are abbreviations of words, not initials (`St`, `Rd`). */
const ABBREVIATIONS = new Set([
	"ST",
	"DR",
	"MR",
	"MS",
	"RD",
	"SQ",
	"CL",
	"CT",
	"PL",
	"MT",
	"FT",
	"PK",
	"LN",
]);

function caseWord(word: string, first: boolean): string {
	const upper = word.toUpperCase();
	if (UPPERCASE.has(upper)) return upper;
	// Initials written together (`DG Smile`, `KM Dental`).
	if (/^[B-DF-HJ-NP-TV-XZ]{2}$/.test(upper) && !ABBREVIATIONS.has(upper)) return upper;
	const spelled = SPELLED_OUT[upper];
	if (spelled) return spelled;
	if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return word.toLowerCase();
	if (/\d/.test(word)) return upper;
	const lower = word.toLowerCase();
	if (!first && LOWERCASE.has(lower)) return lower;
	// Mc and O' surnames and place names: McCann, O'Neill.
	if (/^mc[a-z]{2,}$/.test(lower)) return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
	if (/^o'[a-z]{2,}$/.test(lower)) return `O'${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
	// An apostrophe s stays lowercase: St John's.
	return lower.replace(/^\p{L}/u, (char) => char.toUpperCase());
}

/**
 * A name or address line in British English case: each word capitalized, small
 * words lowercase inside a name, hyphenated parts each cased, acronyms kept.
 * Text already in mixed case (the Scottish lists) is only trimmed and spaced.
 */
export function titleCaseGb(value: string | null | undefined): string {
	const text = (value ?? "").replace(/\s+/g, " ").trim();
	if (!text) return "";
	// Mixed case is the source's own (the Scottish lists): kept, but for a capital after an
	// apostrophe (`Whyteman'S Brae`).
	if (/[a-z]/.test(text) && /[A-Z]/.test(text)) return text.replace(/(\p{Ll})'S\b/gu, "$1's");
	let index = 0;
	return text.replace(/[\p{L}\p{N}']+/gu, (word, offset: number) => {
		const first = index++ === 0 || /[(/]\s*$/.test(text.slice(0, offset));
		return word
			.split("-")
			.map((part, partIndex) => (part ? caseWord(part, first && partIndex === 0) : part))
			.join("-");
	});
}

/** Words of an organisation's name: a name with one of them is not a list of people's names. */
const ORGANISATION_WORDS =
	/\b(SURGERY|SURGERIES|PRACTICE|PRACT|PRAC|MEDICAL|MED|HEALTH|HEALTHCARE|CENTRE|CENTER|CTR|CTRE|CLINIC|CARE|GROUP|PARTNERSHIP|DENTAL|DENTISTRY|DENTISTS?|ORTHODONTICS?|SMILES?|TEETH|TOOTH|PHARMACY|PHARMACIES|CHEMISTS?|DISPENSARY|HOUSE|LODGE|HALL|COURT|NHS|MEDDYGFA|DEINTYDDFA|FFERYLLFA|LTD|LIMITED|LLP|PLC|UNIT|TRUST|SERVICES?|ROAD|STREET|LANE|AVENUE|PARK|SQUARE|VILLAGE|TOWN|CITY)\b/;

/** A title before a person's name (`DR`, `Drs`, `MR`, `MRS`, `MS`, `MISS`, `PROF`). */
const PERSONAL_TITLE = /(^|[\s,(&/])(DR|DRS|MR|MRS|MS|MISS|PROF)\.?(?=\s|$)/;

/**
 * True when a published practice name names a person rather than a practice: it
 * carries a personal title (`DR A EXAMPLE`, `Drs Demo, Test & Mock`, `MRS B SAMPLE`), a
 * partners formula (`EXAMPLE & PARTNERS`), initials and a surname alone (`A B SAMPLE`), or
 * names joined by `&` or `and` without any word of an organisation (`DEMO TEST & MOCK`); a
 * comma alone is an address (`WARRENPOINT, NEWRY`). Errs on the
 * side of the person: a pharmacy called `DR PHARMACY` is shown under its premises.
 */
export function namesAPerson(name: string | null | undefined): boolean {
	const text = (name ?? "").toUpperCase().replace(/\s+/g, " ").trim();
	if (!text) return false;
	if (PERSONAL_TITLE.test(text)) return true;
	if (/(&|\bAND)\s*PARTNERS?\b/.test(text)) return true;
	if (ORGANISATION_WORDS.test(text)) return false;
	return /^(?:[A-Z]\.?\s+){1,3}[A-Z][A-Z'-]+$/.test(text) || /&|\bAND\b/.test(text);
}

/** True when an address line names premises (`FALLS ROAD SURGERY`, `HOLYWOOD ARCHES HEALTH CENTRE`). */
export function isPremisesName(line: string | null | undefined): boolean {
	const text = (line ?? "").toUpperCase().trim();
	if (!text || /^\d/.test(text) || namesAPerson(text)) return false;
	return /\b(SURGERY|SURGERIES|PRACTICE|MEDICAL|HEALTH|HEALTHCARE|CENTRE|CLINIC|DENTAL|DENTISTRY|PHARMACY|CHEMISTS?|DISPENSARY|MEDDYGFA|DEINTYDDFA|FFERYLLFA)\b/.test(
		text,
	);
}

/**
 * The name a UK practice is shown under: its published name in British English case,
 * unless it names a person; then the first address line that names premises, else the
 * first address line (the street), else the town. Never empty when the practice has an
 * address.
 */
export function practiceDisplayName(
	publishedName: string | null | undefined,
	addressLines: readonly (string | null | undefined)[],
	town: string | null | undefined,
): { name: string; minimised: boolean } {
	const published = (publishedName ?? "").trim();
	if (published && !namesAPerson(published)) {
		return { name: titleCaseGb(published), minimised: false };
	}
	const lines = addressLines.map((line) => (line ?? "").trim()).filter(Boolean);
	const premises = lines.find((line) => isPremisesName(line));
	const fallback =
		premises ?? lines.find((line) => !namesAPerson(line)) ?? (town ?? "").trim() ?? "";
	return { name: titleCaseGb(fallback), minimised: published !== "" };
}
