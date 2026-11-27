/**
 * Names and addresses of the Estonian providers and pharmacies. The registers write a provider
 * under its registered company name ("Medicum Perearstikeskus OÜ", "Sihtasutus Ida-Viru
 * Keskhaigla", "SIHTASUTUS AHTME HAIGLA"): a page prints the provider, not its company form, so
 * the legal form at the start or end of the name is dropped (as Germany's import drops "GmbH"),
 * and a name the register writes in capitals only is re-cased word by word. Nothing else is
 * re-spelled.
 *
 * Addresses are the address data system's normalized full addresses (`Tartu maakond, Tartu linn,
 * Tartu linn, Ülase tn 16`): county, municipality, settlement (absent when the municipality is
 * a single town: `Harju maakond, Keila linn, Pargi tn 2b`), then the street and number.
 */
import { createHash } from "node:crypto";

/** Collapses whitespace and trims. */
export const clean = (value: string | null | undefined) =>
	(value ?? "").replace(/\s+/g, " ").trim();

/**
 * Estonian legal forms, as abbreviated and written out: private limited company (OÜ,
 * osaühing), public limited company (AS, aktsiaselts), foundation (SA, sihtasutus), non-profit
 * association (MTÜ, mittetulundusühing), general and limited partnership (TÜ, täisühing; UÜ,
 * usaldusühing), commercial association (tulundusühistu) and sole trader (FIE).
 */
const FORMS =
	"OÜ|AS|SA|MTÜ|TÜ|UÜ|FIE|osaühing|aktsiaselts|sihtasutus|mittetulundusühing|täisühing|usaldusühing|tulundusühistu|füüsilisest isikust ettevõtja";

const LEADING_FORM = new RegExp(`^(?:${FORMS})(?=\\s)\\s*`, "iu");
const TRAILING_FORM = new RegExp(`[\\s,]+(?:${FORMS})\\s*$`, "iu");

/** Abbreviations kept in capitals when a name is re-cased. */
const KEPT_CAPITALS = new Set(["OÜ", "AS", "SA", "MTÜ", "TÜ", "UÜ", "FIE", "EMO", "HIV", "TÜK"]);

/** True when the text has letters and none of them is lower-case. */
const allCapitals = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

/** A word in capitals re-cased (`KOHTLA-JÄRVE` → `Kohtla-Järve`), an abbreviation kept. */
function recaseWord(word: string): string {
	if (KEPT_CAPITALS.has(word)) return word;
	return word
		.split("-")
		.map((part) => (part ? `${part.charAt(0)}${part.slice(1).toLocaleLowerCase("et")}` : part))
		.join("-");
}

/**
 * The name a page prints: the register's name without its legal form (`Medicum Perearstikeskus
 * OÜ` → `Medicum Perearstikeskus`, `Sihtasutus Ida-Viru Keskhaigla` → `Ida-Viru Keskhaigla`), a
 * name in capitals only re-cased (`SIHTASUTUS AHTME HAIGLA` → `Ahtme Haigla`). A name that is a
 * legal form only keeps it.
 */
export function providerName(raw: string): string {
	const text = clean(raw);
	let name = text;
	for (let previous = ""; previous !== name; ) {
		previous = name;
		name = name
			.replace(LEADING_FORM, "")
			.replace(TRAILING_FORM, "")
			.replace(/^[\s,]+|[\s,]+$/g, "");
	}
	if (!name) name = text;
	return allCapitals(name) ? name.split(" ").map(recaseWord).join(" ") : name;
}

/** Lower-case letters and digits, the way two names are compared (`õ` stays `o`). */
export const nameKey = (value: string) =>
	value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.replace(/[^a-z0-9]+/g, "");

/**
 * The first of several addresses written as one (`Aia tn 7 // Uus tn 12` → `Aia tn 7`), without
 * a trailing postcode (`…, Ülase tn 16, 50412` → `…, Ülase tn 16`).
 */
export function firstAddress(raw: string): string {
	const first = clean(raw.split("//")[0]).replace(/[\s,]+$/, "");
	return first.replace(/,\s*\d{5}$/, "");
}

/** An address the way two addresses are compared: lower-case, single spaces, no space before a comma. */
export const addressKey = (value: string) =>
	clean(value)
		.toLocaleLowerCase("et")
		.replace(/\s*,\s*/g, ", ");

/** The parts of a full address, split on commas: county, municipality, then the rest. */
export type AddressParts = {
	county: string;
	municipality: string;
	/** What follows the municipality: the settlement (when written), then the street and number. */
	rest: string[];
};

/**
 * Splits a full address, or null when it does not start with a county and a municipality
 * (`Eesti Vabariik (mobiilne oftalmoloogia kabinet)`, a mobile unit, a vehicle).
 */
export function addressParts(address: string): AddressParts | null {
	const parts = address
		.split(",")
		.map((part) => clean(part))
		.filter(Boolean);
	const [county, municipality, ...rest] = parts;
	if (!county || !municipality || !/ maakond$/.test(county)) return null;
	return { county, municipality, rest };
}

/** The kind word of an EHAK settlement's name (`Tartu linn`, `Haabneeme alevik`, `Kesklinna linnaosa`). */
export function settlementKind(
	name: string,
): "linn" | "alev" | "alevik" | "küla" | "linnaosa" | null {
	const match = / (linn|alev|alevik|küla|linnaosa)$/.exec(name);
	return (match?.[1] as "linn" | "alev" | "alevik" | "küla" | "linnaosa" | undefined) ?? null;
}

/**
 * The place an address prints after its postcode, as people write it: a town without the word
 * "linn" (`Tartu linn` → `Tartu`, `Kuressaare linn` → `Kuressaare`), a city district by its city
 * (`Kesklinna linnaosa` of Tallinn → `Tallinn`, `Ahtme linnaosa` → `Kohtla-Järve`), a small town
 * or village as named (`Haabneeme alevik`, `Koipsi küla`).
 */
export function cityLabel(settlement: string, municipality: string): string {
	const kind = settlementKind(settlement);
	if (kind === "linnaosa") return municipality.replace(/ linn$/, "");
	if (kind === "linn") return settlement.replace(/ linn$/, "");
	return settlement;
}

/**
 * A place of activity's key within its provider: ten hexadecimal digits of the SHA-256 of its
 * address, compared without case and spacing, so two runs give the same key.
 */
export function locationKey(address: string): string {
	return createHash("sha256").update(addressKey(address)).digest("hex").slice(0, 10);
}
