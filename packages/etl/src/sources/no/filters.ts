/**
 * What the Norwegian import keeps of the register's establishments, and how it prints them.
 *
 * The Central Coordinating Register for Legal Entities is a business register: an industry code
 * is what an undertaking declared, not a licence. A one-doctor company declares general practice
 * and so do holding, consulting and locum companies; a health trust registers its purchasing,
 * IT and building units under hospital codes. An establishment is kept only when it reads as a
 * place of care (`exclusionOf`, in this order):
 *
 * 1. its owner (the main entity) is known and is not a sole proprietorship (enkeltpersonforetak,
 *    `ENK`): a sole proprietorship is named after its owner, a person, and NLOD 2.0 § 3 does not
 *    cover personal data without a lawful basis; Apercura lists establishments, not people;
 * 2. neither it nor its owner is closed, bankrupt or being wound up;
 * 3. it has a location address in Norway;
 * 4. its name names no holding, investment, consulting, property, locum or administrative unit;
 * 5. its name is not a person's practice (`Lege Ola Nordmann AS`, `Dr. Hansen AS`,
 *    `Øyelege Kari Nordmann AS`, `Tannlegene Hansen og Berg`): a word naming a profession alone,
 *    never part of a compound (`legesenter`, `øyelegekontor` are fine), or the plural first;
 * 6. a practice (general, emergency, specialist or dental care) owned by anyone but a public
 *    body or a foundation names a place of care (`legesenter`, `klinikk`, `tannlegesenter`…);
 *    a pharmacy names an `apotek`.
 *
 * Names are printed re-cased (the register writes capitals only), the trailing company form
 * dropped; an address line that is a care-of line (`c/o …`, which may name a person) is never
 * kept.
 */
import { clean } from "./text";

/**
 * Owners whose establishments are kept without a care word in their name: municipalities and
 * their units (`KOMM`, `ORGL`, `KF`), counties (`FYLK`, `FKF`), the state and its health trusts
 * (`STAT`, `SF`, `SÆR`, a helseforetak is a special-law company), inter-municipal companies
 * (`IKS`), the Church (`KIRK`) and foundations (`STI`).
 */
export const PUBLIC_OWNER_FORMS: ReadonlySet<string> = new Set([
	"KOMM",
	"ORGL",
	"KF",
	"FYLK",
	"FKF",
	"STAT",
	"SF",
	"SÆR",
	"IKS",
	"KIRK",
	"STI",
]);

/** The kinds whose establishments must name a place of care unless a public body owns them. */
const PRACTICE_KINDS: ReadonlySet<string> = new Set([
	"NO_GP",
	"NO_EMERGENCY",
	"NO_SPECIALIST",
	"NO_DENTAL",
]);

/** Units that are not places of care, whatever code they registered. */
const NOT_CARE =
	/holding|invest|consult|konsult|eiendom|kapital|vikar|management|rådgiv|regnskap|utleie|hovedkontor|administrasjon|\badm\b|kontortjenest|driftsservice|innkjøp|\bikt\b|sykehusbygg|sykehuspartner|pasientreiser|\bhemit\b|\bstab\b|prosjekt|\blager\b|vaskeri|konkursbo|avvikling/iu;

/**
 * A word naming a profession or a title on its own: a person's practice. Compounds
 * (`legesenter`, `tannlegevakt`, `øyelegekontor`) never match.
 */
const PERSON_WORD =
	/^(?:\p{L}*lege|dr|doktor|psykiater|psykolog|spesialist|kjeveortoped|kiropraktor|fysioterapeut|jordmor)$/u;

/** Words naming a place of care in a practice's name. */
const CARE_PLACE =
	/lege(?:senter|kontor|vakt|grupp|samarbeid|tjenest|tenest|hus|klinikk|praksis|ne\b)|fastleg|helse(?:senter|hus)|medisinsk(?:e)? senter|klinikk|sykehus|sjukehus|tannlege(?:senter|kontor|praksis|klinikk|huset|ne\b|r\b)|tannklinikk|tannhelse|tannsenter|tannregulering|kjeveortopedisk|spesialistsenter|spesialistklinikk|spesialistene|legespesialist|øyelegekontor|øyeleger|øyesenter|\bdps\b|poliklinikk/iu;

/** A pharmacy's name. */
const PHARMACY_NAME = /apotek/iu;

/** Words of a name split on spaces and punctuation, lower-cased. */
const words = (name: string) =>
	name
		.toLowerCase()
		.split(/[\s.,&/()]+/u)
		.filter(Boolean);

/**
 * A practice named after its doctors or dentists: `Legene Hansen og Olsen`, `Tannlegene Berg`
 * (the plural at the start, then a name, not a preposition: `Tannlegene i Sentrum` is a place).
 */
const NAMED_PARTNERS = /^(?:tann)?leg[ae]ne\s+(?!(?:i|på|ved|og|for|til|på)\s)\S/iu;

/** True when the name reads as a person's practice (`Lege Ola Nordmann AS`, `Legene Hansen og Olsen`). */
export function namedAfterPerson(name: string): boolean {
	return NAMED_PARTNERS.test(name.trim()) || words(name).some((word) => PERSON_WORD.test(word));
}

export type Candidate = {
	name: string;
	kind: string;
	ownerForm: string | null;
	closed: boolean;
	ownerWindingUp: boolean;
	hasAddress: boolean;
};

