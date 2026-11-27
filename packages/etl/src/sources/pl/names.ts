/**
 * Names in RPWDL: what a page may print of an establishment's name when a natural person runs
 * it (docs/data-import.md, "Poland", "Personal data").
 *
 * A healthcare entity may be a natural person carrying on a business (a sole trader, form `0700`)
 * or a partnership of natural persons (civil, general, professional, limited partnerships,
 * forms `08xx`–`12xx`). A sole trader's business name must contain their first and last name,
 * and a partnership's usually names its partners, so the entity's name is a person's: it is never
 * read into a row. The establishment's own name is the page's name; when it repeats the name of
 * a person who runs it ("PRYWATNA PORADNIA STOMATOLOGICZNA ANNA PRZYKŁADOWA"), that name is taken
 * out ("PRYWATNA PORADNIA STOMATOLOGICZNA"), with the professional titles and initials left
 * dangling ("lek. stom.", "A.").
 *
 * The person's name is read from the entity's name, around its first names: a first name is a
 * word the register's natural persons use often and its companies and public bodies seldom
 * ("anna", "piotr"), and the person's surname is the word after it ("Anna Przykładowa"), else the
 * word before it ("Przykładowa Anna"), when that word is no business word either. A business
 * word is one the companies use as often as the natural persons do ("centrum", "szpital"), or
 * one built on the vocabulary of care and trade ("stomatologia", "fizjo", "med", "dent",
 * "gabinet", "usługi"), which covers most brands ("Przykładent", "Medprzykład"). An entity named
 * by a person's name alone (two or three such words) with no first name the register knows (a
 * foreign name) has every word taken out. A name the register writes otherwise (a surname alone, "Nowak i Partnerzy") is printed
 * as published, with the article 14 notice and removal on objection.
 */

/** Organisational and legal forms of natural persons and of their partnerships. */
export function isNaturalPersonForm(code: string | null | undefined): boolean {
	return /^(?:07|08|09|10|11|12)\d{2}$/.test((code ?? "").trim());
}

/**
 * Forms of public operators: independent public healthcare units (SP ZOZ), budget units,
 * research institutes, companies in which the State Treasury, a local government or a medical
 * university holds at least 51% of the capital.
 */
export function isPublicForm(code: string | null | undefined): boolean {
	return /^(?:01|02|03)\d{2}$|^1[34]1\d$/.test((code ?? "").trim());
}

const WORD = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

/** The words of a name, lowercased (`"KŁAPTOCZ GRAŻYNA"` → `kłaptocz`, `grażyna`). */
export function nameWords(name: string): string[] {
	return [...name.matchAll(WORD)].map((match) => match[0].toLocaleLowerCase("pl"));
}

/**
 * Stems of the vocabulary of care, trade and legal forms: a word that contains one of the
 * distinctive ones anywhere ("stomatologiczny", "Przykładent", "Medprzykład"), or begins with one
 * of the others ("gabinet", "usługi"), or is one of the short words that begin many surnames
 * ("dom", "nowa": never "Domański", "Nowak"), is a business word, whatever its count.
 */
const BUSINESS_INFIXES =
	/(?:med|dent|stom|fizjo|physio|rehab|terap|kinez|klinik|clinic|centr|center|logi|diagn|estet|aesth|implant|derm|kardio|neuro|psych|ortod|ortop|vital|zdrow|lecz|lekar|opiek|pielęgn|szpital|hospic|spółk|aptek|farmac|laborat|uśmiech|beauty|wellness|health)/u;
const BUSINESS_PREFIXES =
	/^(?:zęb|osteo|manual|gabin|prakty|porad|przych|ambulat|pracow|ośrod|zakład|położ|orto|kosmet|okul|rentg|rtg|radio|pediatr|chirurg|usług|handl|firma|przedsięb|produk|cywiln|jawn|partner|komandyt|wspóln|nzoz|zoz|indywidual|specjal|prywat|niepubl|publiczn|rodzin|zesp|instytut|fundac|stowarz|polsk|optyk|wzrok|słuch|logop|diet|żywien|masaż|family|care|smile|studio|office|profil|szkol|dział|filia|oddzia|serwis|consult|kancel|biur|agenc|sport|kręgo|gine|dziec|nocn|dyżur|pogotow|ratown|transport|odnow|natur|homeo|akupunk|medical|centrum|podmiot|działaln|prowadz)/u;

