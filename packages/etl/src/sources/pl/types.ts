/**
 * The shape the Polish register is parsed into: one row per healthcare establishment (zakład
 * leczniczy) of the healthcare entities (podmioty lecznicze) of RPWDL, with its places of care
 * and its cells, ready for the merge (`../../merge-pl.ts`).
 */

/** The register, as named in `stats.sources` and the guards. */
export const PL_SOURCE_ID = "rpwdl";

/** `directory.sites.source` and `directory.activities.source` of the Polish rows. */
export const PL_SITE_SOURCE = "pl-rpwdl";

/** A place of care of an establishment: the address of one or more of its units or cells. */
export type PlSite = {
	/** Stable within the establishment: a hash of its address (`290629:3f2a9c01d4`). */
	key: string;
	/** Street and number (`Zdrojowa 39`), or the locality and number where there is no street. */
	street: string | null;
	/** Written form (`57-320`), or null. */
	postcode: string | null;
	/** Locality as the register writes it (`Polanica-Zdrój`). */
	city: string;
	/** TERYT code of the gmina (seven digits, `0208051`), the parts of a city read as the city. */
	gminaCode: string | null;
	/** SIMC code of the locality (`0984522`), when published. */
	simc: string | null;
	/** E.164, when published and not shared by more than `MAX_PHONE_ESTABLISHMENTS` establishments. */
	phone: string | null;
	/** A unit's own name, for the places after the first one of an operator that is not a person. */
	name: string | null;
};

/** A cell's kind (part VIII code) and its label in the ministry's dictionary. */
export type PlCell = { code: string; label: string };

export type PlEstablishment = {
	/** Line of `zaklady.csv`, from 1 (the header is line 1). */
	lineNo: number;
	/** RPWDL establishment id (`ID ZOZ`): the page's key. */
	nationalId: string;
	professionCode: string;
	/** Listing field of a specialist clinic (`kardiologia`), else null. */
	specialtyCode: string | null;
	/** The establishment's name, with the name of a natural person who runs it taken out. */
	name: string;
	/** The register's kind of activity (`1`, `2`, `3`), as published. */
	activityKind: string | null;
	/** The kinds of its active cells, each once, by code. */
	cells: PlCell[];
	/** Beds of its active cells (`Liczba łóżek ogółem`), 0 when it has none. */
	beds: number;
	/** Public (an independent public healthcare unit, a budget unit, a state-owned company…) or private. */
	ownership: "public" | "private";
	/** The operating entity's name, for an entity that is not a natural person or a partnership of them. */
	operator: string | null;
	sites: PlSite[];
	/** The operating entity is a natural person or a partnership of natural persons. */
	naturalPerson: boolean;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: typeof PL_SOURCE_ID;
	/** The day the register's report was generated (`Info.txt`, `YYYY-MM-DD`), when it says. */
	producedAt: string | null;
	/** Data lines of `zaklady.csv` (the header excluded). */
	lines: number;
	rows: PlEstablishment[];
	quarantined: QuarantinedLine[];
	/** Establishments left out on purpose, by reason (closed, only school nurses…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.rpwdl.counters`). */
	counters: {
		/** Imported establishments run by a natural person or a partnership of them. */
		naturalPersons: number;
		/** Imported establishments whose name had the person's name taken out. */
		namesStripped: number;
		/** Imported establishments named after their address, their name being a person's only. */
		namedByAddress: number;
		/** Places whose published number is a chain's (shared by more establishments): not stored. */
		sharedPhones: number;
		/** Places whose published number is not a plausible Polish one. */
		invalidPhones: number;
		/** Places without a TERYT code the places know (placed by locality name). */
		withoutGmina: number;
		/** Active units and cells read. */
		units: number;
		cells: number;
	};
};

export const emptyResult = (): ParseResult => ({
	source: PL_SOURCE_ID,
	producedAt: null,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: {
		naturalPersons: 0,
		namesStripped: 0,
		namedByAddress: 0,
		sharedPhones: 0,
		invalidPhones: 0,
		withoutGmina: 0,
		units: 0,
		cells: 0,
	},
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * A line that cannot be read. Its sample keeps the establishment id only, never a name: a
 * quarantined line of a sole trader's establishment must not store the person's name.
 */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
