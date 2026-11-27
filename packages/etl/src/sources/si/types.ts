/**
 * The shape the health insurer's lists are parsed into: one row per doctor, practice (izvajalec)
 * and ZZZS activity, ready for the locator (`./locate.ts`) and the merge (`../../merge-si.ts`).
 */

/** The ZZZS lists, as named in `--sources` and `ETL_SI_SOURCES`. */
export const SI_SOURCE_IDS = ["sa", "gin", "zob"] as const;

export type SiSourceId = (typeof SI_SOURCE_IDS)[number];

/** `directory.activities.source` of each list (the adapter's registry id). */
export const SI_LIST_SOURCE: Readonly<Record<SiSourceId, string>> = {
	sa: "si-zzzs-sa",
	gin: "si-zzzs-gin",
	zob: "si-zzzs-zob",
};

/** `directory.sites.source` of every practice: a provider is one place whatever its list. */
export const SI_SITE_SOURCE = "si-zzzs";

/** Whether the doctor still takes insured persons on, as the list says (`DA`, `NE`, empty). */
export type SiAcceptance = "accepting" | "closed" | null;

export type SiRow = {
	source: SiSourceId;
	/** Row of the worksheet, from 1. */
	lineNo: number;
	/** The insurer's number of the doctor (`Šifra zdravnika`), without a leading zero. */
	nationalId: string;
	/** `Priimek in ime zdravnika` as published (`KOLAR  MIRAN`). */
	nameSource: string;
	/** The insurer's number of the provider (`Šifra izvajalca`). */
	providerCode: string;
	/** `Naziv izvajalca` as published. */
	providerName: string;
	/** `Ulica` as published (`CELJSKA CESTA 24 B`, or a village and a number: `ZADOBROVA 49 B`). */
	street: string | null;
	/** The four digits of `Kraj` (`3211 ŠKOFJA VAS`). */
	postcode: string | null;
	/** The post office of `Kraj` (`ŠKOFJA VAS`, `KOPER - CAPODISTRIA`). */
	postOffice: string | null;
	/** `Šifra ZZZS dejavnosti` (`302001`). */
	activityCode: string;
	acceptance: SiAcceptance;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type SiParseResult = {
	source: SiSourceId;
	/** The date of the list's data (`Stanje podatkov na dan`, `Datum in čas priprave datoteke`). */
	dataDate: string | null;
	/** Data lines of the worksheet (rows naming a provider and a doctor, or failing to). */
	lines: number;
	rows: SiRow[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (totals, an activity of no personal doctor…). */
	skipped: Record<string, number>;
};

export const skip = (result: SiParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * Quarantines a line. Its sample holds the line's codes only (provider, doctor, activity,
 * acceptance): never a name, so a stored sample names nobody, and a suppressed doctor's number
 * drops it (`SuppressedLines`).
 */
export const quarantine = (
	result: SiParseResult,
	lineNo: number,
	reason: string,
	codes: readonly string[],
) => {
	result.quarantined.push({ lineNo, reason, sample: JSON.stringify(codes).slice(0, 300) });
};
