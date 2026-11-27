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
/** Norwegian and Sámi letters NFKD leaves whole, as Norwegian URLs write them. */
const NORWEGIAN_LETTERS: Record<string, string> = {
	ø: "o",
	Ø: "o",
	đ: "d",
	Đ: "d",
	ŧ: "t",
	Ŧ: "t",
	ŋ: "n",
	Ŋ: "n",
};

/**
 * {@link slugify} for Norwegian text: `ø` reads `o` (`Tromsø` -> `tromso`), `æ` `ae`
 * (`Bærum` -> `baerum`) and `å` `a` (`Ålesund` -> `alesund`), as Norwegian addresses on the web
 * write them; the Sámi `đ`, `ŧ`, `ŋ` lose their stroke (`Guovdageaidnu`, `Unjárga`).
 */
export function slugifyNo(text: string): string {
	return slugify(text.replace(/[øØđĐŧŦŋŊ]/g, (char) => NORWEGIAN_LETTERS[char] ?? char));
}

/** Greek letters in Latin ones, as ELOT 743 (ISO 843, transcription) writes them. */
const GREEK_LETTERS: Record<string, string> = {
	α: "a",
	β: "v",
	γ: "g",
	δ: "d",
	ε: "e",
	ζ: "z",
	η: "i",
	θ: "th",
	ι: "i",
	κ: "k",
	λ: "l",
	μ: "m",
	ν: "n",
	ξ: "x",
	ο: "o",
	π: "p",
	ρ: "r",
	σ: "s",
	ς: "s",
	τ: "t",
	υ: "y",
	φ: "f",
	χ: "ch",
	ψ: "ps",
	ω: "o",
};

/** The letters after which `αυ`, `ευ`, `ηυ` read `av`, `ev`, `iv`: vowels and voiced consonants. */
const VOICED = /[αεηιουωβγδζλμνρ]/;

/**
 * Greek text in Latin letters, as ELOT 743 transcribes it and the Cypriot registers write
 * place names (`Λευκωσία` → `Lefkosia`, `Λεμεσός` → `Lemesos`, `Αυγόρου` → `Avgorou`,
 * `Ευαγγελίστριας` → `Evangelistrias`, `Καϊμακλί` → `Kaimakli`): `αυ`, `ευ`, `ηυ` as `av`, `ev`,
 * `iv` before a vowel or a voiced consonant and `af`, `ef`, `if` otherwise; `ου` as `ou`; `γγ`,
 * `γξ`, `γχ` as `ng`, `nx`, `nch`; `μπ` as `b` at the start of a word and `mp` inside it.
 * A diaeresis keeps its vowel apart (`ϋ` never makes a digraph). Accents are dropped; text that
 * is not Greek is left as it is, and the result is lowercase.
 */
export function transliterateGreek(text: string): string {
	// Lowercase first; a vowel with a diaeresis is marked so that it never joins a digraph.
	const letters = [...text.toLowerCase().normalize("NFD")];
	const chars: { base: string; apart: boolean }[] = [];
	for (const char of letters) {
		if (/\p{Mark}/u.test(char)) {
			const last = chars.at(-1);
			if (char === "\u0308" && last) last.apart = true;
			continue;
		}
		chars.push({ base: char, apart: false });
	}
	let out = "";
	for (let index = 0; index < chars.length; index++) {
		const current = chars[index]?.base ?? "";
		const next = chars[index + 1];
		const after = chars[index + 2]?.base ?? "";
		const joins = next !== undefined && !next.apart;
		if ((current === "α" || current === "ε" || current === "η") && joins && next.base === "υ") {
			out += `${GREEK_LETTERS[current]}${VOICED.test(after) ? "v" : "f"}`;
			index++;
			continue;
		}
		if (current === "ο" && joins && next.base === "υ") {
			out += "ou";
			index++;
			continue;
		}
		if (current === "γ" && next && ["γ", "ξ", "χ"].includes(next.base)) {
			out += `n${GREEK_LETTERS[next.base]}`;
			index++;
			continue;
		}
		if (current === "μ" && next?.base === "π") {
			const previous = chars[index - 1]?.base ?? "";
			out += /\p{L}/u.test(previous) ? "mp" : "b";
			index++;
			continue;
		}
		out += GREEK_LETTERS[current] ?? current;
	}
	return out;
}

/**
 * {@link slugify} for Greek text: transliterated as ELOT 743 writes it ({@link transliterateGreek}:
 * `Φαρμακείο, Ερμού 51Γ, Λάρνακα` → `farmakeio-ermou-51g-larnaka`), Latin letters kept.
 */
export function slugifyEl(text: string): string {
	return slugify(transliterateGreek(text));
}
