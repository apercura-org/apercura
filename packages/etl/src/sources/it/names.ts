/**
 * The names of the Ministry of Health's lists as a page prints them. The lists give a
 * pharmacy's company name (`ragione sociale`, "FARMACIA SAN CARLO S.N.C. DEI DOTT.RI ROSSI MARIO
 * E BIANCHI ANNA"), a parapharmacy's shop name and a hospital's name, often in capitals, padded,
 * with the accents written as apostrophes ("UNIVERSITA'"). A page shows the place's own name:
 * the company form and what follows it, and a pharmacist's title and the name after it, are left
 * out, so the owners named in a company name are not printed. A pharmacy whose name does not say
 * it is one ("SAN CARLO") reads "Farmacia San Carlo", as Italians call it.
 */

/** Words of a name written in lower case unless they begin it (prepositions and conjunctions). */
const PARTICLES: ReadonlySet<string> = new Set([
	"a",
	"ad",
	"ai",
	"al",
	"alla",
	"alle",
	"allo",
	"agli",
	"con",
	"d",
	"da",
	"dai",
	"dal",
	"dalla",
	"dalle",
	"dallo",
	"de",
	"degli",
	"dei",
	"del",
	"dell",
	"della",
	"delle",
	"dello",
	"di",
	"e",
	"ed",
	"in",
	"nel",
	"nella",
	"per",
	"sul",
	"sulla",
	"tra",
	"fra",
]);

/** Abbreviations kept in capitals (`IRCCS`, `ASST`, Roman numerals). */
const ACRONYMS: ReadonlySet<string> = new Set([
	"ao",
	"aou",
	"aoup",
	"asl",
	"asp",
	"asst",
	"ats",
	"aress",
	"ausl",
	"cnr",
	"cto",
	"ics",
	"idi",
	"ieo",
	"inrca",
	"irccs",
	"ismett",
	"po",
	"pta",
	"spdc",
	"uls",
	"ulss",
	"usl",
	"ii",
	"iii",
	"iv",
	"vi",
	"vii",
	"viii",
	"ix",
	"xi",
	"xii",
	"xiii",
	"xxiii",
]);

const GRAVE: Readonly<Record<string, string>> = {
	a: "à",
	e: "è",
	i: "ì",
	o: "ò",
	u: "ù",
	A: "À",
	E: "È",
	I: "Ì",
	O: "Ò",
	U: "Ù",
};

/**
 * Accents written as an apostrophe or a backquote after a vowel ("UNIVERSITA'", "GESU`",
 * "COLLOVA'") become the accented letter; an elision ("SANT'ANNA", "D'ANNUNZIO") follows a
 * consonant and stays. A backquote glued to the next word is a separator too.
 */
function restoreAccents(value: string): string {
	return (
		value
			// A quoted name ("PO AVEZZANO 'S. FILIPPO E NICOLA'") keeps its quotes, as quotation marks.
			.replace(/(^|\s)['`]([^'`]+?)['`](?=\s|$)/gu, (_match, space: string, quoted: string) =>
				/\s/.test(quoted) ? `${space}“${quoted}”` : `${space}'${quoted}'`,
			)
			.replace(/"([^"]+)"/g, "“$1”")
			// An elision written with a backquote ("SANT`ANNA", "D`ARAGONA").
			.replace(/(?<=[^\sAEIOUaeiou])`(?=\p{L})/gu, "'")
			.replace(
				/([AEIOUaeiou])[`´](?=\p{L})/gu,
				(_match, vowel: string) => `${GRAVE[vowel] ?? vowel} `,
			)
			.replace(/([AEIOUaeiou])['`´’](?!\p{L})/gu, (_match, vowel: string) => GRAVE[vowel] ?? vowel)
			// A word in capitals ending with a lower-case accented vowel ("LIBERTà", repaired
			// text) is a word in capitals.
			.replace(/(?<=\p{Lu})[àèéìòù](?!\p{L})/gu, (vowel) => vowel.toUpperCase())
	);
}

