/**
 * The name a Lithuanian page prints: the institution's legal name as the licence register gives
 * it (its official name), whitespace collapsed and its legal form written the way Lithuanians
 * abbreviate it ("Uždaroji akcinė bendrovė „Pavyzdys“" → "UAB „Pavyzdys“"). Nothing is added
 * and nothing else removed: an individual enterprise's or a small partnership's name can name
 * its owner, which the privacy notice says (article 14) and an objection resolves.
 */

/** Legal forms written in full at the start of a name, and their abbreviations. */
const LEADING_FORMS: readonly [RegExp, string][] = [
	[/^uždaroji akcinė bendrovė(?=[\s,„“"]|$)/iu, "UAB"],
	[/^akcinė bendrovė(?=[\s,„“"]|$)/iu, "AB"],
	[/^viešoji įstaiga(?=[\s,„“"]|$)/iu, "VšĮ"],
	[/^mažoji bendrija(?=[\s,„“"]|$)/iu, "MB"],
	[/^biudžetinė įstaiga(?=[\s,„“"]|$)/iu, "BĮ"],
	[/^individuali įmonė(?=[\s,„“"]|$)/iu, "IĮ"],
	[/^valstybės įmonė(?=[\s,„“"]|$)/iu, "VĮ"],
	[/^savivaldybės įmonė(?=[\s,„“"]|$)/iu, "SĮ"],
];

/** Legal forms written in full at the end of a name ("Pavyzdžio individuali įmonė"). */
const TRAILING_FORMS: readonly [RegExp, string][] = [
	[/(?:^|\s)individuali įmonė$/iu, "IĮ"],
	[/(?:^|\s)uždaroji akcinė bendrovė$/iu, "UAB"],
	[/(?:^|\s)viešoji įstaiga$/iu, "VšĮ"],
	[/(?:^|\s)mažoji bendrija$/iu, "MB"],
];

/** The name with its whitespace collapsed (non-breaking spaces and doubled spaces). */
export function tidyName(raw: string): string {
	return raw
		.replace(/[\s ]+/g, " ")
		.replace(/\s+([,.])/g, "$1")
		.trim();
}

/**
 * The registered name with its legal form abbreviated, and whether one was. A form must be
 * followed by a space, a quote or the end, so a name that merely starts like one stays whole.
 */
export function ltDisplayName(raw: string): { name: string; abbreviated: boolean } {
	const name = tidyName(raw);
	for (const [pattern, abbreviation] of LEADING_FORMS) {
		if (pattern.test(name)) {
			const rest = name.replace(pattern, "").trim();
			if (!rest) return { name, abbreviated: false };
			return { name: `${abbreviation} ${rest}`, abbreviated: true };
		}
	}
	for (const [pattern, abbreviation] of TRAILING_FORMS) {
		if (pattern.test(name)) {
			const rest = name.replace(pattern, "").trim();
			if (!rest) return { name, abbreviated: false };
			return { name: `${rest} ${abbreviation}`, abbreviated: true };
		}
	}
	return { name, abbreviated: false };
}

/** VASPVT's legal-form codes of an individual enterprise (its branch and representation too). */
const INDIVIDUAL_ENTERPRISE_FORMS: ReadonlySet<string> = new Set(["810", "811", "812"]);

/**
 * True for an individual enterprise (individuali įmonė): one natural person's business, under
 * their name. Read from the legal-form code when the register gives one, else from the name.
 */
export function isIndividualEnterprise(legalForm: string | null, name: string): boolean {
	if (legalForm && INDIVIDUAL_ENTERPRISE_FORMS.has(legalForm.trim())) return true;
	const tidy = tidyName(name);
	return (
		/(?:^|\s)individuali įmonė$/iu.test(tidy) || /(?:^|\s)IĮ$/u.test(tidy) || /^IĮ\s/u.test(tidy)
	);
}

/**
 * A street without its premises number: "Pavyzdžio g. 5-207" → "Pavyzdžio g. 5",
 * "Pavyzdžio g. 3-114, 115" → "Pavyzdžio g. 3". The building is enough to find the place; an
 * individual enterprise's premises can be its owner's home. Null when nothing was removed.
 */
export function withoutPremises(street: string): string | null {
	const match = /^(.*?\d+[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]?)\s*[-–]\s*\d.*$/u.exec(street);
	if (!match?.[1]) return null;
	return match[1].trim();
}
