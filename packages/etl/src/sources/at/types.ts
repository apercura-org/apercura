/**
 * The shape every Austrian list is parsed into: one row per doctor, practice
 * location and specialty, ready for the merge (`../../merge-at.ts`).
 */
import type { AtIdScheme } from "@apercura/core";
import type { AtSpecialtyLabel } from "@apercura/core/taxonomy";

/** The Austrian lists, as named in `--sources` and `ETL_AT_SOURCES`. */
export const AT_SOURCE_IDS = ["wien", "stmk", "sbg", "sbg-zahn"] as const;

export type AtSourceId = (typeof AT_SOURCE_IDS)[number];

/** A point in the source's coordinate system (EPSG code), transformed to WGS 84 by the merge. */
export type SourcePoint = { x: number; y: number; srid: number };

export type AtPractice = {
	/** `directory.sites.source` and `directory.activities.source` (`at-wien`…). */
	source: string;
	/** Line (feature, record) of the source file, from 1. */
	lineNo: number;
	idScheme: AtIdScheme;
	nationalId: string;
	professionCode: string;
	titleCode: "PR" | "DR" | null;
	/** `M` or `MME` when the list gives the gender (Salzburg doctors), else null. */
	civilityCode: "M" | "MME" | null;
	firstName: string;
	lastName: string;
	firstNameSource: string;
	lastNameSource: string;
	/** The `FACH` label as published, and how the taxonomy reads it. */
	specialtyRaw: string | null;
	specialty: AtSpecialtyLabel;
	/** Key of the practice location within the source (`directory.sites.source_key`). */
	siteKey: string;
	/** Name of a group practice (Gruppenpraxis), when the list names one. */
	siteName: string | null;
	street: string | null;
	postcode: string | null;
	city: string | null;
	/** Bundesland number of the source ("9" Vienna, "6" Styria, "5" Salzburg). */
	stateCode: string;
	/** Vienna: the district (1–23) the address starts with; it names the place exactly. */
	viennaDistrict: number | null;
	/** E.164, when the list publishes one. */
	phone: string | null;
	point: SourcePoint | null;
	/** The main practice (Hauptordination) when the list says which one it is. */
	main: boolean;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: AtSourceId;
	/** Records of the file (features, DBF records). */
	lines: number;
	rows: AtPractice[];
	quarantined: QuarantinedLine[];
	/** Records left out on purpose, by reason (no practice address…). */
	skipped: Record<string, number>;
};

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

export const quarantine = (result: ParseResult, lineNo: number, reason: string, raw: unknown) => {
	result.quarantined.push({ lineNo, reason, sample: JSON.stringify(raw).slice(0, 500) });
};
