/**
 * Normalization of registry values (names, phones, addresses) for display and
 * for matching across sources. Pure functions, no I/O.
 */

/** Lowercase particles inside a name ("de La Fontaine", "van der Berg"). */
const NAME_PARTICLES = new Set([
	"de",
	"du",
	"des",
	"d",
	"la",
	"le",
	"les",
	"van",
	"von",
	"der",
	"den",
	"di",
	"da",
	"dos",
	"das",
	"del",
	"della",
	"y",
	"e",
]);

/** Particles that stay lowercase even at the start of a family name. */
const LEADING_PARTICLES = new Set([
	"de",
	"du",
	"des",
	"d",
	"van",
	"von",
	"di",
	"da",
	"dos",
	"das",
	"del",
]);

const capitalize = (word: string) =>
	word.length === 0 ? word : word.charAt(0).toLocaleUpperCase("fr") + word.slice(1);

/**
 * Formats a name from the registry (`JEAN-PIERRE`, `DE LA FONTAINE`,
 * `D'ALMEIDA`) for display (`Jean-Pierre`, `de La Fontaine`, `d'Almeida`).
 *
 * Words already in mixed case (`McDonald`) are kept as is. Particles are
 * lowercased, except `la`/`le` right after another particle, which keep their
 * capital (`de La Fontaine`). The original form is stored separately.
 */
export function formatPersonName(raw: string, options: { familyName?: boolean } = {}): string {
	const text = raw.trim().replace(/\s+/g, " ");
	if (text === "") return "";
	const words = text.split(" ");
	const result: string[] = [];
	for (let index = 0; index < words.length; index++) {
		const word = words[index] ?? "";
		result.push(formatNameWord(word, index, words, options.familyName ?? false));
	}
	return result.join(" ");
}

