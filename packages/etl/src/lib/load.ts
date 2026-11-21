/**
 * Streaming load of a `|`-separated file into a staging table with COPY,
 * quarantining malformed lines.
 */
import { type CopyValue, type CopyWriter, openCopy } from "./copy";
import type { Sql } from "./db";
import { mapColumns, readLines } from "./text";

export type QuarantineSample = { file: string; lineNo: number; reason: string };

/** Collects rejected lines: written to stg_quarantine, counted and sampled. */
export class Quarantine {
	count = 0;
	readonly byFile = new Map<string, number>();
	readonly byReason = new Map<string, number>();
	readonly samples: QuarantineSample[] = [];

	constructor(private readonly writer: CopyWriter) {}

	static async open(sql: Sql): Promise<Quarantine> {
		return new Quarantine(
			await openCopy(sql, "directory.stg_quarantine", ["file", "line_no", "reason", "sample"]),
		);
	}

	async add(file: string, lineNo: number, reason: string, line: string): Promise<void> {
		this.count++;
		this.byFile.set(file, (this.byFile.get(file) ?? 0) + 1);
		this.byReason.set(reason, (this.byReason.get(reason) ?? 0) + 1);
		if (this.samples.length < 20) this.samples.push({ file, lineNo, reason });
		await this.writer.write([file, lineNo, reason, line.slice(0, 500)]);
	}

	async close(): Promise<void> {
		await this.writer.end();
	}

	summary() {
		return {
			count: this.count,
			byFile: Object.fromEntries(this.byFile),
			byReason: Object.fromEntries(this.byReason),
			samples: this.samples,
		};
	}
}

export type LoadStats = {
	/** Data lines (header excluded). */
	lines: number;
	/** Staging rows written. */
	rows: number;
	skipped: number;
	quarantined: number;
};

type Parsed<Row> =
	| { kind: "row"; row: Row }
	| { kind: "skip" }
	| { kind: "quarantine"; reason: string };

export type LoadOptions<Key extends string, Row> = {
	sql: Sql;
	fileKey: string;
	path: string;
	columns: Readonly<Record<Key, string>>;
	table: string;
	tableColumns: readonly string[];
	quarantine: Quarantine;
	parse: (
		fields: string[],
		columnCount: number,
		index: Record<Key, number>,
		lineNo: number,
	) => Parsed<Row>;
	/** Staging rows of a parsed row (one line can yield several rows). */
	rowsOf: (row: Row) => readonly (readonly CopyValue[])[];
	onRow?: (row: Row) => void;
};

export async function loadPipeFile<Key extends string, Row>(
	options: LoadOptions<Key, Row>,
): Promise<LoadStats> {
	const stats: LoadStats = { lines: 0, rows: 0, skipped: 0, quarantined: 0 };
	const writer = await openCopy(options.sql, options.table, options.tableColumns);
	let index: Record<Key, number> | null = null;
	let columnCount = 0;
	let lineNo = 0;
	try {
		for await (const line of readLines(options.path)) {
			lineNo++;
			if (index === null) {
				const header = line.split("|");
				index = mapColumns(options.fileKey, header, options.columns);
				columnCount = header.length;
				continue;
			}
			if (line === "") continue;
			stats.lines++;
			const parsed = options.parse(line.split("|"), columnCount, index, lineNo);
			if (parsed.kind === "skip") {
				stats.skipped++;
			} else if (parsed.kind === "quarantine") {
				stats.quarantined++;
				await options.quarantine.add(options.fileKey, lineNo, parsed.reason, line);
			} else {
				options.onRow?.(parsed.row);
				for (const values of options.rowsOf(parsed.row)) {
					await writer.write(values);
					stats.rows++;
				}
			}
		}
		if (index === null) throw new Error(`${options.fileKey}: empty file`);
	} finally {
		await writer.end();
	}
	return stats;
}
