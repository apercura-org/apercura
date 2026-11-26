/**
 * The shape the German sources are parsed into: one row per facility (a hospital site, a
 * prevention or rehabilitation clinic, a pharmacy), ready for the merge (`../../merge-de.ts`).
 */
import type { DeIdScheme } from "@apercura/core";
import {
	DE_CHILDRENS_HOSPITAL,
	DE_HOSPITAL,
	DE_PHARMACY,
	DE_PSYCHIATRIC_HOSPITAL,
	DE_REHAB_CLINIC,
} from "@apercura/core/taxonomy";

/**
 * The sources read, as named in `stats.sources` and the guards: the hospitals (`khv`) and the
 * prevention and rehabilitation clinics (`rhv`) of the statistical offices' yearly directory, two
 * worksheets of one workbook, and the pharmacy lists of Thuringia and Brandenburg.
 */
export const DE_SOURCE_IDS = ["khv", "rhv", "apo-th", "apo-bb"] as const;

export type DeSourceId = (typeof DE_SOURCE_IDS)[number];

/** The files downloaded: one per list, the directory's workbook holding two sources. */
export const DE_FILE_IDS = ["destatis", "apo-th", "apo-bb"] as const;

export type DeFileId = (typeof DE_FILE_IDS)[number];

/** Per source: its file, the name of that file in `--source-dir`, scheme, site source and kinds. */
export const DE_SOURCES: Readonly<
	Record<
		DeSourceId,
		{
			file: DeFileId;
			scheme: DeIdScheme;
			siteSource: string;
			professions: readonly string[];
		}
	>
> = {
	khv: {
		file: "destatis",
		scheme: "DE-KHV",
		siteSource: "de-destatis-khv",
		professions: [DE_HOSPITAL, DE_PSYCHIATRIC_HOSPITAL, DE_CHILDRENS_HOSPITAL],
	},
	rhv: {
		file: "destatis",
		scheme: "DE-RHV",
		siteSource: "de-destatis-rhv",
		professions: [DE_REHAB_CLINIC],
	},
	"apo-th": {
		file: "apo-th",
		scheme: "DE-APO-TH",
		siteSource: "de-apo-th",
		professions: [DE_PHARMACY],
	},
	"apo-bb": {
		file: "apo-bb",
		scheme: "DE-APO-BB",
		siteSource: "de-apo-bb",
		professions: [DE_PHARMACY],
	},
};

/** File names in `--source-dir` (fixtures, offline runs). */
export const DE_FILES: Readonly<Record<DeFileId, string>> = {
	destatis: "krankenhausverzeichnis.xlsx",
	"apo-th": "apotheke_th.zip",
	"apo-bb": "apotheken_bb.json",
};

/** The `directory.practitioner_qualifications.source` of each kind of qualification. */
export const DE_QUALIFICATION_SOURCES = {
	department: "fachabteilung",
	emergencyLevel: "notfallstufe",
	emergencyModule: "notfallmodul",
	operator: "traeger",
	facilityType: "einrichtungstyp",
	pharmacyType: "apotheke",
	accessibility: "barrierefreiheit",
} as const;

export type DeQualification = {
	source: (typeof DE_QUALIFICATION_SOURCES)[keyof typeof DE_QUALIFICATION_SOURCES];
	code: string;
	label: string;
};

export type DeFacility = {
	source: DeSourceId;
	/** Row of the worksheet or record of the list, from 1. */
	lineNo: number;
	/** The facility's key in its scheme (`DE_SOURCES[source].scheme`). */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (legal forms dropped, a hospital's site named). */
	name: string;
	/** `Musterstraße 1`, or null. */
	street: string | null;
	/** Five digits, or null. */
	postcode: string | null;
	/** Town as the source writes it (`Ort`, `gemeinde`). */
	city: string;
	/** Official municipality key (AGS, eight digits) as the source gives it, or null. */
	municipalityCode: string | null;
	/** The Land (`16`), from the source or its file. */
	stateCode: string;
	/** WGS 84 point of the address, when the source publishes one. */
	point: { longitude: number; latitude: number } | null;
	/** E.164, when published and not a chain's or operator's (shared by more than three facilities). */
	phone: string | null;
	qualifications: DeQualification[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: DeSourceId;
	/** Data rows of the sheet or features of the list. */
	lines: number;
	rows: DeFacility[];
	quarantined: QuarantinedLine[];
	/** Rows left out on purpose, by reason (a hospital's pharmacy, a duplicate…). */
	skipped: Record<string, number>;
	/** The directory's reporting year (`KHV_2024` → 2024); null for the pharmacy lists. */
	edition: number | null;
	counters: {
		/** Facilities whose published number is shared by more rows: not stored. */
		sharedPhones: number;
		/** Facilities whose published number is not a plausible German one. */
		invalidPhones: number;
		/** Facilities whose postcode is not a German one: not stored. */
		invalidPostcodes: number;
	};
};

export const emptyResult = (source: DeSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	edition: null,
	counters: { sharedPhones: 0, invalidPhones: 0, invalidPostcodes: 0 },
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/** A row that cannot be read. Its sample keeps the row's key or code only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 16) });
};
