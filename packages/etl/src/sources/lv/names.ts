/**
 * Names as the Latvian lists write them, made printable: whitespace and quotes tidied, the legal
 * form dropped (`, SIA`, `Sabiedrība ar ierobežotu atbildību`, `IK`, a sole trader's
 * `individuālais uzņēmums`…), a name written in capitals cased the Latvian way, and the keys the
 * places are matched with.
 */

/** Collapses whitespace and trims; tidies the space around commas. */
export function clean(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/\u00A0/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/,(?=\S)/g, ", ")
		.trim();
}

/** Every kind of double quote the lists use (`"`, `“`, `”`, `„`, `«`, `»`) read as one. */
const QUOTES = /["“”„«»]/g;

/** A comparison key: quotes unified, whitespace collapsed, lowercase. */
export const looseKey = (value: string) =>
	clean(value).replace(QUOTES, '"').toLocaleLowerCase("lv");

/**
 * Legal forms written after a comma at the end of a name (`Vesela ģimene, SIA`), or before it
 * (`SIA "Ārstu prakse"`), as the Register of Enterprises and the lists spell them.
 */
const LEGAL_FORMS = [
	"sabiedrība ar ierobežotu atbildību",
	"valsts sabiedrība ar ierobežotu atbildību",
	"pašvaldības sabiedrība ar ierobežotu atbildību",
	"medicīnas sabiedrība ar ierobežotu atbildību",
	"akciju sabiedrība",
	"valsts akciju sabiedrība",
	"individuālais komersants",
	"individuālais uzņēmums",
	"pašvaldības aģentūra",
	"pašvaldības sia",
	"valsts sia",
	"psia",
	"vsia",
	"sia",
	"as",
	"ik",
];

const SUFFIX_FORM = new RegExp(
	`,\\s*(?:${LEGAL_FORMS.map((form) => form.replace(/ /g, "\\s+")).join("|")})(?:\\s+rīgā)?\\s*$`,
	"iu",
);

const PREFIX_FORM = new RegExp(
	`^(?:${LEGAL_FORMS.map((form) => form.replace(/ /g, "\\s+")).join("|")})\\s+(?=\\S)`,
	"iu",
);

/**
 * A sole trader's legal name after a comma (`Rīgas pilsētas S.Pujātes individuālais uzņēmums
 * medicīniskā firma`, `J.Melkera individuālā ārstnieciski-profilaktiskā firma`): a form, not a
 * part of the practice's name.
 */
const SOLE_TRADER_SUFFIX = /,\s*[^,]*\bindividuāl(?:ais|ā)\b[^,]*$/iu;

/** Common Latvian nouns and adjectives of place names, written lowercase inside a name. */
const LOWERCASE_WORDS = new Set([
	"ģimenes",
	"ārsta",
	"ārstes",
	"ārstu",
	"prakse",
	"prakses",
	"klīnika",
	"doktorāts",
	"veselības",
	"centrs",
	"aptieka",
	"aptiekas",
	"filiāle",
	"slimnīca",
	"poliklīnika",
	"un",
	"medicīnas",
	"pilsētas",
	"novada",
	"pagasta",
	"individuālais",
	"uzņēmums",
	"privātprakse",
	"ambulance",
	"doktorāta",
]);

/**
 * A name written in capitals (`VESELĪBAS CENTRS BIĶERNIEKI`) cased the Latvian way: its first
 * word capitalised, common nouns lowercase, other words capitalised (`Veselības centrs
 * Biķernieki`); words of three letters or fewer (`MED`, `AP`, `SR`) keep their capitals, they are
 * usually initials. A name with any lowercase letter is kept as written.
 */
export function caseName(name: string): string {
	if (/\p{Ll}/u.test(name) || !/\p{Lu}{2}/u.test(name)) return name;
	let first = true;
	return name.replace(/\p{L}[\p{L}'’.-]*/gu, (word) => {
		const lower = word.toLocaleLowerCase("lv");
		const result =
			word.replace(/[^\p{L}]/gu, "").length <= 3
				? word
				: !first && LOWERCASE_WORDS.has(lower)
					? lower
					: lower.charAt(0).toLocaleUpperCase("lv") + lower.slice(1);
		first = false;
		return result;
	});
}

/**
 * The printable name of a medical institution or pharmacy owner: legal forms dropped at either
 * end (`Ilzes Paraugas ģimenes ārsta prakse, SIA` → `Ilzes Paraugas ģimenes ārsta prakse`,
 * `Sabiedrība ar ierobežotu atbildību Ārstu doktorāts` → `Ārstu doktorāts`), a sole trader's
 * legal name after a comma dropped, capitals cased. Never empty when the input is not: a name
 * that is only a form stays as written.
 */
export function institutionName(raw: string): string {
	// A legal form before a site in brackets (`Paraugu slimnīca, SIA(Balvi)`) leaves the site.
	const text = clean(
		raw
			.replace(/,\s*(?:p?sia|vsia|as)\s*\(([^)]+)\)\s*$/iu, " ($1)")
			// … and before a branch (`Paraugu slimnīca, SIA filiāle 3`).
			.replace(/,\s*(?:p?sia|vsia|as)\s+(?=filiāle\b)/iu, " "),
	);
	let name = text;
	for (let pass = 0; pass < 3; pass++) {
		const next = clean(
			name.replace(SUFFIX_FORM, "").replace(SOLE_TRADER_SUFFIX, "").replace(PREFIX_FORM, ""),
		);
		if (next === name) break;
		name = next;
	}
	name = name.replace(/[\s,]+$/, "");
	return caseName(name || text);
}

