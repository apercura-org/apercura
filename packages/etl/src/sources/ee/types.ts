/**
 * The shape the Estonian sources are parsed into: one row per provider of the Health Board's
 * register (with its places of activity) or per pharmacy of the State Agency of Medicines'
 * register, ready for the merge (`../../merge-ee.ts`).
 */
import type { EeIdScheme } from "@apercura/core";

/**
 * The sources read, as named in `stats.sources` and the guards: the Health Board's providers
 * (MEDRE open data, `medre`) and the State Agency of Medicines' pharmacies (`apteegid`).
 */
export const EE_SOURCE_IDS = ["medre", "apteegid"] as const;

export type EeSourceId = (typeof EE_SOURCE_IDS)[number];

/**
 * The files downloaded: one per source, and the Land and Spatial Development Board's addresses
 * (`ads`), which every run reads to locate the providers' places and the pharmacies.
 */
export const EE_FILE_IDS = ["medre", "apteegid", "ads"] as const;

export type EeFileId = (typeof EE_FILE_IDS)[number];

/** Per source: its scheme and site source. */
export const EE_SOURCES: Readonly<Record<EeSourceId, { scheme: EeIdScheme; siteSource: string }>> =
	{
		medre: { scheme: "EE-TTL", siteSource: "ee-medre" },
		apteegid: { scheme: "EE-APT", siteSource: "ee-ravimiamet" },
	};

/** File names in `--source-dir` (fixtures, offline runs). */
export const EE_FILES: Readonly<Record<EeFileId, string>> = {
	medre: "od_asutused.xml",
	apteegid: "apteekide_koondandmed.csv",
	ads: "sihtnumbrid.zip",
};

/** The `directory.practitioner_qualifications.source` of each kind of qualification. */
export const EE_QUALIFICATION_SOURCES = {
	licence: "tegevusluba",
	hospitalKind: "haiglaliik",
	service: "teenus",
	pharmacyLicence: "apteegi-tegevusluba",
} as const;

export type EeQualification = {
	source: (typeof EE_QUALIFICATION_SOURCES)[keyof typeof EE_QUALIFICATION_SOURCES];
	code: string;
	label: string;
};

/** A place of activity (or a pharmacy's place of business), before it is located. */
export type EeLocation = {
	/** The full address as the register writes it, its first part only (`A // B` → `A`). */
	address: string;
	/** The Land Board's address id (`ADR_ID`), when the register gives one (the pharmacies). */
	adrId: string | null;
	/** E.164, when published and not shared by more than three places. */
	phone: string | null;
};

export type EeProvider = {
	source: EeSourceId;
	/** Record of the file, from 1. */
	lineNo: number;
	/** The key in its scheme (`EE_SOURCES[source].scheme`). */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (legal forms dropped, an all-capitals name re-cased). */
	name: string;
	locations: EeLocation[];
	qualifications: EeQualification[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: EeSourceId;
	/** Providers of the register or rows of the pharmacies' file. */
	lines: number;
	rows: EeProvider[];
	quarantined: QuarantinedLine[];
	/** Rows or places left out on purpose, by reason (an ambulance service, a hospital pharmacy…). */
	skipped: Record<string, number>;
	/** The register's extract date (`hetk`) as `YYYYMMDD`; null for the pharmacies. */
	edition: number | null;
	counters: {
		/** Places whose published number is shared by more than three: not stored. */
		sharedPhones: number;
		/** Places whose published number is not a plausible Estonian one. */
		invalidPhones: number;
	};
};

export const emptyResult = (source: EeSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	edition: null,
	counters: { sharedPhones: 0, invalidPhones: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A row that cannot be read. Its sample keeps the row's key or code only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 16) });
};
