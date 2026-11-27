/**
 * Reading the CSV files of data.gov.lt's store (Spinta): a header line, then quoted records.
 * The portal's full downloads add `_type`, `_id`, `_revision`, `_page.next` columns, a
 * `?select(…)` download has only the columns asked for; either reads, by column name. A
 * missing column fails the import.
 */
import { MissingColumnsError, readQuotedRecords } from "../../lib/text";
import type { LtAddressTables } from "./address";

export type ModelRow = Readonly<Record<string, string>> & { readonly lineNo?: number };

/**
 * Streams the rows of a model file as records of the named columns only: whatever else a line
 * carries is never kept. Throws when a column is missing.
 */
export async function* readModel(
	path: string,
	file: string,
	columns: readonly string[],
): AsyncGenerator<{ lineNo: number; row: Record<string, string> }> {
	let indexes: number[] | null = null;
	for await (const { lineNo, fields } of readQuotedRecords(path, ",")) {
		if (!indexes) {
			const header = fields.map((name) => name.replace(/^\uFEFF/, "").trim());
			const found = columns.map((column) => header.indexOf(column));
			const missing = columns.filter((_, index) => (found[index] ?? -1) < 0);
			if (missing.length > 0) throw new MissingColumnsError(file, missing);
			indexes = found;
			continue;
		}
		if (fields.length === 1 && (fields[0] ?? "").trim() === "") continue;
		const row: Record<string, string> = {};
		for (const [index, column] of columns.entries()) {
			row[column] = (fields[indexes[index] ?? -1] ?? "").trim();
		}
		yield { lineNo, row };
	}
	if (!indexes) throw new Error(`${file}: empty file`);
}

/** Every row of a model file, in memory (the small tables). */
export async function readModelRows(
	path: string,
	file: string,
	columns: readonly string[],
): Promise<Record<string, string>[]> {
	const rows: Record<string, string>[] = [];
	for await (const { row } of readModel(path, file, columns)) rows.push(row);
	return rows;
}

/**
 * The Address Register's text tables an address is placed with: the 60 municipalities, the
 * current elderships and the current settlements (a settlement or eldership with an end date
 * `gyv_iki`, `sen_iki` no longer exists).
 */
export function addressTablesOf(
	municipalities: Record<string, string>[],
	elderships: Record<string, string>[],
	settlements: Record<string, string>[],
): LtAddressTables {
	return {
		municipalities: municipalities
			.filter((row) => row.sav_kodas && row.pavadinimas)
			.map((row) => ({
				id: row._id ?? "",
				code: row.sav_kodas ?? "",
				name: (row.pavadinimas ?? "").replace(/\s+/g, " ").trim(),
				countyId: row["apskritis._id"] ?? "",
			})),
		elderships: elderships
			.filter((row) => row.sen_kodas && row.pavadinimas && !row.sen_iki)
			.map((row) => ({
				id: row._id ?? "",
				code: row.sen_kodas ?? "",
				name: (row.pavadinimas ?? "").replace(/\s+/g, " ").trim(),
				municipalityId: row["savivaldybe._id"] ?? "",
			})),
		settlements: settlements
			.filter((row) => row.gyv_kodas && row.pavadinimas && !row.gyv_iki)
			.map((row) => ({
				code: row.gyv_kodas ?? "",
				type: (row.tipo_santrumpa ?? "").replace(/\s+/g, " ").trim(),
				genitive: (row.pavadinimas_k ?? row.pavadinimas ?? "").replace(/\s+/g, " ").trim(),
				name: (row.pavadinimas ?? "").replace(/\s+/g, " ").trim(),
				municipalityId: row["savivaldybe._id"] ?? "",
				eldershipId: row["seniunija._id"] || null,
			})),
	};
}