/** Short words of care and trade that begin many surnames ("Domański", "Zieliński"): whole words only. */
const BUSINESS_WORDS = new Set([
	"dom",
	"domu",
	"oko",
	"oka",
	"uro",
	"spa",
	"fit",
	"body",
	"ruch",
	"stopa",
	"stopy",
	"lab",
	"grupa",
	"mama",
	"mamy",
	"ząb",
	"ząbek",
	"zęby",
	"kids",
	"baby",
	"vita",
	"skin",
	"sana",
	"salus",
	"piel",
	"nowy",
	"nowa",
	"nowe",
	"stary",
	"stara",
	"dobry",
	"dobra",
	"zielony",
	"zielona",
]);

/** Words that are never part of a name and never a business word: they join two names. */
const JOINERS = new Set(["i", "oraz", "&"]);

/**
 * The words the register's legal persons and natural persons use in their names (entities and
 * establishments), each with the number of names it appears in on each side: a word the legal
 * persons use as often as the natural persons do (at least a third as often, and in five names
 * or more) is a business word ("centrum", "szpital"), never a person's name; a first name is
 * rare among companies and common among sole traders.
 */
export class NameVocabulary {
	private readonly legal = new Map<string, number>();
	private readonly natural = new Map<string, number>();

	add(name: string, naturalPerson = false): void {
		const counts = naturalPerson ? this.natural : this.legal;
		for (const word of new Set(nameWords(name))) counts.set(word, (counts.get(word) ?? 0) + 1);
	}

	isBusinessWord(word: string): boolean {
		if (BUSINESS_WORDS.has(word) || BUSINESS_INFIXES.test(word) || BUSINESS_PREFIXES.test(word)) {
			return true;
		}
		const legal = this.legal.get(word) ?? 0;
		return legal >= 5 && legal * 3 >= (this.natural.get(word) ?? 0);
	}

	/** A first name: in ten natural persons' names or more, and six times rarer among the others. */
	isFirstName(word: string): boolean {
		const natural = this.natural.get(word) ?? 0;
		return (
			word.length >= 3 &&
			natural >= 10 &&
			(this.legal.get(word) ?? 0) * 6 <= natural &&
			!this.isBusinessWord(word)
		);
	}
}

/**
 * The words of the names of the persons an entity's name holds (`"Przychodnia „Przykład” Anna
 * Nowak"` → `anna`, `nowak`; `"S.C. Anna Nowak, Jan Kowalski"` → the four; `"Nowak Anna"` → the
 * two): each first name with the surname after it, else before it, within the runs of words of
 * letters that are no business words (quoted parts, a brand, apart; `i` and `oraz` join two names
 * in a run). A name of two or three such words and nothing else, without a known first name, is
 * a person's whole name. Empty when the name holds none.
 */
