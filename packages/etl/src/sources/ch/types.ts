/**
 * The shape the Swiss lists are parsed into: one row per facility (a hospital or clinic site, a
 * nursing home, a pharmacy), ready for the merge (`../../merge-ch.ts`).
 */
import type { ChIdScheme } from "@apercura/core";

/** The `directory.practitioner_qualifications.source` of a hospital's type (`K112`). */
export const CH_TYPE_SOURCE = "typ";
/** The activity types of a hospital (`A`, `P`, `R`, `B`). */
export const CH_ACTIVITY_SOURCE = "akt";
/** A hospital's specific services (`NF` emergency department, `IPS` intensive care). */
export const CH_SERVICE_SOURCE = "leistung";
/** A site's offer (`AMB` outpatient, `STAT` inpatient). */
export const CH_OFFER_SOURCE = "angebot";
/** A hospital's legal form group (`R1`–`R4`). */
export const CH_LEGAL_FORM_SOURCE = "rechtsform";
/** The operator of a site, when its name is not the site's (`label` = the operator's name). */
export const CH_OPERATOR_SOURCE = "betrieb";
/**
 * A facility's category as its canton's list names it (`code` = the language of the label,
 * `de`, `fr` or `it`; `label` = the category, "Clinique privée").
 */
export const CH_CATEGORY_SOURCE = "kategorie";
/** Another list a page is built from (`code` = the registry id, `ch-be-spitaeler`). */
export const CH_SOURCE_SOURCE = "quelle";

export type ChQualification = { source: string; code: string; label: string };

/** How a facility's point was found: its list's coordinates, else its locality's or commune's. */
export type ChPrecision = "street" | "city";

export type ChFacility<Source extends string = string> = {
	source: Source;
	/** Line or record of the file, from 1. */
	lineNo: number;
	idScheme: ChIdScheme;
	/** The list's key of the facility: the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (`facilityNameCh`). */
	name: string;
	/** Qualifications shown on the page (type, activities, services, offer, operator…). */
	qualifications: ChQualification[];
	/** `Rämistrasse 100`, or null. */
	street: string | null;
	/** Four digits, or null. */
	postcode: string | null;
	/** The locality as the list writes it (`Muri AG`, `Genève`). */
	locality: string;
	/** Canton abbreviation (`ZH`). */
	cantonCode: string;
	/** BFS commune number when the list gives it (`261`), else null (placed by postcode). */
	communeCode: string | null;
	/** WGS 84 point of the facility when its list gives coordinates. */
	latitude: number | null;
	longitude: number | null;
	/** E.164, or null. */
	phone: string | null;
	/** The facility's own website (`https://…`), or null. */
	website: string | null;
	/** Keys that tell the facility apart across lists (`nameMatchKeyCh`), for deduplication. */
	matchKeys: string[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult<Source extends string = string> = {
	source: Source;
	/** Data lines or records of the file. */
	lines: number;
	rows: ChFacility<Source>[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (a total line, a repeat, outside the market…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.<id>.counters`). */
	counters: {
		/** Facilities whose published name lost a care-of or attention marker (and what followed). */
		namesShortened: number;
		/** Facilities with coordinates in their list. */
		withPoint: number;
		/** Facilities whose phone number is not a Swiss one: not stored. */
		invalidPhones: number;
	};
};

export const emptyResult = <Source extends string>(source: Source): ParseResult<Source> => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: { namesShortened: 0, withPoint: 0, invalidPhones: 0 },
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/** A line that cannot be read. Its sample is a code or the start of a facility's name, never a person's. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
