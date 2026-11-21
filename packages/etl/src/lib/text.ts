/**
 * Line-oriented readers for the open data files.
 *
 * The ANS files are `|`-separated with no quoting at all (a literal `"` may
 * appear in a value), so lines are split on `|` without a CSV parser and fields
 * are mapped by header name: the ANS may add columns, and a missing expected
 * column fails the import. The Ameli file is a real `;` CSV with quotes and a
 * BOM, read with a small quote-aware parser.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* readLines(path: string): AsyncGenerator<string> {
	const input = createReadStream(path, { encoding: "utf8", highWaterMark: 1 << 20 });
	const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	try {
		for await (const line of lines) yield line;
	} finally {
		lines.close();
		input.destroy();
	}
}

export class MissingColumnsError extends Error {
	constructor(
		readonly file: string,
		readonly missing: string[],
	) {
		super(`${file}: missing expected column(s): ${missing.join(", ")}`);
	}
}

/**
 * Maps expected column names to their index in a header line. Extra columns
 * are allowed; a missing one throws.
 */
export function mapColumns<Key extends string>(
	file: string,
	header: string[],
	expected: Readonly<Record<Key, string>>,
): Record<Key, number> {
	const normalized = header.map((name) => name.replace(/^\uFEFF/, "").trim());
	const indexes = {} as Record<Key, number>;
	const missing: string[] = [];
	for (const [key, name] of Object.entries(expected) as [Key, string][]) {
		const index = normalized.indexOf(name);
		if (index < 0) missing.push(name);
		indexes[key] = index;
	}
	if (missing.length > 0) throw new MissingColumnsError(file, missing);
	return indexes;
}

/**
 * Parses one delimited record with double-quote quoting (`""` escapes a quote).
 * Returns null when a quoted field is still open at the end of the input, so
 * the caller can append the next physical line (embedded newline).
 */
export function parseQuotedRecord(input: string, delimiter: string): string[] | null {
	const fields: string[] = [];
	let field = "";
	let inQuotes = false;
	let atFieldStart = true;
	for (let index = 0; index < input.length; index++) {
		const char = input[index];
		if (inQuotes) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"' && atFieldStart) {
			inQuotes = true;
			atFieldStart = false;
		} else if (char === delimiter) {
			fields.push(field);
			field = "";
			atFieldStart = true;
		} else {
			field += char;
			atFieldStart = false;
		}
	}
	if (inQuotes) return null;
	fields.push(field);
	return fields;
}

/** Reads quoted CSV records, joining physical lines inside quoted fields. */
export async function* readQuotedRecords(
	path: string,
	delimiter: string,
): AsyncGenerator<{ lineNo: number; fields: string[] }> {
	let pending: string | null = null;
	let startLine = 0;
	let lineNo = 0;
	for await (const raw of readLines(path)) {
		lineNo++;
		const line = lineNo === 1 ? raw.replace(/^\uFEFF/, "") : raw;
		const input: string = pending === null ? line : `${pending}\n${line}`;
		if (pending === null) startLine = lineNo;
		const fields = parseQuotedRecord(input, delimiter);
		if (fields === null) {
			pending = input;
			continue;
		}
		pending = null;
		yield { lineNo: startLine, fields };
	}
	if (pending !== null) {
		const fields = parseQuotedRecord(`${pending}"`, delimiter);
		if (fields) yield { lineNo: startLine, fields };
	}
}

/** Empty strings become null; values are trimmed. */
export const nullIfEmpty = (value: string | undefined): string | null => {
	if (value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
};