/**
 * The printable name of a pharmacy: the State Agency of Medicines writes its owner first
 * (`SIA “Paraugu aptiekas” Paraugu aptieka 12`), so the owner is dropped; a name that reads on
 * only with its owner (`… aptiekas filiāle "Ance"`) keeps the owner's name without its legal
 * form (`Paraugu aptiekas aptiekas filiāle "Ance"`).
 */
export function pharmacyName(objectName: string, ownerName: string): string {
	const name = clean(objectName);
	const owner = clean(ownerName);
	if (owner && looseKey(name).startsWith(looseKey(owner))) {
		const rest = clean(name.slice(owner.length).replace(/^[\s,–-]+/, ""));
		if (rest && /^\p{Lu}|^\d|^["“„]/u.test(rest)) return tidyPharmacyName(rest);
		if (rest) {
			const brand = institutionName(owner).replace(QUOTES, "").trim();
			return tidyPharmacyName(`${brand} ${rest}`);
		}
	}
	return tidyPharmacyName(name);
}

/**
 * An owner written before the pharmacy's name in another form than its own: in the genitive
 * (`Sabiedrības ar ierobežotu atbildību "Paraugs" Skuju aptieka`, `Ražošanas komercfirmas
 * "Paraugs" sabiedrības ar ierobežotu atbildību Skuju aptieka`), or a sole trader's legal name,
 * which names a person (`Paraugu pagasta Annas Paraugas individuālais uzņēmums "Paraugu
 * aptieka"`).
 */
const OWNER_BEFORE_NAME =
	/^.*?\b(?:sabiedrības ar ierobežotu atbildību|akciju sabiedrības|individuāl\S*(?:\s+\S+)?\s+uzņēmums)\s+(?:["“„][^"”“]*["”]\s+(?=\p{Lu}|\d))?/iu;

/** A pharmacy's name without its owner, legal form or enclosing quotes, cased. */
function tidyPharmacyName(raw: string): string {
	let name = clean(raw);
	const rest = clean(name.replace(OWNER_BEFORE_NAME, ""));
	if (rest && rest !== name) name = rest;
	// A form left inside the name (`"Paraugu aptieka" SIA`, `PARAUGS, SIA aptieka - 63`).
	name = clean(name.replace(/(?:,\s*|\s+)(?:SIA|AS|IK)(?=\s|$)/gu, ""));
	name = institutionName(name);
	const quoted = /^["“„](.*)["”]$/u.exec(name);
	if (quoted?.[1] && !/["“”„]/u.test(quoted[1])) name = clean(quoted[1]);
	return caseName(name);
}

/** A GP's name as a page prints it: first name, then family name (`Ilze Parauga`). */
export function personName(firstName: string, lastName: string): string {
	return clean(`${clean(firstName)} ${clean(lastName)}`);
}

/**
 * The key a territory is matched with: its standard name in the address register's abbreviated
 * form (`Ādažu pag., Ādažu nov.`), quotes and case ignored.
 */
export function territoryKey(value: string): string {
	return looseKey(value)
		.replace(/\bnovads\b/g, "nov.")
		.replace(/\bpagasts\b/g, "pag.")
		.replace(/\.\s*,/g, ".,");
}

/** The abbreviated form of a municipality's or parish's name (`Ādažu novads` → `Ādažu nov.`). */
export function shortTerritoryName(name: string): string {
	return clean(name)
		.replace(/ novads$/u, " nov.")
		.replace(/ pagasts$/u, " pag.");
}
