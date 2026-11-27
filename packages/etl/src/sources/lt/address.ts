/**
 * Placing a Lithuanian activity address. VASPVT writes each one as free text, in two styles:
 *
 *   Klaipėdos apskr. Klaipėdos miesto sav. Klaipėdos m. Taikos pr. 5-207
 *   Kauno m.sav., Kauno m., Kovo 11-osios g. 22
 *
 * that is the county (optional), the municipality ("<genitive> miesto|rajono sav.", or
 * "<genitive> m.|r. sav.", or "<genitive> sav."), an eldership (optional, "<genitive> sen."), the
 * settlement in the genitive with its type ("Klaipėdos m.", "Juodupės mstl.", "Petronių k."),
 * sometimes in the nominative ("Kaunas", "Žeimelis"), then the street. The Address Register's
 * text tables (municipalities, elderships, settlements, each with its genitive name) tell which
 * settlement it is: a settlement two villages of one municipality share is told apart by its
 * eldership, else the address is placed in its municipality only.
 */

/** A municipality of the Address Register. */
export type LtMunicipality = {
	/** The store's id (`_id`), as references to it are written. */
	id: string;
	/** `sav_kodas` (`13`). */
	code: string;
	/** As the register names it: `Vilniaus miesto`, `Kauno rajono`, `Birštono`. */
	name: string;
	/** The county's store id. */
	countyId: string;
};

export type LtEldership = { id: string; code: string; name: string; municipalityId: string };

export type LtSettlement = {
	/** `gyv_kodas` (`31003`). */
	code: string;
	/** Type abbreviation: `m.`, `mstl.`, `k.`, `vs.`, `glž. st.`. */
	type: string;
	/** Genitive (`Vilniaus`), as addresses write it before the type. */
	genitive: string;
	/** Nominative (`Vilnius`), as a page prints it. */
	name: string;
	municipalityId: string;
	eldershipId: string | null;
};

export type LtAddressTables = {
	municipalities: LtMunicipality[];
	elderships: LtEldership[];
	/** Current settlements only. */
	settlements: LtSettlement[];
};

export type PlacedAddress = {
	municipality: LtMunicipality;
	settlement: LtSettlement | null;
	street: string | null;
	postcode: string | null;
};

