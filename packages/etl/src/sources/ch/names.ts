/**
 * Names, streets and keys of the Swiss lists. The lists write names as the facility names
 * itself, in its own language and case: they are kept as published, cleaned of what a page must
 * not show (a care-of address and what follows it, which can name a person) and of typographic
 * noise (soft hyphens, repeated spaces). Pure functions.
 */
import { slugifyDe } from "@apercura/core";

export type CleanName = { name: string; shortened: boolean };

/**
 * Where a care-of or attention marker starts: what follows it is an address or a person ("c/o
 * Gebert Rechtsanwälte AG", "a.c.a. sig. …", "z.H. Frau …", "à l'att. de …"), left out with it.
 */
const CARE_OF = /(?:^|[\s,])(?:c\/o|a\.c\.a\.|z\.\s?h\.|zhd\.|à l'att)(?=[\s.]|$)/i;

/**
 * A soft hyphen the spreadsheets keep: before a capital or a space it stands for a written hyphen
 * ("Fleisch\u00adStrasse", "Aus\u00ad und Weiterbildung"), elsewhere it is invisible.
 */
const SOFT_HYPHEN = /\u00ad(?=[\p{Lu}\s])/gu;

/** Zero-width characters, soft hyphens left and byte-order marks. */
const INVISIBLE = /[\u00ad\u200b-\u200d\ufeff]/g;

/** A list's text as a page prints it: invisible characters dropped, spaces collapsed. */
export function cleanText(value: string | null | undefined): string {
	return (value ?? "")
		.replace(SOFT_HYPHEN, "-")
		.replace(INVISIBLE, "")
		.replace(/[\u00a0\s]+/g, " ")
		.trim();
}

/**
 * A facility's name as its page prints it: the published name, without a care-of or attention
 * marker and what follows it (`shortened`), nor a trailing comma or dash.
 */
export function facilityNameCh(raw: string | null | undefined): CleanName {
	const text = cleanText(raw);
	const at = text.search(CARE_OF);
	let cut = at < 0 ? text : text.slice(0, at);
	while (/[\s,;–-]$/.test(cut)) cut = cut.slice(0, -1);
	return { name: cut || text, shortened: cut !== text && cut !== "" };
}

/** A street line as the list writes it (`Rämistrasse 100`), or null when there is none. */
export function streetCh(raw: string | null | undefined): string | null {
	const text = cleanText(raw).replace(/^-+$/, "");
	return text || null;
}

/**
 * The postcode and the locality of a `PLZ Ort` field (`5404 Baden`, `1213 Onex`,
 * `5630 Muri AG`): the four digits and the rest, or null when it does not start with a postcode.
 */
export function splitPostcodeLocality(
	raw: string | null | undefined,
): { postcode: string; locality: string } | null {
	const match = /^\s*(?:CH\s*-\s*)?([1-9]\d{3})\s+(.+?)\s*$/i.exec(cleanText(raw));
	if (!match) return null;
	return { postcode: match[1] ?? "", locality: match[2] ?? "" };
}

/**
 * A locality as the postcode directory names it, for matching: `Muri AG` is `Muri`, `Biel/Bienne`
 * is matched by either name, `St. Gallen` and `Sankt Gallen` alike.
 */
export function localityKey(value: string): string {
	return slugifyDe(
		cleanText(value)
			.replace(
				/\b(?:AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH)$/,
				"",
			)
			.replace(/\bSankt\b/gi, "St.")
			.replace(/\bSaint\b/gi, "St"),
	);
}

/**
 * Words a facility's name may carry that do not tell two facilities apart, for matching: legal
 * forms, kinds of facility, articles and prepositions of the market's languages.
 */
const NOISE =
	/\b(?:ag|sa|gmbh|sarl|sagl|stiftung|fondation|fondazione|verein|association|genossenschaft|cooperative|spital|spitaeler|hopital|hopitaux|ospedale|klinik|kliniken|clinique|clinica|standort|site|sede|pflegeheim|altersheim|alterszentrum|pflegezentrum|ems|home|residence|casa|de|la|le|les|l|d|du|des|di|del|della|im|am|an|der|die|das|und|et|e)\b/g;

/** A name reduced to the words that tell facilities apart, for matching across lists. */
export function nameMatchKeyCh(name: string): string {
	return slugifyDe(name).replace(/-/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
}

/**
 * A nine-digit key derived from what identifies a row of a list that gives no number (the FOPH's
 * hospital sites): FNV-1a over the parts, read as a number of 100,000,000–999,999,999, as the
 * Austrian lists' derived keys are. The same parts always give the same key, so a page keeps its
 * address from one run to the next while its list keeps the row.
 */
export function derivedKeyCh(parts: readonly string[]): string {
	const input = parts.map((part) => slugifyDe(part)).join("|");
	let hash = 0x811c9dc5;
	for (const byte of Buffer.from(input, "utf8")) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return String(100_000_000 + (hash % 900_000_000));
}
