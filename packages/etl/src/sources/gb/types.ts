/**
 * The shape every UK list is parsed into: one row per practice and site (a GP practice and
 * each of its branch surgeries), ready for the merge (`../../merge-gb.ts`).
 */
import type { GbIdScheme } from "@apercura/core";
import { parseQuotedRecord } from "../../lib/text";

/**
 * The UK lists, as named in `--sources` and `ETL_GB_SOURCES`: NHS England's Organisation Data
 * Service reports for England and Wales (GP practices, their branch surgeries, dental practices,
 * pharmacies), Public Health Scotland's lists and the Northern Ireland Business Services
 * Organisation's.
 */
export const GB_SOURCE_IDS = [
	"ods-gp",
	"ods-branches",
	"ods-dent",
	"ods-pharm",
	"phs-gp",
	"phs-dent",
	"phs-pharm",
	"bso-gp",
	"bso-dent",
] as const;

export type GbSourceId = (typeof GB_SOURCE_IDS)[number];

export type GbPractice = {
	/** `directory.sites.source` and `directory.activities.source` (`gb-ods-gp`…). */
	source: string;
	/** Line of the source file, from 1. */
	lineNo: number;
	idScheme: GbIdScheme;
	nationalId: string;
	professionCode: string;
	/** The name the practice is shown under (never a person's: `practiceDisplayName`). */
	name: string;
	/** True when the published name named a person and was replaced. */
	minimised: boolean;
	/** Key of the site within the source (`directory.sites.source_key`): the practice's or the branch's code. */
	siteKey: string;
	/** Name of a branch surgery, when the site is one. */
	siteName: string | null;
	/** The street lines of the address, joined, in British English case. */
	street: string | null;
	/** The post town (`Stockton-on-Tees`), as the list writes it, cased. */
	town: string | null;
	/** Other locality lines of the address (`Blacon`), tried after the town to place the site. */
	localities: string[];
	/** Standard form (`TS18 1HU`), or null. */
	postcode: string | null;
	/** E.164, when the list publishes one. */
	phone: string | null;
	/** ONS local authority code the list gives (Scotland's dental council areas), else null. */
	ladCode: string | null;
	/** Name of the local government district the list gives (Northern Ireland's dental list). */
	ladName: string | null;
	/** The practice's own address (not a branch). */
	main: boolean;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: GbSourceId;
	/** Data lines of the file. */
	lines: number;
	rows: GbPractice[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (closed practice, other kind of organisation…). */
	skipped: Record<string, number>;
	/** Practices whose published name named a person (shown under their premises or street). */
	minimised: number;
};

export const emptyResult = (source: GbSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	minimised: 0,
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * A line that cannot be read. Its sample keeps the identifier fields only (the code and
 * postcode), never a name: a quarantined line of a practice named after a person must not
 * store the person's name.
 */
export const quarantine = (
	result: ParseResult,
	lineNo: number,
	reason: string,
	fields: readonly string[],
) => {
	result.quarantined.push({ lineNo, reason, sample: fields.slice(0, 1).join("|").slice(0, 40) });
};

/** A text file of the lists: strict UTF-8, else Windows-1252 (one Northern Irish file). */
export function decodeText(data: Buffer | Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
	} catch {
		return new TextDecoder("windows-1252").decode(data);
	}
}

/** The records of a comma-separated text with double-quote quoting, numbered from 1. */
export function* csvRecords(text: string): Generator<{ lineNo: number; fields: string[] }> {
	const lines = text.split(/\r?\n/);
	let pending: string | null = null;
	let start = 0;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const input: string = pending === null ? line : `${pending}\n${line}`;
		if (pending === null) start = index + 1;
		if (pending === null && line.trim() === "") continue;
		const fields = parseQuotedRecord(input, ",");
		if (fields === null) {
			pending = input;
			continue;
		}
		pending = null;
		yield { lineNo: start, fields };
	}
}

/**
 * Postcodes of the Crown Dependencies (Isle of Man, Guernsey, Jersey): ODS lists their
 * practices, but they are not in the United Kingdom.
 */
export const CROWN_DEPENDENCY = /^(IM|GY|JE)\d/;

/** A field as published, trimmed; empty, `NA` and `NULL` become null. */
export const field = (value: string | undefined): string | null => {
	const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
	const upper = trimmed.toUpperCase();
	return trimmed === "" || upper === "NA" || upper === "NULL" ? null : trimmed;
};
