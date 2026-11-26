/**
 * The shape the Czech list is parsed into: one row per facility and place of care of the
 * National Register of Healthcare Providers (NRPZS), ready for the merge (`../../merge-cz.ts`).
 */

/** The one Czech list, as named in `stats.sources` and the guards. */
export const CZ_SOURCE_ID = "nrpzs";

/** `directory.sites.source` and `directory.activities.source` of the Czech rows. */
export const CZ_SITE_SOURCE = "cz-nrpzs";

export type CzFacility = {
	/** Line of the source file, from 1 (the header is line 1). */
	lineNo: number;
	/** NRPZS facility number (`ZZ_ID`): the page's key. */
	nationalId: string;
	/** NRPZS place of care number (`ZZ_misto_poskytovani_ID`): the site's key. */
	siteKey: string;
	professionCode: string;
	/** The facility's name as the register publishes it, whitespace collapsed. */
	name: string;
	/** Fields of care (`ZZ_obor_pece`), as codes and labels, in the register's order. */
	fields: { code: string; label: string }[];
	/** Primary field of a specialist's practice (`primaryCzSpecialty`), else null. */
	specialtyCode: string | null;
	/** Street and number (`Lidická 241`), or the municipality and number where there is no street. */
	street: string | null;
	/** Written form (`407 21`), or null. */
	postcode: string | null;
	/** Municipality as the register writes it (`Česká Kamenice`, `Praha 8`). */
	city: string;
	/** District (okres) LAU code (`CZ0421`, `CZ0100` for Prague). */
	districtCode: string;
	/** Region (kraj) NUTS code (`CZ042`). */
	regionCode: string;
	/** WGS 84 point of the place of care, when published and inside Czechia. */
	latitude: number | null;
	longitude: number | null;
	/** E.164, when published and not shared by more than `MAX_PHONE_ROWS` rows. */
	phone: string | null;
	/** The provider is a natural person (a sole trader): counted, never stored. */
	naturalPerson: boolean;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: typeof CZ_SOURCE_ID;
	/** Data lines of the file (the header excluded). */
	lines: number;
	rows: CzFacility[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (facility kind not imported, duplicate…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.nrpzs.counters`). */
	counters: {
		/** Imported facilities whose provider is a natural person (named after them). */
		naturalPersons: number;
		/** Imported facilities whose published number is a chain's (shared by more rows): not stored. */
		sharedPhones: number;
		/** Imported facilities whose published number is not a plausible Czech one. */
		invalidPhones: number;
		/** Imported facilities without coordinates, or with coordinates outside Czechia. */
		withoutPoint: number;
	};
};

export const emptyResult = (): ParseResult => ({
	source: CZ_SOURCE_ID,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: { naturalPersons: 0, sharedPhones: 0, invalidPhones: 0, withoutPoint: 0 },
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * A line that cannot be read. Its sample keeps the facility number only, never a name: a
 * quarantined line of a sole trader's facility must not store the person's name.
 */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
