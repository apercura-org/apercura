/**
 * The shape the Finnish source is parsed into: one row per health service location of the
 * Finnish Service Catalogue (Suomi.fi-palvelutietovaranto, PTV), ready for the merge
 * (`../../merge-fi.ts`).
 */
import type { FiIdScheme } from "@apercura/core";

/** The source read, as named in `stats.sources` and the guards: the Finnish Service Catalogue. */
export const FI_SOURCE_IDS = ["ptv"] as const;

export type FiSourceId = (typeof FI_SOURCE_IDS)[number];

/** Per source: its scheme and site source. */
export const FI_SOURCES: Readonly<Record<FiSourceId, { scheme: FiIdScheme; siteSource: string }>> =
	{ ptv: { scheme: "FI-PTV", siteSource: "fi-ptv" } };

/** File name in `--source-dir` (fixtures, offline runs) and in the work directory. */
export const FI_FILES: Readonly<Record<FiSourceId, string>> = { ptv: "ptv.json" };

/** The `directory.practitioner_qualifications.source` of each kind of qualification. */
export const FI_QUALIFICATION_SOURCES = {
	/** A service given at the location, in the catalogue's words (`Lääkärin vastaanotto`). */
	service: "palvelu",
	/** The organisation that describes the location (a wellbeing services county, HUS). */
	organiser: "jarjestaja",
} as const;

export type FiQualification = {
	source: (typeof FI_QUALIFICATION_SOURCES)[keyof typeof FI_QUALIFICATION_SOURCES];
	code: string;
	label: string;
};

export type FiLocation = {
	source: FiSourceId;
	/** Index of the channel in the snapshot, from 1. */
	lineNo: number;
	/** The channel id as stored (32 hexadecimal digits). */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (the Finnish name, else the Swedish one). */
	name: string;
	/** The street and number (`Sairaalantie 3`), or null. */
	street: string | null;
	postcode: string | null;
	/** The post office, re-cased (`LAPUA` → `Lapua`), else the municipality's name. */
	city: string | null;
	/** Statistics Finland's municipality code (`408`), which places the location. */
	municipality: string;
	longitude: number | null;
	latitude: number | null;
	/**
	 * E.164, the first phone number the catalogue publishes for the location (a service number,
	 * often a county's booking line shared by its health centres), else null.
	 */
	phone: string | null;
	qualifications: FiQualification[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: FiSourceId;
	/** Service locations of the snapshot. */
	lines: number;
	rows: FiLocation[];
	quarantined: QuarantinedLine[];
	/** Locations left out on purpose, by reason (no health service, a school, abroad…). */
	skipped: Record<string, number>;
	/** The day the snapshot was taken (`YYYYMMDD`). */
	edition: number | null;
	counters: {
		/** Locations whose published number is not a plausible Finnish one. */
		invalidPhones: number;
		/** Locations whose point could not be read (placed at their municipality's centre). */
		withoutPoint: number;
	};
};

export const emptyResult = (source: FiSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	edition: null,
	counters: { invalidPhones: 0, withoutPoint: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A row that cannot be read. Its sample keeps the channel id only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 36) });
};
