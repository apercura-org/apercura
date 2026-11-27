/**
 * The shape the Cypriot sources are parsed into: one row per facility of the Ministry of
 * Health's open lists on data.gov.cy (a private pharmacy, a state hospital, a state health
 * centre), ready to be placed and merged (`../../merge-cy.ts`).
 */
import type { CyIdScheme } from "@apercura/core";
import { CY_HEALTH_CENTRE, CY_HOSPITAL, CY_PHARMACY } from "@apercura/core/taxonomy";

/**
 * The sources read, as named in `stats.sources` and the guards: the Pharmaceutical Services'
 * private pharmacies (`farmakeia`), the state hospitals (`nosokomeia`) and the state health
 * centres (`kentra`).
 */
export const CY_SOURCE_IDS = ["farmakeia", "nosokomeia", "kentra"] as const;

export type CySourceId = (typeof CY_SOURCE_IDS)[number];

/** Per source: its scheme, kind (profession code) and site source (the registry id). */
export const CY_SOURCES: Readonly<
	Record<CySourceId, { scheme: CyIdScheme; professionCode: string; siteSource: string }>
> = {
	farmakeia: { scheme: "CY-FARM", professionCode: CY_PHARMACY, siteSource: "cy-farmakeia" },
	nosokomeia: { scheme: "CY-MOH", professionCode: CY_HOSPITAL, siteSource: "cy-nosokomeia" },
	kentra: { scheme: "CY-MOH", professionCode: CY_HEALTH_CENTRE, siteSource: "cy-kentra-ygeias" },
};

/** File names in `--source-dir` (fixtures, offline runs). */
export const CY_FILES: Readonly<Record<CySourceId, string>> = {
	farmakeia: "farmakeia.csv",
	nosokomeia: "nosokomeia.csv",
	kentra: "kentra-ygeias.csv",
};

/** Where a facility is, before it is placed in a municipality or community. */
export type CyLocation = {
	/** The street and number (`Ερμού 51Γ`), or null when the list gives none (a health centre). */
	street: string | null;
	/** The postcode the list writes, if any. */
	postcode: string | null;
	/** The town or community the list names (`Λάρνακα`, `Κάτω Πάφος`), or the facility's name's. */
	town: string | null;
	/** The district the list names (`Λευκωσία`), or the one its phone number's area code says. */
	district: string | null;
	/** The point the list gives (the state hospitals), WGS 84. */
	point: { longitude: number; latitude: number } | null;
	/** E.164, when published, a fixed line and not shared by more than three facilities. */
	phone: string | null;
};

export type CyFacility = {
	source: CySourceId;
	/** Record of the file, from 1 (the header is line 1). */
	lineNo: number;
	/** The key in its scheme (`CY_SOURCES[source].scheme`). */
	nationalId: string;
	professionCode: string;
	/** The name a page prints: the list's for a state facility, the address for a pharmacy. */
	name: string;
	location: CyLocation;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: CySourceId;
	/** Data lines of the file. */
	lines: number;
	rows: CyFacility[];
	quarantined: QuarantinedLine[];
	/** Rows left out on purpose, by reason (a second row of the same pharmacy…). */
	skipped: Record<string, number>;
	counters: {
		/** Numbers shared by more than three facilities: not stored. */
		sharedPhones: number;
		/** Mobile numbers, more often a person's than a pharmacy's: not stored. */
		mobilePhones: number;
		/** Numbers that are not plausible Cypriot ones. */
		invalidPhones: number;
	};
};

export const emptyResult = (source: CySourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: { sharedPhones: 0, mobilePhones: 0, invalidPhones: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A row that cannot be read. Its sample keeps the row's key only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 16) });
};
