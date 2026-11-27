/**
 * The shape the Maltese source is parsed into: one row per community pharmacy of the Medicines
 * Authority's register of licensed pharmacies in Malta and Gozo, ready for the merge
 * (`../../merge-mt.ts`).
 */
import type { MtIdScheme } from "@apercura/core";

/** The source read, as named in `stats.sources` and the guards: the register of pharmacies. */
export const MT_SOURCE_IDS = ["pharmacies"] as const;

export type MtSourceId = (typeof MT_SOURCE_IDS)[number];

/** Per source: its scheme and site source. */
export const MT_SOURCES: Readonly<Record<MtSourceId, { scheme: MtIdScheme; siteSource: string }>> =
	{ pharmacies: { scheme: "MT-MA", siteSource: "mt-ma" } };

/**
 * File names in `--source-dir` (fixtures, offline runs) and in the work directory: the register
 * (the API's answer) and its record in the European data portal's catalogue, harvested from
 * data.gov.mt, which carries the publisher, the licence and the date of the data.
 */
export const MT_FILES = { pharmacies: "pharmacies.json", catalogue: "catalogue.json" } as const;

export type MtPharmacy = {
	source: MtSourceId;
	/** Index of the row in the register, from 1. */
	lineNo: number;
	/** The digits of the licence number (`DL 001` → `001`). */
	nationalId: string;
	professionCode: string;
	/** The pharmacy's name, its whitespace collapsed (`Brown's Medical\nPlaza Pharmacy` → one line). */
	name: string;
	/** The street as the register writes it, without a trailing comma, or null. */
	street: string | null;
	/** MaltaPost's postcode (`BBG 2412`), or null. */
	postcode: string | null;
	/** The locality as the register writes it (`Ħal Luqa`, `St. Paul's Bay`), or null. */
	locality: string | null;
	longitude: number | null;
	latitude: number | null;
	/** E.164, the register's first number, else null. */
	phone: string | null;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: MtSourceId;
	/** Rows of the register. */
	lines: number;
	rows: MtPharmacy[];
	quarantined: QuarantinedLine[];
	/** Rows left out on purpose, by the register's type (`type:Inpatient Pharmacies`). */
	skipped: Record<string, number>;
	/** The day the catalogue says the data changed (`YYYYMMDD`). */
	edition: number | null;
	counters: {
		/** Pharmacies whose published number is not a plausible Maltese one. */
		invalidPhones: number;
		/** Pharmacies whose point is missing or outside the islands (placed by their locality). */
		withoutPoint: number;
		/** Pharmacies whose postcode is not MaltaPost's form. */
		invalidPostcodes: number;
	};
};

export const emptyResult = (source: MtSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	edition: null,
	counters: { invalidPhones: 0, withoutPoint: 0, invalidPostcodes: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A row that cannot be read. Its sample keeps the licence number only, never a name. */
export const quarantine = (
	result: ParseResult,
	lineNo: number,
	reason: string,
	licence: string,
) => {
	result.quarantined.push({ lineNo, reason, sample: licence.slice(0, 16) });
};
