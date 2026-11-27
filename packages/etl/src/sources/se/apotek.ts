/**
 * Läkemedelsverket's register of licensed pharmacies ("Apotek med tillstånd"), as the search
 * page's export to Excel publishes it without a filter: a sheet named after the day (`2026-11-27`)
 * with one row per pharmacy, and a sheet `Filter` that must say no filter was active (else the
 * export is a selection, not the register).
 *
 * Read: the municipality (`Kommun`; the county is the municipality's, never the `Län` column,
 * which is written in several ways), the name, the visiting address, postcode and post town, the
 * licence holder and its organisation number, the licence's case number and its first day, and
 * the GLN (the key; a cell may list several, the first valid one is the pharmacy's). A pharmacy
 * "closed to the public" (`(stängt för allmänheten)`, serving care homes or dose dispensing) is
 * not listed. The holder is stored only when its organisation number is a legal person's: a sole
 * trader's number is the trader's personal identity number.
 */
import { isValidGln, isValidSeLegalPersonNumber, normalizeSePostcode } from "@apercura/core";
import { xlsxRows, xlsxSheets } from "../../lib/xlsx";
import { cleanText, excelDate } from "./text";
import {
	count,
	emptyResult,
	type ParseResult,
	quarantine,
	SE_HOLDER_SOURCE,
	SE_LICENCE_SOURCE,
	SE_SOURCES,
	type SeQualification,
	skip,
} from "./types";

/** The columns read, by header name (all of the export's). */
const COLUMNS = [
	"Kommun",
	"Apotekets namn",
	"Besöksadress",
	"Postnummer",
	"Ort",
	"Tillståndshavare",
	"Tillståndshavare org.nr.",
	"Tillstånd diarienr",
	"Tillstånd giltigt från",
	"GLN-kod",
] as const;

type Column = (typeof COLUMNS)[number];

/** The export's sheet describing its filter, and what it says when there is none. */
export const APOTEK_FILTER_SHEET = "Filter";
export const APOTEK_NO_FILTER = "Inget filter aktivt";

/** A pharmacy that holds a licence but does not serve the public. */
const CLOSED_TO_PUBLIC = /\(\s*stängt för allmänheten\s*\)/i;

/** The first valid GLN of a cell (`7313276007073, 7313276017461`), or null. */
export function firstGln(cell: string): string | null {
	for (const token of cleanText(cell).split(/[\s,;/]+/)) {
		const digits = token.replace(/\.0$/, "");
		if (isValidGln(digits)) return digits;
	}
	return null;
}

/** An organisation number as Sweden writes it (`556773-8249`) when it is a legal person's, else null. */
export function legalPersonNumber(cell: string): string | null {
	// A legal person's number may be written with the century prefix `16` (`165567738249`).
	const digits = cleanText(cell).replace(/\D/g, "");
	const ten = digits.length === 12 && digits.startsWith("16") ? digits.slice(2) : digits;
	return isValidSeLegalPersonNumber(ten) ? `${ten.slice(0, 6)}-${ten.slice(6)}` : null;
}

/** Reads the export. Throws when the workbook, its sheet or a column cannot be read, or it was filtered. */
export async function parseApotek(data: Buffer): Promise<ParseResult> {
	const sheets = xlsxSheets(data);
	const filter = sheets.find((sheet) => sheet.name.trim() === APOTEK_FILTER_SHEET);
	if (filter) {
		let text = "";
		for await (const row of xlsxRows(data, filter.name)) text += ` ${row.cells.join(" ")}`;
		if (!text.includes(APOTEK_NO_FILTER)) {
			throw new Error(`the export is filtered (its sheet "${APOTEK_FILTER_SHEET}" names a filter)`);
		}
	}
	const sheet = sheets.find((candidate) => candidate.name.trim() !== APOTEK_FILTER_SHEET);
	if (!sheet) throw new Error("no worksheet of pharmacies");
	const result = emptyResult("apotek");
	let index: Map<Column, number> | null = null;
	const seen = new Set<string>();
	for await (const row of xlsxRows(data, sheet.name)) {
		if (!index) {
			if (row.cells.some((cell) => cleanText(cell) === "GLN-kod")) {
				index = new Map();
				const missing: string[] = [];
				for (const column of COLUMNS) {
					const at = row.cells.findIndex((cell) => cleanText(cell) === column);
					if (at < 0) missing.push(column);
					else index.set(column, at);
				}
				if (missing.length > 0) throw new Error(`missing columns ${missing.join(", ")}`);
			}
			continue;
		}
		const cell = (column: Column) => cleanText(row.cells[index?.get(column) ?? -1]);
		if (row.cells.every((value) => cleanText(value) === "")) continue;
		result.lines++;
		const glnCell = cell("GLN-kod");
		const gln = firstGln(glnCell);
		if (!gln) {
			quarantine(result, row.rowNo, "no valid GLN", glnCell);
			continue;
		}
		if (/[,;/\s]/.test(glnCell)) count(result, "severalGlns");
		const name = cell("Apotekets namn");
		if (!name) {
			quarantine(result, row.rowNo, "no name", gln);
			continue;
		}
		if (CLOSED_TO_PUBLIC.test(name)) {
			skip(result, "closed to the public");
			continue;
		}
		if (seen.has(gln)) {
			skip(result, "repeated GLN");
			continue;
		}
		seen.add(gln);
		const kommun = cell("Kommun");
		if (!kommun) {
			quarantine(result, row.rowNo, "no municipality", gln);
			continue;
		}
		const qualifications: SeQualification[] = [];
		const caseNumber = cell("Tillstånd diarienr");
		if (caseNumber) {
			const from = excelDate(cell("Tillstånd giltigt från"));
			if (!from) count(result, "noLicenceDate");
			qualifications.push({ source: SE_LICENCE_SOURCE, code: caseNumber, label: from });
		} else count(result, "noLicenceNumber");
		const holder = cell("Tillståndshavare");
		const number = legalPersonNumber(cell("Tillståndshavare org.nr."));
		if (holder && number) {
			qualifications.push({ source: SE_HOLDER_SOURCE, code: number, label: holder });
		} else if (holder) count(result, "holdersOmitted");
		const rawPostcode = cell("Postnummer");
		const postcode = normalizeSePostcode(rawPostcode);
		if (rawPostcode && !postcode) count(result, "invalidPostcodes");
		const street = cell("Besöksadress");
		if (!street) count(result, "noStreet");
		result.rows.push({
			source: "apotek",
			lineNo: row.rowNo,
			idScheme: "SE-GLN",
			nationalId: gln,
			professionCode: SE_SOURCES.apotek.professionCode,
			name,
			qualifications,
			street: street || null,
			postcode,
			city: cell("Ort") || null,
			kommun,
			latitude: null,
			longitude: null,
		});
	}
	if (!index) throw new Error("no header row (Län, Kommun, Apotekets namn… GLN-kod)");
	return result;
}
