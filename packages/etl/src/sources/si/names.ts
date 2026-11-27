/**
 * Names and addresses as the insurer's lists write them, in capitals (`KOLAR  MIRAN`, `ZASEBNA
 * ORDINACIJA DR. JADEK D.O.O.`, `CELJSKA CESTA 24 B`), written the way Slovenian writes them.
 * Pure functions, no I/O.
 */

/** The letters a word of a name starts with after a hyphen or an apostrophe (`Novak-Kos`). */
const capitalise = (word: string) =>
	word
		.toLocaleLowerCase("sl")
		.replace(
			/(^|[-'’])(\p{L})/gu,
			(_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase("sl")}`,
		);

/**
 * A doctor's `Priimek in ime zdravnika` split into first and last names. The list joins the two
 * fields with a space after the family name, so a one-word family name is followed by two
 * (`KOLAR  MIRAN`); without them, a name of three words is two family names and a given one
 * (`NOWAKOWSKA PREZELJ ANNA` is rare enough with a single family name to read so), four words two
 * and two, two words one and one. Every word is capitalised (`Mušić`, `Novak-Kos`).
 */
export function splitDoctorName(raw: string): { firstName: string; lastName: string } {
	const text = raw.replace(/\s+$/, "").replace(/^\s+/, "");
	const gap = /^(\S+(?: \S+)*?) {2,}(.+)$/.exec(text);
	let last: string[];
	let first: string[];
	if (gap?.[1] && gap[2]) {
		last = gap[1].split(" ");
		first = gap[2].trim().split(/\s+/);
	} else {
		const words = text.split(/\s+/).filter(Boolean);
		const lastCount = words.length >= 4 ? 2 : words.length === 3 ? 2 : 1;
		last = words.slice(0, lastCount);
		first = words.slice(lastCount);
	}
	return {
		firstName: first.map(capitalise).join(" "),
		lastName: last.map(capitalise).join(" "),
	};
}

/** A word folded for comparing: no case, no accents (`ŠKOFJA` → `skofja`). */
export function foldWord(word: string): string {
	return word
		.replace(/[đĐ]/g, "d")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase();
}

/** A label folded for comparing: no case, accents or punctuation, single spaces. */
export function foldLabel(value: string): string {
	return foldWord(value)
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Abbreviations written in small letters wherever they are (`d.o.o.`, `dr. med.`, `spec.`). */
const LOWER_ABBREVIATIONS = new Set([
	"d.o.o.",
	"d.o.o",
	"d.d.",
	"s.p.",
	"s.p",
	"k.d.",
	"d.n.o.",
	"z.o.o.",
	"dr.",
	"med.",
	"dent.",
	"spec.",
	"spl.",
	"druž.",
	"prim.",
	"mag.",
	"doc.",
	"prof.",
	"ul.",
	"c.",
	"dr.med.",
	"dr.dent.med.",
]);

/** Acronyms kept in capitals (zdravstveni dom, univerzitetni klinični center…). */
const ACRONYMS = new Set([
	"zd",
	"ukc",
	"sb",
	"dms",
	"nijz",
	"ii",
	"iii",
	"iv",
	"vi",
	"vii",
	"viii",
	"ix",
	"xi",
	"xii",
	"xiv",
	"xv",
]);

/**
 * Words that are common nouns, adjectives and particles in providers' names, written in small
 * letters even where they also name a place (a village called `Dom`, `Breg` or `Vas`).
 */
const COMMON = new Set([
	"in",
	"za",
	"na",
	"pri",
	"ob",
	"pod",
	"nad",
	"v",
	"z",
	"s",
	"od",
	"do",
	"dom",
	"vas",
	"breg",
	"log",
	"dol",
	"hrib",
	"gora",
	"polje",
	"zdravstveni",
	"zdravstvena",
	"zdravstvene",
	"zdravstvo",
	"ambulanta",
	"zasebna",
	"zasebni",
	"ordinacija",
	"splosna",
	"medicina",
	"medicine",
	"druzinska",
	"druzinske",
	"zobozdravstvo",
	"zobozdravstvena",
	"zobna",
	"storitve",
	"center",
	"bolnisnica",
	"dispanzer",
	"zenske",
	"lekarna",
	"ulica",
	"cesta",
	"trg",
	"pot",
	"nabrezje",
	"naselje",
	"sodna",
]);

const isOrdinal = (word: string) => /^\d+\.?$/.test(word);

/**
 * A provider's name or a street written in capitals, written the Slovenian way: the first word
 * and proper names capitalised (`proper`: the folded words of the register's place names and of
 * the lists' doctors), every other word in small letters, `d.o.o.`, `dr. med.` and the like in
 * small letters, acronyms (`ZD`, `UKC`) and Roman numerals in capitals. `proper` maps a folded
 * word to its spelling where the register gives one (`skofja` → `Škofja`).
 */
export function caseLabel(raw: string, proper: ReadonlyMap<string, string | null>): string {
	const words = raw.replace(/\s+/g, " ").trim().split(" ");
	let first = true;
	return words
		.map((token) => {
			// Keep separators glued to words ("DR.MED.,SPEC." → `dr.med.,spec.`): case each part.
			const cased = token.replace(/[\p{L}\d][\p{L}\d.'’-]*/gu, (word) => {
				const lower = word.toLocaleLowerCase("sl");
				const folded = foldWord(word.replace(/\.+$/, ""));
				let result: string;
				if (LOWER_ABBREVIATIONS.has(lower) || /^(?:[a-zčšžćđ]\.){2,}$/.test(lower)) {
					result = lower;
				} else if (ACRONYMS.has(folded) && word === word.toUpperCase()) {
					result = word.toUpperCase();
				} else if (isOrdinal(word)) {
					result = word;
				} else if (first) {
					result = proper.get(folded) ?? capitalise(word);
				} else if (!COMMON.has(folded) && proper.has(folded)) {
					result = proper.get(folded) ?? capitalise(word);
				} else {
					result = lower;
				}
				first = false;
				return result;
			});
			return cased;
		})
		.join(" ");
}

/**
 * A house number as the lists write it (`24 B`, `6`, `3 A`, `11B`) the way addresses write it
 * (`24 b`, `6`, `3 a`, `11b`): letters in small letters.
 */
export function houseNumber(raw: string): string {
	return raw.toLocaleLowerCase("sl").replace(/\s+/g, " ").trim();
}

/** A street line split into its name and its house number (`CELJSKA CESTA 24 B`). */
export function splitStreet(raw: string): { name: string; number: string | null } {
	const text = raw.replace(/\s+/g, " ").trim();
	const match = /^(.*?\D)\s*(\d+\s?[A-Za-z]?(?:\s*[/-]\s*\d+\s?[A-Za-z]?)?)$/.exec(text);
	if (!match?.[1]) return { name: text, number: null };
	return { name: match[1].trim().replace(/[,]+$/, ""), number: match[2] ?? null };
}
