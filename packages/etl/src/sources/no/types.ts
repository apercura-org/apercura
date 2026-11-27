/**
 * The shape the Norwegian sources are parsed into: one row per establishment (underenhet) of the
 * Brønnøysund Register Centre's Central Coordinating Register for Legal Entities, kept by
 * `filters.ts`, ready for the merge (`../../merge-no.ts`).
 */
import type { NoIdScheme } from "@apercura/core";

/** The source read, as named in `stats.sources` and the guards: the register's establishments. */
export const NO_SOURCE_IDS = ["brreg"] as const;

export type NoSourceId = (typeof NO_SOURCE_IDS)[number];

/**
 * The files downloaded: the register's establishments (`underenheter`) and main entities
 * (`enheter`, read for the owner of each establishment kept: its legal form, whether it is
 * bankrupt or being wound up), and Kartverket's addresses (`adresser`), which every run reads to
 * locate the establishments.
 */
export const NO_FILE_IDS = ["underenheter", "enheter", "adresser"] as const;

export type NoFileId = (typeof NO_FILE_IDS)[number];

/** Per source: its scheme and site source. */
export const NO_SOURCES: Readonly<Record<NoSourceId, { scheme: NoIdScheme; siteSource: string }>> =
	{
		brreg: { scheme: "NO-ORGNR", siteSource: "no-brreg" },
	};

/** File names in `--source-dir` (fixtures, offline runs) and in the work directory. */
export const NO_FILES: Readonly<Record<NoFileId, string>> = {
	underenheter: "underenheter.csv.gz",
	enheter: "enheter.csv.gz",
	adresser: "adresser.zip",
};

/** The `directory.practitioner_qualifications.source` of each kind of qualification. */
export const NO_QUALIFICATION_SOURCES = {
	/** The main industry code (SN2025) and the register's description of it. */
	industry: "naeringskode",
	/** The owner (a public body or a foundation): its organisation number and name. */
	owner: "eier",
} as const;

export type NoQualification = {
	source: (typeof NO_QUALIFICATION_SOURCES)[keyof typeof NO_QUALIFICATION_SOURCES];
	code: string;
	label: string;
};

/** An establishment's location address, as the register writes it. */
export type NoAddress = {
	/** The street and number (`Ragnar Strøms veg 10`), a care-of line never kept; null when none. */
	street: string | null;
	postcode: string | null;
	/** The post town (`JESSHEIM`), re-cased (`Jessheim`). */
	postTown: string | null;
	/** The municipality number (`3209`). */
	municipality: string;
};

export type NoEstablishment = {
	source: NoSourceId;
	/** Record of the file, from 1. */
	lineNo: number;
	/** The establishment's organisation number. */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (re-cased, trailing legal form dropped). */
	name: string;
	address: NoAddress;
	/** E.164, when published in `telefon` and not shared by more than three establishments. */
	phone: string | null;
	qualifications: NoQualification[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: NoSourceId;
	/** Records of the establishments' file. */
	lines: number;
	/** Establishments registered under an industry code the market reads (before the filters). */
	candidates: number;
	rows: NoEstablishment[];
	quarantined: QuarantinedLine[];
	/** Establishments left out on purpose, by reason (a sole proprietorship, a holding company…). */
	skipped: Record<string, number>;
	/** Records of the main entities' file. */
	entityLines: number;
	counters: {
		/** Establishments whose published number is shared by more than three: not stored. */
		sharedPhones: number;
		/** Establishments whose published number is not a plausible Norwegian one. */
		invalidPhones: number;
		/** Address lines dropped because they are care-of lines (`c/o …`). */
		careOfLines: number;
	};
};

export const emptyResult = (source: NoSourceId): ParseResult => ({
	source,
	lines: 0,
	candidates: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	entityLines: 0,
	counters: { sharedPhones: 0, invalidPhones: 0, careOfLines: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A record that cannot be read. Its sample keeps the organisation number only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 16) });
};