const key = (text: string) =>
	text
		.toLocaleLowerCase("lt")
		.replace(/[„“”"]/g, "")
		.replace(/\s+/g, " ")
		.trim();

/** The kind a municipality's name ends with: `m` (miesto), `r` (rajono) or none. */
function municipalityParts(name: string): { base: string; kind: "m" | "r" | "" } {
	const match = /^(.*?)\s+(miesto|rajono)$/u.exec(name.trim());
	if (!match?.[1]) return { base: key(name), kind: "" };
	return { base: key(match[1]), kind: match[2] === "miesto" ? "m" : "r" };
}

const SETTLEMENT_TYPES = ["glž. st.", "mstl.", "vs.", "m.", "k."];

/** A settlement type as an address writes it (`m.`, `mstl.`…). */
const SETTLEMENT_TOKEN = /^(.+?)\s(glž\.\s?st\.|mstl\.|vs\.|m\.|k\.)(?=[\s,]|$)[\s,]*/u;

/** "<Name> [miesto|rajono|m.|r.] sav." with a name of one or two capitalised words. */
const MUNICIPALITY_TOKEN =
	/(\p{Lu}[\p{L}-]*(?:\s\p{Lu}[\p{L}-]*)?)\s(?:(miesto|m\.|rajono|r\.)\s?)?sav\.?(?=[\s,]|$)/gu;

const ELDERSHIP_TOKEN = /^(.+?)\s(?:sen\.|seniūnija)(?=[\s,]|$)[\s,]*/u;

/** The text tidied: whitespace collapsed, `m.sav.` and `r.sav.` spaced, stray commas joined. */
export function tidyAddress(raw: string): string {
	return raw
		.replace(/[\s ]+/g, " ")
		.replace(/\b(m|r)\.{0,2}\s?sav\b\.?/gu, "$1. sav.")
		.replace(/\s+,/g, ",")
		.replace(/,{2,}/g, ",")
		.trim();
}

/** The street as a page prints it: separators trimmed, a postcode taken out. */
function streetOf(rest: string): { street: string | null; postcode: string | null } {
	let text = rest.replace(/^[\s,]+|[\s,]+$/g, "");
	let postcode: string | null = null;
	const code = /(?:,\s*)?\bLT[-\s]?(\d{5})\b/u.exec(text);
	if (code) {
		postcode = `LT-${code[1]}`;
		text = text.replace(code[0], "").replace(/^[\s,]+|[\s,]+$/g, "");
	}
	return { street: text || null, postcode };
}

export class LtAddressIndex {
	private readonly municipalities = new Map<string, LtMunicipality[]>();
	private readonly elderships = new Map<string, LtEldership>();
	private readonly byGenitive = new Map<string, LtSettlement[]>();
	private readonly byName = new Map<string, LtSettlement[]>();
	/** The cities (`m.`) of the country by genitive and by name: their names are unique. */
	private readonly cities = new Map<string, LtSettlement[]>();
	private readonly municipalityById = new Map<string, LtMunicipality>();

	constructor(tables: LtAddressTables) {
		for (const municipality of tables.municipalities) {
			const { base } = municipalityParts(municipality.name);
			const list = this.municipalities.get(base) ?? [];
			list.push(municipality);
			this.municipalities.set(base, list);
		}
		for (const eldership of tables.elderships) {
			this.elderships.set(`${eldership.municipalityId}|${key(eldership.name)}`, eldership);
		}
		for (const settlement of tables.settlements) {
			const genitive = `${settlement.municipalityId}|${key(settlement.genitive)}|${settlement.type.replace(/\s+/g, "")}`;
			this.byGenitive.set(genitive, [...(this.byGenitive.get(genitive) ?? []), settlement]);
			const name = `${settlement.municipalityId}|${key(settlement.name)}`;
			this.byName.set(name, [...(this.byName.get(name) ?? []), settlement]);
			if (settlement.type === "m.") {
				for (const word of new Set([key(settlement.genitive), key(settlement.name)])) {
					this.cities.set(word, [...(this.cities.get(word) ?? []), settlement]);
				}
			}
		}
		for (const municipality of tables.municipalities) {
			this.municipalityById.set(municipality.id, municipality);
		}
	}

	/** The municipality a name and its kind written in an address name, or null. */
	municipalityOf(name: string, written: string | undefined): LtMunicipality | null {
		const candidates = this.municipalities.get(key(name)) ?? [];
		const kind = written?.startsWith("m") ? "m" : written?.startsWith("r") ? "r" : "";
		const exact = candidates.filter(
			(municipality) => municipalityParts(municipality.name).kind === kind,
		);
		if (exact.length === 1) return exact[0] ?? null;
		// "Birštono m. sav." for "Birštono sav.", or a kind left out where only one exists.
		return candidates.length === 1 ? (candidates[0] ?? null) : null;
	}

	/**
	 * Places an address, or null when neither its municipality nor a city can be told. A city
	 * (`m.`) the address names outside the municipality it writes, or without one, is taken
	 * from the whole country (city names are unique): "Klaipėdos m. sav., Gargždų m." is in
	 * Klaipėdos rajono savivaldybė.
	 */
	place(raw: string): PlacedAddress | null {
		const text = tidyAddress(raw);
		let municipality: LtMunicipality | null = null;
		let rest = text;
		for (const match of text.matchAll(MUNICIPALITY_TOKEN)) {
			const words = (match[1] ?? "").split(" ");
			const found =
				this.municipalityOf(words.join(" "), match[2]) ??
				(words.length > 1 ? this.municipalityOf(words.at(-1) ?? "", match[2]) : null);
			if (found) {
				municipality = found;
				rest = text.slice((match.index ?? 0) + match[0].length);
				break;
			}
		}
		rest = rest.replace(/^[\s,]+/, "");

		let eldership: LtEldership | null = null;
		const elder = ELDERSHIP_TOKEN.exec(rest);
		if (elder?.[1] && !/\d/.test(elder[1])) {
			eldership = municipality
				? (this.elderships.get(`${municipality.id}|${key(elder[1])}`) ?? null)
				: null;
			rest = rest.slice(elder[0].length);
		}

		let settlement: LtSettlement | null = null;
		const token = SETTLEMENT_TOKEN.exec(rest);
		if (token?.[1] && token[2] && !/\d/.test(token[1])) {
			const type = token[2].replace(/\s+/g, "");
			const name = key(token[1]);
			let candidates: LtSettlement[] = [];
			if (municipality) {
				candidates = this.byGenitive.get(`${municipality.id}|${name}|${type}`) ?? [];
				if (candidates.length === 0) {
					// A settlement whose type changed (a village that became a town).
					candidates = SETTLEMENT_TYPES.flatMap(
						(other) =>
							this.byGenitive.get(`${municipality?.id}|${name}|${other.replace(/\s+/g, "")}`) ?? [],
					);
				}
				if (candidates.length === 0)
					candidates = this.byName.get(`${municipality.id}|${name}`) ?? [];
			}
			if (candidates.length === 0 && type === "m.") candidates = this.cities.get(name) ?? [];
			settlement = this.pick(candidates, eldership);
			// A settlement not told apart stays in the street: the page still says which village.
			if (settlement) rest = rest.slice(token[0].length);
		}
		if (!settlement) {
			// The nominative, alone before the street ("Kaunas, Vasarvietės g. 9D").
			const first = /^([^,\d]+?)\s*(?:,|$)\s*/u.exec(rest);
			if (first?.[1]) {
				const name = key(first[1]);
				const candidates =
					(municipality ? this.byName.get(`${municipality.id}|${name}`) : undefined) ??
					this.cities.get(name) ??
					[];
				// A name without its type is the town's when a village shares it (Lazdijai the
				// city, Lazdijai the village of the same municipality).
				const town =
					candidates.filter((item) => item.type === "m.").length === 1
						? candidates.filter((item) => item.type === "m.")
						: candidates.filter((item) => item.type === "mstl.").length === 1
							? candidates.filter((item) => item.type === "mstl.")
							: candidates;
				const picked = this.pick(town, eldership);
				if (picked) {
					settlement = picked;
					rest = rest.slice(first[0].length);
				}
			}
		}
		if (settlement) {
			municipality = this.municipalityById.get(settlement.municipalityId) ?? municipality;
			// A stray repetition of the settlement ("Šiaulių m., Šiaulių, Aušros al. 40").
			const again = /^([^,\d]+?)\s*,\s*/u.exec(rest);
			if (
				again?.[1] &&
				(key(again[1]) === key(settlement.genitive) || key(again[1]) === key(settlement.name))
			) {
				rest = rest.slice(again[0].length);
			}
		}
		if (!municipality) return null;
		return { municipality, settlement, ...streetOf(rest) };
	}

	private pick(candidates: LtSettlement[], eldership: LtEldership | null): LtSettlement | null {
		if (candidates.length === 1) return candidates[0] ?? null;
		if (candidates.length > 1 && eldership) {
			const inEldership = candidates.filter((item) => item.eldershipId === eldership.id);
			if (inEldership.length === 1) return inEldership[0] ?? null;
		}
		return null;
	}
}

export { SETTLEMENT_TYPES };
