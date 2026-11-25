/**
 * Doctors' names as the Austrian lists write them: academic and professional
 * titles before the name ("Ao.Univ.Prof. Dr.", "MR Dr.", "Prim. Priv.-Doz.
 * DDr."), degrees after it (", MSc", "PhD"), and in two of the lists the whole
 * name in one field. Pure functions, no I/O.
 */
import { formatPersonName, slugifyDe } from "@apercura/core";

/** Titles written without a final dot (Medizinalrat, Obermedizinalrat, Primar…). */
const BARE_TITLES = new Set([
	"mr",
	"omr",
	"smr",
	"vr",
	"hr",
	"kr",
	"prim",
	"primar",
	"primaria",
	"professor",
	"professorin",
	"prof",
	"ddr",
	"dr",
	"mag",
	"di",
	"ing",
	"za",
	"zä",
	"zahnärztin",
	"zahnarzt",
	"msc",
	"mba",
	"mph",
	"phd",
	"bsc",
	"ma",
	"llm",
	"bc",
	"dott",
	"dott.ssa",
	"med",
	"univ",
	"i.r",
	"ir",
]);

/** Name particles of family names ("von Muster", "de Beispiel"). */
const PARTICLES = new Set([
	"von",
	"van",
	"der",
	"den",
	"de",
	"del",
	"della",
	"di",
	"da",
	"zu",
	"vom",
	"dos",
]);

/**
 * True for a token that is a title or degree: it ends with a dot ("Dr.",
 * "Univ.-Doz."), holds one inside ("Dr.med.univ"), or is a known bare title.
 */
export function isTitleToken(token: string): boolean {
	const bare = token.replace(/[,;]+$/g, "");
	if (bare === "") return true;
	if (/\.$/.test(bare) || /\.[A-Za-zÄÖÜäöü]/.test(bare)) return true;
	return BARE_TITLES.has(bare.toLowerCase());
}

/** Title code of the directory (`taxonomy.title.*`): a professor, a doctor, or none. */
export function titleCodeOf(titles: string): "PR" | "DR" | null {
	if (/prof/i.test(titles)) return "PR";
	if (/\b(?:d{1,2}r|mudr|dott|d\.med)/i.test(titles)) return "DR";
	return null;
}

export type ParsedName = {
	/** Titles and degrees, in source order ("Ao.Univ.Prof. Dr., MSc"). */
	titles: string;
	firstName: string;
	lastName: string;
};

/**
 * Splits a full name ("Ao.Univ.Prof. Dr. Maria Theresia Muster-Beispiel, MSc")
 * into titles, first names and family name. The family name is the last word,
 * with the particles before it ("Anna von Muster"): the lists never mark it, so
 * a two-word family name without a hyphen reads as a first name and a family
 * name. Returns null when no name is left once the titles are removed.
 */
export function splitFullName(raw: string): ParsedName | null {
	const text = raw.replace(/\s+/g, " ").trim();
	if (text === "") return null;
	const [main = "", ...suffixes] = text.split(",");
	const titles: string[] = [];
	const words: string[] = [];
	for (const token of main.trim().split(" ")) {
		if (words.length === 0 && isTitleToken(token)) titles.push(token);
		else if (words.length > 0 && isTitleToken(token) && /\./.test(token)) titles.push(token);
		else words.push(token);
	}
	for (const suffix of suffixes) {
		const degree = suffix.trim();
		if (degree) titles.push(degree);
	}
	if (words.length === 0) return null;
	if (words.length === 1)
		return { titles: titles.join(" "), firstName: "", lastName: words[0] ?? "" };
	let split = words.length - 1;
	while (split > 1 && PARTICLES.has((words[split - 1] ?? "").toLowerCase())) split--;
	return {
		titles: titles.join(" "),
		firstName: words.slice(0, split).join(" "),
		lastName: words.slice(split).join(" "),
	};
}

/** Display forms of a first and family name (`HUBER` → `Huber`, mixed case kept). */
export function displayNames(firstName: string, lastName: string) {
	return {
		firstName: formatPersonName(firstName),
		lastName: formatPersonName(lastName, { familyName: true }),
	};
}

/**
 * A deterministic 9-digit key for a person of a list without numbers
 * (Salzburg): FNV-1a over the normalized names (and the gender when the list
 * gives one), folded to 100000000–999999999. The same names give the same key
 * on every run; a change of name gives a new page (docs/data-import.md).
 */
export function atNameKey(lastName: string, firstName: string, gender = ""): string {
	const input = [slugifyDe(lastName), slugifyDe(firstName), gender.toLowerCase()].join("|");
	let hash = 0x811c9dc5;
	for (const byte of Buffer.from(input, "utf8")) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return String(100_000_000 + (hash % 900_000_000));
}