/** Why an establishment is left out, or null when it is kept (the reasons of `stats.skipped`). */
export function exclusionOf(candidate: Candidate): string | null {
	if (candidate.ownerForm === null) return "owner-unknown";
	if (candidate.ownerForm === "ENK") return "sole-proprietorship";
	if (candidate.closed) return "closed";
	if (candidate.ownerWindingUp) return "winding-up";
	if (!candidate.hasAddress) return "no-address";
	if (NOT_CARE.test(candidate.name)) return "not-a-place-of-care";
	if (namedAfterPerson(candidate.name)) return "named-after-a-person";
	if (candidate.kind === "NO_PHARMACY" && !PHARMACY_NAME.test(candidate.name)) {
		return "not-a-pharmacy";
	}
	if (
		PRACTICE_KINDS.has(candidate.kind) &&
		!PUBLIC_OWNER_FORMS.has(candidate.ownerForm) &&
		!CARE_PLACE.test(candidate.name)
	) {
		return "no-place-of-care-in-name";
	}
	return null;
}

/** Norwegian company forms dropped at the end of a name. */
const TRAILING_FORM = /[\s,]+(?:AS|ASA|DA|ANS|NUF|SA|STI|BA|KF|IKS|FKF)\.?$/u;

/** Abbreviations kept in capitals when a name is re-cased. */
const KEPT_CAPITALS = new Set([
	"AS",
	"HF",
	"RHF",
	"DPS",
	"BUP",
	"TSB",
	"ØNH",
	"IKS",
	"KF",
	"LAR",
	"MR",
	"CT",
	"KAD",
	"ØH",
	"VOP",
	"ACT",
	"FACT",
	"ABC",
	"NAV",
	"UNN",
	"OUS",
	"AHUS",
	"SUS",
]);

/** Words written in lower case inside a name. */
const LOWER_WORDS = new Set(["og", "i", "på", "for", "av", "til", "ved", "med", "under", "om"]);

/** True when the text has letters and none of them is lower-case. */
const allCapitals = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

/** A word in capitals re-cased (`ØRE-NESE-HALS` → `Øre-nese-hals`), an abbreviation kept. */
function recaseWord(word: string, first: boolean): string {
	if (KEPT_CAPITALS.has(word.replace(/[^\p{L}]+$/u, ""))) return word;
	const lower = word.toLowerCase();
	if (lower === "avd" || lower === "avd.") return "avd.";
	if (!first && LOWER_WORDS.has(lower)) return lower;
	return lower.replace(/^(\P{L}*)(\p{L})/u, (_, lead: string, letter: string) => {
		return `${lead}${letter.toUpperCase()}`;
	});
}

/**
 * The name a page prints: the trailing company form dropped (`EKSEMPEL LEGESENTER AS` →
 * `Eksempel Legesenter`), a name in capitals re-cased word by word, connectives in lower case
 * and abbreviations kept (`HELSE BERGEN HF AVD VOSS` → `Helse Bergen HF avd. Voss`).
 */
export function displayName(raw: string): string {
	const name = clean(raw).replace(TRAILING_FORM, "").trim() || clean(raw);
	if (!allCapitals(name)) return name;
	return name
		.split(" ")
		.map((word, index) => recaseWord(word, index === 0))
		.join(" ");
}

/** A post town in capitals re-cased (`JESSHEIM` → `Jessheim`, `MO I RANA` → `Mo i Rana`). */
export function displayTown(raw: string | null | undefined): string | null {
	const town = clean(raw);
	if (!town) return null;
	return allCapitals(town)
		? town
				.split(" ")
				.map((word, index) => recaseWord(word, index === 0))
				.join(" ")
		: town;
}

/** A care-of line (`c/o Kari Nordmann`, `C/O EKSEMPEL AS`, `co …`). */
const CARE_OF = /^(?:c\s*\/\s*o|c\.o\.|co)\b/iu;

/** A line that says where in a building (`2. etasje`, `Inngang C`, `Bygg 2`), not the street. */
const FLOOR_OR_ENTRANCE =
	/\b(?:etasje|etg|inngang|oppgang|bygg|plan|underetasje|kjeller)\b|^\d+\s*\.?\s*(?:etasje|etg)/iu;

/** A street and its number (`Ragnar Strøms veg 10`, `Storgata 33A`, `Tunveien 5 - 7`). */
const STREET_AND_NUMBER = /^\p{L}[\p{L}\d .'’-]* \d+\s*\p{L}?(?:\s*-\s*\d+\s*\p{L}?)?$/u;

/**
 * The street line of a location address the register writes in one or more lines: care-of
 * lines are dropped (counted), then lines naming a floor, an entrance or a building, then the
 * first line that is a street and number, else the first with a number, else the first left (a
 * building or a farm name). Null when nothing is left.
 */
export function streetOf(lines: readonly string[]): { street: string | null; careOf: number } {
	const kept: string[] = [];
	let careOf = 0;
	for (const raw of lines) {
		const line = clean(raw);
		if (!line) continue;
		if (CARE_OF.test(line)) {
			careOf++;
			continue;
		}
		kept.push(line);
	}
	const streets = kept.filter((line) => !FLOOR_OR_ENTRANCE.test(line));
	return {
		street:
			streets.find((line) => STREET_AND_NUMBER.test(line)) ??
			streets.find((line) => /\d/.test(line)) ??
			streets[0] ??
			kept[0] ??
			null,
		careOf,
	};
}
