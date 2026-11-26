/**
 * Minimal XLSX (Office Open XML spreadsheet) reader for the open-data workbooks published as
 * spreadsheets (the Spanish register's monthly extracts, the German statistical offices'
 * directories): the shared strings and the rows of one worksheet, as text. No formulas are evaluated, no styles, dates or number formats are read: a
 * cell is the text the file stores (a shared string, an inline string or the raw value). The
 * worksheet is streamed, so a sheet of 135 MB never sits inflated in memory.
 *
 * `writeXlsx` and `writeXlsxSheets` write the same subset, for test fixtures.
 */
import { readZipEntries, writeStoredZip, zipEntryStream } from "./zip";

export type XlsxRow = {
	/** Row number as the sheet gives it (`r`), from 1. */
	rowNo: number;
	/** Cell texts by column, from column A; a missing cell is an empty string. */
	cells: string[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodes the XML entities of a text node (`&amp;`, `&#241;`, `&#xF1;`). */
export function decodeXml(value: string): string {
	return value.replace(
		/&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g,
		(_, name, dec, hex) => {
			if (name) return ENTITIES[name] ?? "";
			const code = dec ? Number(dec) : Number.parseInt(hex, 16);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: "";
		},
	);
}

/** The text of a string item (`<si>` or `<is>`): its `<t>` runs, without phonetic runs (`<rPh>`). */
function itemText(body: string): string {
	const withoutPhonetics = body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
	let text = "";
	for (const match of withoutPhonetics.matchAll(
		/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g,
	)) {
		text += decodeXml(match[1] ?? "");
	}
	return text;
}

/** The shared strings of a workbook (`xl/sharedStrings.xml`), in order. */
export function parseSharedStrings(xml: string): string[] {
	const strings: string[] = [];
	for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g))
		strings.push(itemText(match[1] ?? ""));
	return strings;
}

/** Column index of a cell reference (`A1` → 0, `AB12` → 27). */
export function columnIndex(reference: string): number {
	let index = 0;
	for (const char of reference) {
		const code = char.charCodeAt(0);
		if (code < 65 || code > 90) break;
		index = index * 26 + (code - 64);
	}
	return index - 1;
}

/** The cells of one `<row>` element's body. */
export function parseRowCells(body: string, shared: readonly string[]): string[] {
	const cells: string[] = [];
	let next = 0;
	for (const match of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
		const attributes = match[1] ?? "";
		const content = match[2] ?? "";
		const reference = /\br="([A-Z]+)\d*"/.exec(attributes)?.[1];
		const column = reference ? columnIndex(reference) : next;
		next = column + 1;
		const type = /\bt="([^"]*)"/.exec(attributes)?.[1] ?? "n";
		let value = "";
		if (type === "inlineStr") {
			value = itemText(/<is>([\s\S]*?)<\/is>/.exec(content)?.[1] ?? "");
		} else {
			const raw = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1];
			if (raw !== undefined) {
				if (type === "s") {
					const index = Number(raw);
					value = Number.isInteger(index) ? (shared[index] ?? "") : "";
				} else {
					value = decodeXml(raw);
				}
			}
		}
		while (cells.length < column) cells.push("");
		cells[column] = value;
	}
	return cells;
}

/** A worksheet of a workbook: its name as the workbook gives it and the path of its XML part. */
export type XlsxSheet = { name: string; path: string };

/**
 * The worksheets of a workbook, in the workbook's order (`xl/workbook.xml` and its relations).
 * A workbook without them reads as one sheet at `xl/worksheets/sheet1.xml`.
 */
export function xlsxSheets(archive: Buffer): XlsxSheet[] {
	const [workbook] = readZipEntries(archive, (name) => name === "xl/workbook.xml");
	const [rels] = readZipEntries(archive, (name) => name === "xl/_rels/workbook.xml.rels");
	const fallback = [{ name: "", path: "xl/worksheets/sheet1.xml" }];
	if (!workbook || !rels) return fallback;
	const targets = new Map<string, string>();
	for (const match of rels.data.toString("utf8").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
		const attributes = match[1] ?? "";
		const id = /\bId="([^"]+)"/.exec(attributes)?.[1];
		const target = /\bTarget="([^"]+)"/.exec(attributes)?.[1];
		if (!id || !target) continue;
		targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
	}
	const sheets: XlsxSheet[] = [];
	for (const match of workbook.data.toString("utf8").matchAll(/<sheet\b([^>]*?)\/?>/g)) {
		const attributes = match[1] ?? "";
		const name = decodeXml(/\bname="([^"]*)"/.exec(attributes)?.[1] ?? "");
		const path = targets.get(/\br:id="([^"]+)"/.exec(attributes)?.[1] ?? "");
		if (path) sheets.push({ name, path });
	}
	return sheets.length > 0 ? sheets : fallback;
}

/**
 * The rows of a worksheet, streamed: the workbook's first, or the one named `sheet` (a name, or a
 * test on the name as the workbook gives it, which may carry stray spaces: ` KHV_2024`). Throws
 * when the file is not a ZIP, has no such worksheet, or a row is malformed beyond reading.
 */
