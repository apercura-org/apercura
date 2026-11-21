/**
 * Bulk loading with PostgreSQL COPY (text format), with stream backpressure.
 */
import { once } from "node:events";
import type { Writable } from "node:stream";
import type { Sql } from "./db";

export type CopyValue = string | number | boolean | null | undefined;

/** Escapes one value for COPY text format (`\N` is NULL). */
export function copyEscape(value: CopyValue): string {
	if (value === null || value === undefined) return "\\N";
	const text = typeof value === "string" ? value : String(value);
	return text.replace(/[\\\t\n\r]/g, (char) => {
		switch (char) {
			case "\\":
				return "\\\\";
			case "\t":
				return "\\t";
			case "\n":
				return "\\n";
			default:
				return "\\r";
		}
	});
}

export function copyLine(values: readonly CopyValue[]): string {
	return `${values.map(copyEscape).join("\t")}\n`;
}

/** Buffers rows into ~1 MiB chunks and writes them with backpressure. */
export class CopyWriter {
	private buffer: string[] = [];
	private size = 0;
	rows = 0;

	constructor(private readonly stream: Writable) {}

	async write(values: readonly CopyValue[]): Promise<void> {
		const line = copyLine(values);
		this.buffer.push(line);
		this.size += line.length;
		this.rows++;
		if (this.size >= 1 << 20) await this.flush();
	}

	private async flush(): Promise<void> {
		if (this.buffer.length === 0) return;
		const chunk = this.buffer.join("");
		this.buffer = [];
		this.size = 0;
		if (!this.stream.write(chunk)) await once(this.stream, "drain");
	}

	async end(): Promise<void> {
		await this.flush();
		const finished = new Promise<void>((resolve, reject) => {
			this.stream.once("finish", resolve);
			this.stream.once("error", reject);
		});
		this.stream.end();
		await finished;
	}
}

/**
 * Opens `COPY table (columns) FROM STDIN` and returns a writer. Table and
 * column names come from code, never from input.
 */
export async function openCopy(
	sql: Sql,
	table: string,
	columns: readonly string[],
): Promise<CopyWriter> {
	const stream = await sql
		.unsafe(`COPY ${table} (${columns.map((column) => `"${column}"`).join(", ")}) FROM STDIN`)
		.writable();
	return new CopyWriter(stream);
}
