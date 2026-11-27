/**
 * Streaming readers of the Norwegian files: the register's gzipped CSV files (every field quoted,
 * an address of several lines inside one quoted field) and Kartverket's `;` CSV in a ZIP. The
 * files are large (the register's establishments about 870,000 records, its entities about
 * 1.2 million, the addresses 2.6 million), so they are read one record at a time and only the
 * records a caller wants are parsed in full.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { parseQuotedRecord } from "../../lib/text";

export type CsvRecord = { lineNo: number; fields: string[] };

/**
 * The records of a quoted CSV stream whose first physical line `wanted` accepts (the header is
 * always read). A record whose quoted field runs over several lines is joined back; a line that
 * is not wanted is skipped without parsing, and so are the continuation lines of a record that
 * was not wanted (they never start with a quoted organisation number, which `isRecordStart`
 * tells). `lineNo` counts records, from 1 for the first after the header.
 */
export async function* readCsvRecords(
	input: Readable,
	{
		delimiter,
		wanted = () => true,
		isRecordStart = () => true,
		counter,
	}: {
		delimiter: string;
		wanted?: (line: string) => boolean;
		isRecordStart?: (line: string) => boolean;
		/** Counts every record read, wanted or not. */
		counter?: { records: number };
	},
): AsyncGenerator<CsvRecord & { header: boolean }> {
	const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	let pending: string | null = null;
	let record = 0;
	let first = true;
	try {
		for await (const raw of lines) {
			if (first) {
				first = false;
				const fields = parseQuotedRecord(raw.replace(/^﻿/, ""), delimiter);
				if (fields) yield { lineNo: 0, fields, header: true };
				continue;
			}
			if (pending !== null) {
				pending = `${pending}\n${raw}`;
			} else {
				if (!isRecordStart(raw)) continue;
				record++;
				if (counter) counter.records = record;
				if (!wanted(raw)) continue;
				pending = raw;
			}
			const fields = parseQuotedRecord(pending, delimiter);
			if (fields === null) {
				// A quoted field still open: an address of several lines, at most a few.
				if (pending.length > 20_000) pending = null;
				continue;
			}
			pending = null;
			yield { lineNo: record, fields, header: false };
		}
	} finally {
		lines.close();
	}
}

/** A gzipped file as a stream of text. */
export function gunzipFile(path: string): Readable {
	return createReadStream(path, { highWaterMark: 1 << 20 }).pipe(createGunzip());
}