export async function* xlsxRows(
	archive: Buffer,
	sheet?: string | ((name: string) => boolean),
): AsyncGenerator<XlsxRow> {
	const [sharedEntry] = readZipEntries(archive, (name) => name === "xl/sharedStrings.xml");
	const shared = sharedEntry ? parseSharedStrings(sharedEntry.data.toString("utf8")) : [];
	const sheets = xlsxSheets(archive);
	const wanted =
		sheet === undefined
			? sheets[0]
			: sheets.find((candidate) =>
					typeof sheet === "string" ? candidate.name === sheet : sheet(candidate.name),
				);
	if (!wanted) throw new Error(`not a spreadsheet with the worksheet ${String(sheet)}`);
	const path = wanted.path;
	const stream = zipEntryStream(archive, path);
	if (!stream) throw new Error(`not a spreadsheet: no worksheet ${path}`);
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	let implicit = 0;
	const rowPattern = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
	for await (const chunk of stream) {
		buffer += decoder.decode(chunk as Buffer, { stream: true });
		let consumed = 0;
		rowPattern.lastIndex = 0;
		for (let match = rowPattern.exec(buffer); match; match = rowPattern.exec(buffer)) {
			consumed = rowPattern.lastIndex;
			const rowNo = Number(/\br="(\d+)"/.exec(match[1] ?? "")?.[1] ?? implicit + 1);
			implicit = rowNo;
			yield { rowNo, cells: parseRowCells(match[2] ?? "", shared) };
		}
		buffer = buffer.slice(consumed);
	}
	buffer += decoder.decode();
	if (/<row\b/.test(buffer)) throw new Error("truncated worksheet: an unfinished row");
}

const escapeXml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const columnName = (index: number): string => {
	let name = "";
	for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
		name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	}
	return name;
};

/**
 * A workbook of one worksheet (`Hoja1`) holding `rows` as shared strings, the way the register's
 * extracts store their text: fixtures and tests only. `deflate` compresses the entries as the
 * published files do.
 */
export function writeXlsx(rows: readonly (readonly string[])[], { deflate = false } = {}): Buffer {
	return writeXlsxSheets([{ name: "Hoja1", rows }], { deflate });
}

/**
 * A workbook of several worksheets, in order, their text in one shared strings table: fixtures
 * and tests only.
 */
export function writeXlsxSheets(
	sheets: readonly { name: string; rows: readonly (readonly string[])[] }[],
	{ deflate = false } = {},
): Buffer {
	const shared: string[] = [];
	const indexOf = new Map<string, number>();
	const sheetXml = sheets.map(({ rows }) =>
		rows
			.map((row, rowIndex) => {
				const cells = row
					.map((value, column) => {
						const reference = `${columnName(column)}${rowIndex + 1}`;
						if (value === "") return `<c r="${reference}"/>`;
						let index = indexOf.get(value);
						if (index === undefined) {
							index = shared.length;
							shared.push(value);
							indexOf.set(value, index);
						}
						return `<c r="${reference}" t="s"><v>${index}</v></c>`;
					})
					.join("");
				return `<row r="${rowIndex + 1}">${cells}</row>`;
			})
			.join(""),
	);
	const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
	const relsNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
	const pkgRels = "http://schemas.openxmlformats.org/package/2006/relationships";
	const text = (name: string, value: string) => ({ name, data: Buffer.from(value, "utf8") });
	const numbers = sheets.map((_, index) => index + 1);
	const sharedId = `rId${sheets.length + 1}`;
	return writeStoredZip(
		[
			text(
				"[Content_Types].xml",
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${numbers
					.map(
						(n) =>
							`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
					)
					.join(
						"",
					)}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
			),
			text(
				"_rels/.rels",
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${pkgRels}"><Relationship Id="rId1" Type="${relsNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
			),
			text(
				"xl/workbook.xml",
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${main}" xmlns:r="${relsNs}"><sheets>${sheets
					.map(
						(sheet, index) =>
							`<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
					)
					.join("")}</sheets></workbook>`,
			),
			text(
				"xl/_rels/workbook.xml.rels",
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${pkgRels}">${numbers
					.map(
						(n) =>
							`<Relationship Id="rId${n}" Type="${relsNs}/worksheet" Target="worksheets/sheet${n}.xml"/>`,
					)
					.join(
						"",
					)}<Relationship Id="${sharedId}" Type="${relsNs}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
			),
			text(
				"xl/sharedStrings.xml",
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${main}" count="${shared.length}" uniqueCount="${shared.length}">${shared
					.map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`)
					.join("")}</sst>`,
			),
			...sheetXml.map((rows, index) =>
				text(
					`xl/worksheets/sheet${index + 1}.xml`,
					`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${main}"><sheetData>${rows}</sheetData></worksheet>`,
				),
			),
		],
		{ deflate },
	);
}