function formatNameWord(word: string, index: number, words: string[], familyName: boolean): string {
	const isMixedCase = word !== word.toUpperCase() && word !== word.toLowerCase();
	if (isMixedCase) return word;
	const lower = word.toLocaleLowerCase("fr");
	const previous = index > 0 ? (words[index - 1] ?? "").toLocaleLowerCase("fr") : "";
	const hasNext = index < words.length - 1;
	if (NAME_PARTICLES.has(lower) && hasNext) {
		const afterParticle = NAME_PARTICLES.has(previous);
		if ((lower === "la" || lower === "le") && afterParticle) return capitalize(lower);
		if (index > 0 || (familyName && LEADING_PARTICLES.has(lower))) return lower;
	}
	// Hyphens and apostrophes: capitalize each part, keep "d'" lowercase.
	return lower
		.split(/(['’-])/)
		.map((part, partIndex, parts) => {
			if (part === "'" || part === "’" || part === "-") return part;
			const next = parts[partIndex + 1];
			if (
				part === "d" &&
				(next === "'" || next === "’") &&
				(partIndex > 0 || index > 0 || familyName)
			) {
				return part;
			}
			return capitalize(part);
		})
		.join("");
}

/**
 * Key used to match people across sources: uppercase ASCII letters and single
 * spaces (hyphens, apostrophes and accents are ignored).
 */
export function nameMatchKey(raw: string): string {
	return raw
		.replace(/[œŒ]/g, "OE")
		.replace(/[æÆ]/g, "AE")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, " ")
		.trim();
}

/**
 * French overseas phone prefixes (national format) and their country codes.
 * Mainland numbers use +33.
 */
const OVERSEAS_PREFIXES: ReadonlyArray<readonly [string, string]> = [
	["0590", "590"], // Guadeloupe, Saint-Barthélemy, Saint-Martin (landline)
	["0690", "590"],
	["0691", "590"],
	["0594", "594"], // French Guiana
	["0694", "594"],
	["0596", "596"], // Martinique
	["0696", "596"],
	["0697", "596"],
	["0262", "262"], // Réunion
	["0263", "262"],
	["0692", "262"],
	["0693", "262"],
	["0269", "262"], // Mayotte
	["0639", "262"],
	["0508", "508"], // Saint-Pierre-et-Miquelon
];

/**
 * Converts a French phone number to E.164 (`+33472000000`). Returns null when
 * the value is not a plausible French number.
 */
export function toE164Fr(raw: string | null | undefined): string | null {
	if (!raw) return null;
	let digits = raw.replace(/[^\d+]/g, "");
	if (digits.startsWith("+")) {
		return /^\+\d{8,15}$/.test(digits) ? digits : null;
	}
	if (digits.startsWith("0033")) digits = `0${digits.slice(4)}`;
	else if (digits.length === 11 && digits.startsWith("33")) digits = `0${digits.slice(2)}`;
	if (!/^0[1-9]\d{8}$/.test(digits)) return null;
	for (const [prefix, country] of OVERSEAS_PREFIXES) {
		if (digits.startsWith(prefix)) return `+${country}${digits.slice(1)}`;
	}
	return `+33${digits.slice(1)}`;
}

const FRENCH_CALLING_CODES = ["33", "262", "590", "594", "596"] as const;

/**
 * Prints a French E.164 number the way it is dialled in France, in pairs
 * (`+33155347620` -> `01 55 34 76 20`, `+262262123456` -> `02 62 12 34 56`).
 * Other numbers are returned unchanged.
 */
export function formatPhoneFr(e164: string): string {
	for (const code of FRENCH_CALLING_CODES) {
		const rest = e164.startsWith(`+${code}`) ? e164.slice(code.length + 1) : null;
		if (rest && /^\d{9}$/.test(rest)) {
			return `0${rest}`.replace(/(\d{2})(?=\d)/g, "$1 ");
		}
	}
	return e164;
}

const REPETITION_INDEX: Readonly<Record<string, string>> = {
	B: "bis",
	T: "ter",
	Q: "quater",
	C: "quinquies",
};

/** Words kept lowercase inside a street name ("Rue de la Paix"). */
const STREET_LOWERCASE = new Set([
	"de",
	"du",
	"des",
	"d",
	"la",
	"le",
	"les",
	"l",
	"et",
	"a",
	"à",
	"au",
	"aux",
	"en",
	"sur",
	"sous",
]);

/**
 * Acronyms kept in capitals in place and establishment names, matched whatever
 * their case in the source, with how they are printed ("APHP" -> "AP-HP").
 */
const ACRONYMS: ReadonlyMap<string, string> = new Map(
	[
		"GHU",
		"AP-HP",
		"CHU",
		"CHRU",
		"CH",
		"CHR",
		"CHI",
		"GH",
		"CDS",
		"CMS",
		"MSP",
		"SNCF",
		"SAS",
		"SELARL",
		"SELAS",
		"SARL",
		"SCM",
		"SCP",
		"EHPAD",
		"CMP",
		"PMI",
		"USLD",
		"SSR",
		"CMPP",
		"CPMI",
		"IRM",
		"GCS",
		"CASVP",
		"SESSAD",
		"SSIAD",
		"ESAT",
	]
		.map((acronym): [string, string] => [acronym, acronym])
		.concat([["APHP", "AP-HP"]]),
);

/**
 * AP-HP hospital group codes ("GHU AP-HP NUP Site Bichat"): short words that
 * could be names elsewhere ("Dr Hu"), so they are capitalized only in a label
 * that names a GHU or the AP-HP.
 */
const AP_HP_SITE_CODES = new Set(["NUP", "CUP", "SUN", "UPS", "HM", "HU", "PSSD"]);

/** Two-letter name prefixes that are capitalized on purpose ("McDonald", "LeBlanc"). */
const CAMEL_PREFIXES = new Set(["Mc", "De", "Di", "Du", "Le", "La", "Lo", "Da"]);

const hasLetters = (value: string) => /\p{L}/u.test(value);
const isUpper = (value: string) => hasLetters(value) && value === value.toLocaleUpperCase("fr");

/** A word with a deliberate camel case after a name prefix ("LeBlanc", "DeAngelis"). */
const isCamelCase = (value: string) =>
	/^\p{Lu}\p{Ll}\p{Lu}\p{Ll}+$/u.test(value) && CAMEL_PREFIXES.has(value.slice(0, 2));

/**
 * A registry typo that capitalizes the second letter ("SEbastien", "BEn") or
 * the third ("StEphane"), as opposed to a deliberate camel case ("McDonald"),
 * or that prints accented letters as unaccented capitals inside a word
 * ("HElEne" for Hélène, "BenoIt" for Benoît, "ChloE" for Chloé).
 */
const isMiscased = (value: string) =>
	/^\p{Lu}{2}\p{Ll}+$/u.test(value) ||
	(/^\p{Lu}\p{Ll}\p{Lu}\p{Ll}+$/u.test(value) && !isCamelCase(value)) ||
	(/^\p{Lu}[\p{Ll}AEIOUY]+$/u.test(value) &&
		/\p{Ll}/u.test(value) &&
		/^.+[AEIOUY]/u.test(value) &&
		!isCamelCase(value));

/**
 * How the registry prints an accented word: accented letters after the first
 * become unaccented capitals ("Hélène" -> "HElEne", "Benoît" -> "BenoIt").
 * Null when the word has no accented letter after the first.
 */
function registrySpelling(word: string): string | null {
	const letters = Array.from(word);
	let changed = false;
	const spelled = letters.map((letter, index) => {
		if (index === 0) return letter;
		const base = letter.normalize("NFD").replace(/\p{Mark}/gu, "");
		if (base === letter || base.length !== 1 || !/\p{Ll}/u.test(letter)) return letter;
		changed = true;
		return base.toUpperCase();
	});
	return changed ? spelled.join("") : null;
}

/**
 * Accented words keyed by their registry spelling ("HElEne" -> "Hélène"),
 * used by {@link formatStreetText} to restore the accents of names in place
 * labels. Built with {@link buildAccentDictionary}.
 */
export type AccentDictionary = ReadonlyMap<string, string>;

/**
 * Builds an {@link AccentDictionary} from correctly accented names
 * ("Hélène", "Marie-Gwenaëlle", "Saint-Rémy-lès-Chevreuse"), optionally with
 * a weight (how many people bear the name). When two words share a registry
 * spelling, the most frequent one wins, then the first in alphabetical order.
 */
export function buildAccentDictionary(
	names: Iterable<string | readonly [name: string, weight: number]>,
): AccentDictionary {
	const counts = new Map<string, Map<string, number>>();
	for (const entry of names) {
		const [name, weight] = typeof entry === "string" ? [entry, 1] : entry;
		for (const word of name.split(/[\s'’-]+/)) {
			// Only words written in title case ("Hélène", not "HÉLÈNE" or "hélène").
			if (!/^\p{Lu}\p{Ll}+$/u.test(word)) continue;
			const key = registrySpelling(word);
			// A key without lowercase ("Lé" -> "LE") would match words printed in capitals.
			if (!key || !/\p{Ll}/u.test(key)) continue;
			const forms = counts.get(key) ?? new Map<string, number>();
			forms.set(word, (forms.get(word) ?? 0) + weight);
			counts.set(key, forms);
		}
	}
	const dictionary = new Map<string, string>();
	for (const [key, forms] of counts) {
		const [best] = [...forms].sort(
			([wordA, countA], [wordB, countB]) => countB - countA || wordA.localeCompare(wordB, "fr"),
		);
		if (best) dictionary.set(key, best[0]);
	}
	return dictionary;
}

/**
 * Formats a street, place or establishment label from the registry, word by
 * word: words printed in capitals are title-cased with short articles kept
 * lowercase, known acronyms stay in capitals ("APHP" prints "AP-HP"), words
 * with a stray capital ("SEbastien") are re-cased, and other words in mixed or
 * lower case are kept as written. A lone `l` or `d` before a word regains its
 * elided apostrophe ("DE L HOPITAL" -> "de l’Hopital"), as the registry drops
 * apostrophes. Idempotent, so it can also be applied when displaying.
 * `capitalizeFirst: false` keeps a leading article lowercase too, for a street
 * name that follows its type ("Boulevard de Sebastopol").
 *
 * The registry prints accented letters inside words as unaccented capitals
 * ("Cabinet du Dr HElEne Aelion"). With `accents` (see
 * {@link buildAccentDictionary}) such a word regains its accents ("Hélène");
 * otherwise its stray capitals are lowercased ("Helene").
 */
export function formatStreetText(
	raw: string,
	options: { capitalizeFirst?: boolean; accents?: AccentDictionary } = {},
): string {
	const capitalizeFirst = options.capitalizeFirst ?? true;
	const text = raw.trim().replace(/\s+/g, " ");
	if (text === "") return "";
	const upperWords = text.toLocaleUpperCase("fr").split(" ");
	const apHp = upperWords.some((word) => word === "GHU" || word === "APHP" || word === "AP-HP");
	const acronym = (word: string) => {
		const upper = word.toLocaleUpperCase("fr");
		return ACRONYMS.get(upper) ?? (apHp && AP_HP_SITE_CODES.has(upper) ? upper : undefined);
	};
	const words = text.split(" ").map((word, index) => {
		const whole = acronym(word);
		if (whole) return whole;
		return word
			.split(/(['’-])/)
			.map((part, partIndex) => {
				if (part === "'" || part === "’" || part === "-") return part;
				const known = acronym(part);
				if (known) return known;
				const accented = options.accents?.get(part);
				if (accented) return accented;
				if (!isUpper(part) && !isMiscased(part)) return part;
				const lower = part.toLocaleLowerCase("fr");
				const isFirst = capitalizeFirst && index === 0 && partIndex === 0;
				if (!isFirst && STREET_LOWERCASE.has(lower)) return lower;
				return capitalize(lower);
			})
			.join("");
	});
	return words
		.join(" ")
		.replace(/(^|\s)([ld]) (?=\p{L})/gu, "$1$2’")
		.replace(/^([LD]) (?=\p{L})/u, "$1’");
}

const withoutAccents = (value: string) => value.normalize("NFD").replace(/\p{Mark}/gu, "");

/**
 * Gives back the accents of a practitioner's own names in a place label of
 * the same registry rows: the registry often writes the structure name without
 * them ("Cabinet du Dr Helene Aelion") while the practitioner's first and last
 * names have them ("Hélène"). A word of the label written without any accent
 * that equals one of these names accent- and case-insensitively takes its
 * accented letters, keeping its own case. Only names of three letters or more
 * count, and a word two of the names would spell differently ("Helene" and
 * "Hélène" in the same practice) is left as it is. Idempotent.
 */
export function restoreOwnNameAccents(label: string, names: Iterable<string>): string {
	const forms = new Map<string, Set<string>>();
	for (const name of names) {
		for (const word of name.split(/[\s'’-]+/)) {
			if (Array.from(word).length < 3 || !/^\p{L}+$/u.test(word)) continue;
			const lower = word.normalize("NFC").toLocaleLowerCase("fr");
			const key = withoutAccents(lower);
			const set = forms.get(key) ?? new Set<string>();
			set.add(lower);
			forms.set(key, set);
		}
	}
	if (forms.size === 0) return label;
	return label
		.split(/([\s'’-]+)/)
		.map((part) => {
			if (!/^\p{L}+$/u.test(part) || withoutAccents(part) !== part) return part;
			const candidates = forms.get(part.toLocaleLowerCase("fr"));
			if (candidates?.size !== 1) return part;
			const [accented = ""] = candidates;
			const letters = Array.from(accented);
			const own = Array.from(part);
			if (letters.length !== own.length || accented === part.toLocaleLowerCase("fr")) return part;
			return own
				.map((letter, index) => {
					const target = letters[index] ?? letter;
					return letter === letter.toLocaleUpperCase("fr")
						? target.toLocaleUpperCase("fr")
						: target;
				})
				.join("");
		})
		.join("");
}

/**
 * Abbreviations of street names, expanded only to compare a registry street
 * with the geocoder's ("Rue St Honore" names "Rue Saint-Honoré").
 */
const STREET_ABBREVIATIONS: Readonly<Record<string, string>> = {
	ST: "SAINT",
	STE: "SAINTE",
	STS: "SAINTS",
	GAL: "GENERAL",
	GEN: "GENERAL",
	MAL: "MARECHAL",
	PDT: "PRESIDENT",
	PRES: "PRESIDENT",
	DR: "DOCTEUR",
	PR: "PROFESSEUR",
	PROF: "PROFESSEUR",
	CDT: "COMMANDANT",
	CPT: "CAPITAINE",
	LT: "LIEUTENANT",
	AV: "AVENUE",
	AVE: "AVENUE",
	BD: "BOULEVARD",
	BLD: "BOULEVARD",
	BVD: "BOULEVARD",
	PL: "PLACE",
	FBG: "FAUBOURG",
	FG: "FAUBOURG",
	CHE: "CHEMIN",
	CHEM: "CHEMIN",
	RTE: "ROUTE",
	IMP: "IMPASSE",
	ALL: "ALLEE",
	CRS: "COURS",
	QU: "QUAI",
	SQ: "SQUARE",
	PASS: "PASSAGE",
	RES: "RESIDENCE",
	GD: "GRAND",
	GDE: "GRANDE",
	MGR: "MONSEIGNEUR",
	ND: "NOTRE DAME",
	ZA: "ZONE ARTISANALE",
	ZI: "ZONE INDUSTRIELLE",
	ZAC: "ZONE D AMENAGEMENT CONCERTE",
};

/** Comparison key of a street name: uppercase ASCII words, abbreviations expanded. */
function streetKey(value: string): string {
	return nameMatchKey(value)
		.split(" ")
		.map((word) => STREET_ABBREVIATIONS[word] ?? word)
		.join(" ");
}

/** A leading house number with its repetition index ("24", "24 bis", "3 B", "12-14"). */
const isNumberToken = (token: string) =>
	/^\d[\d/-]*[a-z]?$/i.test(token) || /^(bis|ter|quater|quinquies|[a-z])$/i.test(token);

/**
 * The registry street line with the street name as the national address base
 * (BAN) writes it ("34 Avenue du General Sarrail" + "Avenue du Général
 * Sarrail" -> "34 Avenue du Général Sarrail"): the registry's house number and
 * repetition index are kept, only the street changes. Null when the BAN street
 * does not name the same street (same words once accents, case, hyphens and
 * common abbreviations are ignored), so a doubtful match never replaces the
 * registry text.
 */
export function banStreetLine(addressLine: string, banStreet: string | null): string | null {
	const street = banStreet?.trim().replace(/\s+/g, " ") ?? "";
	if (street === "" || !/\p{L}/u.test(street)) return null;
	const tokens = addressLine.trim().split(/\s+/);
	const target = streetKey(street);
	for (let start = 0; start < tokens.length; start++) {
		const prefix = tokens.slice(0, start);
		if (!prefix.every(isNumberToken)) break;
		if (streetKey(tokens.slice(start).join(" ")) === target) {
			return [...prefix, street].join(" ");
		}
	}
	return null;
}

export type StreetParts = {
	number?: string | null;
	repetition?: string | null;
	typeLabel?: string | null;
	street?: string | null;
};

/**
 * Builds the first address line ("24 bis Rue Dauphine") from the registry
 * columns (number, repetition index, street type label, street name).
 */
export function formatStreetLine(parts: StreetParts): string {
	const number = (parts.number ?? "").trim();
	const repetitionCode = (parts.repetition ?? "").trim().toUpperCase();
	const repetition = repetitionCode
		? (REPETITION_INDEX[repetitionCode] ?? repetitionCode.toLowerCase())
		: "";
	const type = formatStreetText(parts.typeLabel ?? "");
	const street = formatStreetText(parts.street ?? "", { capitalizeFirst: type === "" });
	return [number, repetition, type, street].filter(Boolean).join(" ");
}

/**
 * Cache key of an address for the geocoder: uppercase ASCII, single spaces,
 * joined with the postcode and the commune code.
 */
export function addressKey(line: string, postcode: string | null, citycode: string | null): string {
	return [nameMatchKey(line), postcode ?? "", citycode ?? ""].join("|");
}