/** A word in title case; letters after an apostrophe or a dot are words of their own. */
function casedWord(word: string, first: boolean): string {
	const lower = word.toLowerCase();
	const bare = lower.replace(/[^\p{L}\d]/gu, "");
	if (bare && ACRONYMS.has(bare)) return word.toUpperCase();
	// A code with digits (`AST3`, `ULSS9`) and a word without vowels (`CRT`, `PS`) are
	// abbreviations, kept in capitals.
	if (/^\p{L}{2,5}\d+$/u.test(bare)) return word.toUpperCase();
	if (bare.length > 1 && !/[aeiouàèéìòù\d]/.test(bare)) return word.toUpperCase();
	if (!first && PARTICLES.has(bare)) return lower;
	// Elided particles keep their apostrophe in lower case: "dell'Annunziata", "d'Ascoli".
	const elided = /^(dell|dall|nell|sull|all|d)['’](\p{L}.*)$/u.exec(lower);
	if (elided && !first) return `${elided[1]}'${capitalizeRuns(elided[2] ?? "")}`;
	return capitalizeRuns(lower);
}

/** Capitalizes each run of letters (`sant'andrea` → `Sant'Andrea`, `g.tatarella` → `G.Tatarella`). */
function capitalizeRuns(lower: string): string {
	return lower.replace(/\p{L}+/gu, (run) => run.charAt(0).toUpperCase() + run.slice(1));
}

/**
 * A name in title case, Italian style ("OSPEDALE DI CHIAVENNA" → "Ospedale di Chiavenna",
 * "SANT'ANDREA" → "Sant'Andrea", "UNIVERSITA' GIORDA" → "Università Giorda"). A name that
 * already mixes cases is kept as written, accents restored; one written all in lower case is
 * cased too.
 */
export function titleCaseIt(raw: string): string {
	const value = restoreAccents(raw.replace(/\s+/g, " ").trim());
	if (!value) return "";
	const hasUpper = /\p{Lu}/u.test(value);
	const hasLower = /\p{Ll}/u.test(value);
	if (hasUpper && hasLower) {
		// Mixed case: the words written in capitals are cased ("Parafarmacia IL SORRISO").
		const mixed = value
			.split(" ")
			.map((word, index) =>
				/\p{Ll}/u.test(word) || !/[AEIOUÀÈÉÌÒÙ]/u.test(word) ? word : casedWord(word, index === 0),
			)
			.join(" ");
		return mixed.charAt(0).toUpperCase() + mixed.slice(1);
	}
	return value
		.split(" ")
		.map((word, index) => casedWord(word, index === 0))
		.join(" ");
}

/** Company forms (`S.N.C.`, `SRL`, `& C.`, `SOC. COOP.`): the name ends before them. */
const COMPANY_FORM =
	/(?:^|\s|(?<=\p{L}))(?:&\s*C\b\.?|S\.?\s?N\.?\s?C\b\.?|S\.?\s?A\.?\s?S\b\.?|S\.?\s?R\.?\s?L\.?\s?S?\b\.?|S\.?\s?P\.?\s?A\b\.?|SAPA\b|SOC\.?\s*COOP\b\.?|SOCIETA['`’]?\s+COOPERATIVA\b|S\.?C\.?A\.?R\.?L\b\.?|S\.C\.R\.L\b\.?|SCRL\b|O\.?H\.?G\b\.?|K\.?G\b\.?|G\.?M\.?B\.?H\b\.?)/iu;

/** A company form written with dots and glued to the name before it ("PEDROCCHIS.R.L"). */
const GLUED_FORM = /(?<=\p{L})(?:S\.N\.C|S\.A\.S|S\.R\.L|S\.P\.A)\.?(?=\s|$|\.)/iu;

/** A pharmacist's or doctor's title: what follows it is a person's name. */
const TITLE =
	/^(?:dott(?:\.|ori|ore|oressa|oresse|or)?|dr|dr\.|dr\.ssa|drssa|dott\.ssa|dottssa|dott\.ri|dr\.i|dott\.i|dott\.sse|dr\.sse|prof\.?(?:ssa)?)(?=\.|$|\p{L})/iu;

/** Words joining a place's name and its owner's ("DI", "DELLA DR.SSA"). */
const CONNECTORS: ReadonlySet<string> = new Set([
	"di",
	"del",
	"della",
	"dello",
	"dei",
	"delle",
	"degli",
	"des",
	"der",
]);

export type CleanName = {
	/** The name a page prints. */
	name: string;
	/** True when an owner's title or a company form (and what followed it) was left out. */
	stripped: boolean;
};

/**
 * A place's name without its owners: the text before a company form, and before a title
 * ("DR.", "DOTT.SSA") with the connector and surname just before it ("DI GALLO DOTT. MARIO").
 * A name that would be left empty keeps its words without the titles. Without `owners` (a
 * hospital's name), only the company form goes: a hospital named after a person keeps the name
 * ("Casa di Cura Prof. Petrucciani"), and so does a "di" ("Casa di Cura Villa dei Gerani").
 */
export function placeNameIt(raw: string, owners = true): CleanName {
	let value = raw.replace(/\s+/g, " ").trim();
	let stripped = false;
	const glued = GLUED_FORM.exec(value);
	if (glued) {
		value = `${value.slice(0, glued.index)} ${value.slice(glued.index)}`;
	}
	const form = COMPANY_FORM.exec(value);
	if (form && form.index > 0) {
		value = value.slice(0, form.index).trim();
		stripped = true;
		// "BOSIO DI GPHARMA1", "PERISSINOTTI DI GIOVANNI PERSINOTTI": a shop's owner after its
		// last "di", one word with digits or two to four words (a person's names, a company).
		const owner = owners ? /^(.*\S)\s+di\s+(\S+(?:\s+\S+){0,3})$/i.exec(value) : null;
		if (owner?.[1] && owner[2]) {
			const count = owner[2].split(" ").length;
			if (count >= 2 || /\d/.test(owner[2])) value = owner[1];
		}
	}
	const words = value.split(" ");
	const title = owners ? words.findIndex((word) => TITLE.test(word)) : -1;
	if (title >= 0) {
		let cut = title;
		for (let back = title - 1; back >= Math.max(1, title - 3); back--) {
			if (CONNECTORS.has((words[back] ?? "").toLowerCase())) {
				cut = back;
				break;
			}
		}
		const kept = words
			.slice(0, cut)
			.join(" ")
			.replace(/[\s,.;:–-]+$/, "");
		stripped = true;
		value =
			kept ||
			words
				.filter((word) => !TITLE.test(word))
				.join(" ")
				.trim();
	}
	return { name: value.replace(/[\s,;:–-]+$/, "").trim(), stripped };
}

/** "FARMACIA", "FARMACIE", "FARMA…", "APOTHEKE": the name already says it is a pharmacy. */
const PHARMACY_WORD = /farma|pharm|apothek/i;
/** "PARAFARMACIA", "PARA FARMACIA": the name already says it is a parapharmacy. */
const PARAPHARMACY_WORD = /para\s?-?farmac|parapharm/i;

/**
 * The name a pharmacy's page prints: its own name, in title case, after "Farmacia" when the
 * name does not say it ("SAN CARLO S.N.C." → "Farmacia San Carlo").
 */
export function pharmacyNameIt(raw: string): CleanName {
	const clean = placeNameIt(raw);
	const name = titleCaseIt(clean.name);
	if (!name) return { name: "Farmacia", stripped: clean.stripped };
	return {
		name: PHARMACY_WORD.test(name) ? name : `Farmacia ${lowerFirstParticle(name)}`,
		stripped: clean.stripped,
	};
}

/** The name a parapharmacy's page prints, after "Parafarmacia" when the name does not say it. */
export function parapharmacyNameIt(raw: string): CleanName {
	const clean = placeNameIt(raw);
	const name = titleCaseIt(clean.name);
	if (!name) return { name: "Parafarmacia", stripped: clean.stripped };
	return {
		name: PARAPHARMACY_WORD.test(name) ? name : `Parafarmacia ${lowerFirstParticle(name)}`,
		stripped: clean.stripped,
	};
}

/** The name a hospital's page prints ("CASA DI CURA VILLA BIANCA S.R.L." → "Casa di Cura Villa Bianca"). */
export function hospitalNameIt(raw: string): CleanName {
	const clean = placeNameIt(raw, false);
	return { name: titleCaseIt(clean.name), stripped: clean.stripped };
}

/** "Del Monumento" after "Farmacia" reads "Farmacia del Monumento". */
function lowerFirstParticle(name: string): string {
	const [first, ...rest] = name.split(" ");
	if (rest.length > 0 && first && PARTICLES.has(first.toLowerCase())) {
		return [first.toLowerCase(), ...rest].join(" ");
	}
	return name;
}

/** A street as published ("VIA BRIGATA CAGLIARI 39 ", "Via Buggianese, 108"), cased like a name. */
export function streetIt(raw: string): string | null {
	const value = raw.replace(/\s+/g, " ").trim();
	if (!value || value === "-") return null;
	return titleCaseIt(value);
}