export function personNameWords(entityName: string, vocabulary: NameVocabulary): string[] {
	// A quoted part is a brand ("„Przykład”", "\"Przykład\""): never a name.
	// A surname hyphenated with spaces ("Nowak - Przykładowa") is one word.
	const text = entityName
		.replace(/[„"“”«»][^„"“”«»]*[„"“”«»]/g, " , ")
		.replace(/(\p{L}{2,}) ?- ?(?=\p{L}{2,})/gu, "$1-");
	const tokens = text.split(/(\s+|[,;:()/]+|\.)/u);
	const runs: string[][] = [];
	let run: string[] = [];
	let separate = 0;
	// A word after an initial ("M. Nowak", "M.Nowak") is a surname.
	const initialed = new Set<string>();
	let initial = false;
	const close = () => {
		if (run.length > 0) runs.push(run);
		run = [];
	};
	for (const raw of tokens) {
		const token = raw.trim();
		if (!token) continue;
		if (token === ".") continue;
		if (!/^[\p{L}]+(?:['’-][\p{L}]+)*$/u.test(token)) {
			if (/[\p{L}\p{N}]/u.test(token)) separate++;
			initial = false;
			close();
			continue;
		}
		if (/^\p{Lu}$/u.test(token)) {
			initial = true;
			close();
			continue;
		}
		const word = token.toLocaleLowerCase("pl");
		const afterInitial = initial;
		initial = false;
		if (afterInitial && word.length >= 2 && !vocabulary.isBusinessWord(word)) {
			initialed.add(word);
			close();
			continue;
		}
		if (JOINERS.has(word)) {
			close();
			continue;
		}
		if (word.length < 2 || vocabulary.isBusinessWord(word)) {
			separate++;
			close();
			continue;
		}
		run.push(word);
	}
	close();
	const words = new Set<string>(initialed);
	for (const words_ of runs) {
		for (let index = 0; index < words_.length; index++) {
			const word = words_[index] as string;
			if (!vocabulary.isFirstName(word)) continue;
			words.add(word);
			// Further first names ("Anna Maria Przykładowa"), then the surname after them.
			let next = index + 1;
			while (next < words_.length && vocabulary.isFirstName(words_[next] as string)) {
				words.add(words_[next] as string);
				next++;
			}
			const after = words_[next];
			const before = words_[index - 1];
			if (after !== undefined) words.add(after);
			else if (before !== undefined && !vocabulary.isFirstName(before)) words.add(before);
			index = next;
		}
	}
	// No first name the register knows, but nothing but a name ("Simon Example"): every word of it.
	const only = runs[0];
	if (words.size === 0 && separate === 0 && runs.length === 1 && only && only.length >= 2) {
		if (only.length <= 3) for (const word of only) words.add(word);
	}
	return [...words];
}

/**
 * Professional titles and degrees printed before a name (`lek. stom.`, `dr n. med.`, `mgr`), and
 * initials (`A.`), when they stand right before a word taken out (`MARKER`).
 */
const TITLE_BEFORE =
	/(?<![\p{L}\p{N}-])(?:dr\.?\s*(?:hab\.?\s*)?(?:n\.\s*(?:med|o\s*zdr|farm)\.?\s*)?|lek\.\s*(?:med\.|dent\.|stom\.)?|lek\s|mgr\.?|prof\.?|inż\.|piel\.|poł\.|fizjoter\.|\p{Lu}\.)\s*(?=\uE000)/giu;

/** An initial right after a word taken out (`Nowak J.`). */
const INITIAL_AFTER = /(?<=\uE000)\s*\p{Lu}\.(?=[\s,;]|$)/gu;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An establishment's name without the words of a person's name and the titles and initials
 * left with them, with the punctuation it leaves tidied (`"STOMATOLOGIA „PRZYKŁAD” lek. stom.
 * ANNA NOWAK"` → `"STOMATOLOGIA „PRZYKŁAD”"`). Unchanged when none of the words is in it.
 */
export function withoutPersonName(name: string, words: readonly string[]): string {
	const original = name.replace(/\s+/g, " ").trim();
	let text = original;
	let found = false;
	for (const word of [...words].sort((a, b) => b.length - a.length)) {
		// A word ends at a space, a punctuation mark or a hyphen before a space (`Nowak- Med`).
		const spelled = escapeRegExp(word).replace(/-/g, "\\s*-\\s*");
		const pattern = new RegExp(
			`(?<![\\p{L}\\p{N}'’]|\\p{L}-)${spelled}(?![\\p{L}\\p{N}'’]|-\\p{L})`,
			"giu",
		);
		if (pattern.test(text)) {
			found = true;
			text = text.replace(pattern, "\uE000");
		}
	}
	if (!found) return original;
	let previous = "";
	while (previous !== text) {
		previous = text;
		text = text.replace(TITLE_BEFORE, "").replace(INITIAL_AFTER, "");
	}
	return text
		.replace(/\uE000-?/g, " ")
		.replace(/\s*,[\s,]*/g, ", ")
		.replace(/\(\s*\)|„\s*”|"\s*"|''\s*''/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\s*[-–](?:\s*[-–])+/g, " -")
		.replace(/\s+\.(?=\s|$)/g, "")
		.replace(/(?:\s+(?:i|oraz|&|-|–))+\s*$/iu, "")
		.replace(/^(?:(?:i|oraz|&)\s+)+/iu, "")
		.replace(/^[\s,;:.–-]+|[\s,;:–-]+$/g, "")
		.trim();
}

/** True when a name still says something: a word of two letters or more. */
export function hasWords(name: string): boolean {
	return nameWords(name).some((word) => word.length >= 2);
}
