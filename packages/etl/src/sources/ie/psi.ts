/**
 * The Pharmaceutical Society of Ireland's register of pharmacies (retail pharmacy businesses),
 * as its monthly XLSX extract publishes it: a sheet `Extract` (the PSI's name on row 1, "This
 * data is correct at: 02.11.2026" on row 2, the header on row 3, then one row per pharmacy) and
 * a sheet `Terms & Conditions of Use` with the PSI's re-use conditions.
 *
 * Read: the registration number (the key), the trading name, the street lines, the town, the
 * Eircode (printed only) and the county. Never read: the `RPB Owner` column (the company owning
 * the business, sometimes a sole trader's own name). The terms sheet must still carry the
 * conditions the import relies on, or the list is left out of the run ("terms changed").
 */
import { IE_ID_SCHEMES, normalizeEircode } from "@apercura/core";
import { ieCountyOfName } from "@apercura/core/country";
import { xlsxRows, xlsxSheets } from "../../lib/xlsx";
import {
	cleanText,
	facilityNameIe,
	titleCaseIfUpper,
	townCandidates,
	townKey,
	trimPunctuation,
} from "./names";
import { count, emptyResult, IE_SOURCES, type ParseResult, quarantine, skip } from "./types";

/** The sheets of the extract. */
export const PSI_EXTRACT_SHEET = "Extract";
export const PSI_TERMS_SHEET = "Terms & Conditions of Use";

/**
 * What the terms sheet must still say for the import to go on: re-use is allowed, and the one
 * condition a directory must watch (no use for the principal purpose of advertising).
 */
export const PSI_TERMS_PHRASES = ["re-use", "principal purpose of advertising"] as const;

/** The columns read, by header name. `RPB Owner` is never read. */
const COLUMNS = [
	"Registration Number",
	"Trading Name",
	"Street 1",
	"Street 2",
	"Street 3",
	"Town",
	"Eircode",
	"County",
] as const;

type Column = (typeof COLUMNS)[number];

/** Thrown when the terms sheet is missing or no longer says what the import relies on. */
export class TermsChangedError extends Error {
	constructor(detail: string) {
		super(`terms changed: ${detail}`);
	}
}

/** `This data is correct at: 02.11.2026` → `2026-11-02`, or null. */
export function psiCorrectAt(text: string): string | null {
	const match = /correct at:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i.exec(text);
	if (!match) return null;
	const [, day = "", month = "", year = ""] = match;
	const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	const date = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Checks the terms sheet: it exists and carries every phrase of `PSI_TERMS_PHRASES` (case and
 * spaces ignored). Throws `TermsChangedError` otherwise.
 */
export async function checkPsiTerms(data: Buffer): Promise<void> {
	const sheet = xlsxSheets(data).find((candidate) => candidate.name.trim() === PSI_TERMS_SHEET);
	if (!sheet) throw new TermsChangedError(`no sheet "${PSI_TERMS_SHEET}"`);
	let text = "";
	for await (const row of xlsxRows(data, sheet.name)) text += ` ${row.cells.join(" ")}`;
	const folded = text.toLowerCase().replace(/\s+/g, " ");
	const missing = PSI_TERMS_PHRASES.filter((phrase) => !folded.includes(phrase));
	if (missing.length > 0) {
		throw new TermsChangedError(`the terms sheet no longer says "${missing.join('", "')}"`);
	}
}

/** Street lines joined with ", ", without a line that is the town (`Main Street, Lusk` → `Main Street`). */
export function psiStreet(parts: readonly string[], town: string): string | null {
	const key = townKey(town);
	const lines = parts
		.map((part) => titleCaseIfUpper(trimPunctuation(cleanText(part))))
		.filter((part) => part && (!key || townKey(part) !== key));
	return lines.length > 0 ? lines.join(", ") : null;
}

/** Reads the extract. Throws when the workbook, its sheet or a column cannot be read, or its terms changed. */
export async function parsePsi(data: Buffer): Promise<ParseResult> {
	await checkPsiTerms(data);
	const result = emptyResult("psi");
	const { pattern } = IE_ID_SCHEMES["IE-PSI"];
	let index: Map<Column, number> | null = null;
	const seen = new Set<string>();
	for await (const row of xlsxRows(data, (name) => name.trim() === PSI_EXTRACT_SHEET)) {
		const first = cleanText(row.cells[0]);
		if (!index) {
			const correctAt = psiCorrectAt(row.cells.join(" "));
			if (correctAt) result.facts.correctAt = correctAt;
			if (first === "Registration Number") {
				index = new Map();
				const missing: string[] = [];
				for (const column of COLUMNS) {
					const at = row.cells.findIndex((cell) => cleanText(cell) === column);
					if (at < 0) missing.push(column);
					else index.set(column, at);
				}
				if (missing.length > 0)
					throw new Error(`PSI extract: missing columns ${missing.join(", ")}`);
			}
			continue;
		}
		const cell = (column: Column) => cleanText(row.cells[index?.get(column) ?? -1]);
		if (row.cells.every((value) => cleanText(value) === "")) continue;
		result.lines++;
		const id = cell("Registration Number").replace(/\.0$/, "");
		if (!pattern.test(id)) {
			quarantine(result, row.rowNo, "invalid registration number", id);
			continue;
		}
		const name = facilityNameIe(cell("Trading Name"));
		if (!name) {
			quarantine(result, row.rowNo, "no trading name", id);
			continue;
		}
		if (seen.has(id)) {
			skip(result, "repeated registration number");
			continue;
		}
		seen.add(id);
		if (name !== trimPunctuation(cleanText(cell("Trading Name")))) count(result, "namesCased");
		const town = titleCaseIfUpper(trimPunctuation(cell("Town")));
		const county = cell("County");
		const countyCode = ieCountyOfName(county);
		if (!countyCode) count(result, "unknownCounty");
		const rawEircode = cell("Eircode");
		const eircode = normalizeEircode(rawEircode);
		if (rawEircode && !eircode) count(result, "invalidEircodes");
		const streets = [cell("Street 1"), cell("Street 2"), cell("Street 3")];
		// A Dublin postal district is where the pharmacy is when the town column is empty.
		const district = /^dublin\s*\d{1,2}w?$/i.test(county) ? county : "";
		result.rows.push({
			source: "psi",
			lineNo: row.rowNo,
			idScheme: "IE-PSI",
			nationalId: id,
			professionCode: IE_SOURCES.psi.professionCode,
			name,
			qualifications: [],
			street: psiStreet(streets, town),
			townColumn: town || district || null,
			addressParts: streets.filter(Boolean),
			eircode,
			countyCode,
			towns: [town, ...[...streets].reverse(), district].flatMap(townCandidates),
			latitude: null,
			longitude: null,
			phone: null,
			matchNames: [],
			kind: null,
		});
	}
	if (!index) throw new Error("PSI extract: no header row (Registration Number, Trading Name…)");
	if (!result.facts.correctAt) count(result, "noCorrectAtDate");
	return result;
}
