import { describe, expect, it } from "vitest";
import {
	columnIndex,
	decodeXml,
	parseRowCells,
	parseSharedStrings,
	writeXlsx,
	writeXlsxSheets,
	type XlsxRow,
	xlsxRows,
	xlsxSheets,
} from "./xlsx";
import { writeStoredZip } from "./zip";

const collect = async (archive: Buffer, sheet?: string | ((name: string) => boolean)) => {
	const rows: XlsxRow[] = [];
	for await (const row of xlsxRows(archive, sheet)) rows.push(row);
	return rows;
};

describe("the XLSX reader", () => {
	const table = [
		["Tipo centro", "Nombre", "Teléfono"],
		["C251 - Clínicas Dentales", "CLÍNICA & <SONRISA>", ""],
		["", "", "965950865"],
	];

	it.each([false, true])("reads back what it writes (deflate %s)", async (deflate) => {
		const rows = await collect(writeXlsx(table, { deflate }));
		expect(rows).toEqual([
			{ rowNo: 1, cells: table[0] },
			{ rowNo: 2, cells: ["C251 - Clínicas Dentales", "CLÍNICA & <SONRISA>", ""] },
			{ rowNo: 3, cells: ["", "", "965950865"] },
		]);
	});

	it("streams a sheet larger than one chunk", async () => {
		const many = Array.from({ length: 5_000 }, (_, index) => [`fila ${index}`, String(index)]);
		const rows = await collect(writeXlsx(many, { deflate: true }));
		expect(rows).toHaveLength(5_000);
		expect(rows[4_999]).toEqual({ rowNo: 5_000, cells: ["fila 4999", "4999"] });
	});

	it("reads shared, inline, rich and numeric cells by their column", () => {
		expect(
			parseSharedStrings(
				'<sst><si><t>a</t></si><si><r><t>b</t></r><r><t xml:space="preserve"> c</t></r><rPh><t>x</t></rPh></si><si/></sst>',
			),
		).toEqual(["a", "b c", ""]);
		expect(
			parseRowCells(
				'<c r="A1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>en l&#237;nea</t></is></c><c r="D1"><v>40</v></c><c r="E1"/>',
				["x", "compartida"],
			),
		).toEqual(["compartida", "", "en línea", "40", ""]);
		expect(columnIndex("A1")).toBe(0);
		expect(columnIndex("AB12")).toBe(27);
		expect(decodeXml("&amp;&lt;&#xF1;&quot;")).toBe('&<ñ"');
	});

	it("refuses a ZIP without a worksheet", async () => {
		const archive = writeStoredZip([{ name: "x.txt", data: Buffer.from("x") }]);
		await expect(collect(archive)).rejects.toThrow(/no worksheet/);
	});

	it("reads a worksheet by its name, stray spaces and all", async () => {
		const archive = writeXlsxSheets([
			{ name: "Titelblatt", rows: [["Verzeichnis"]] },
			{ name: " KHV_2024", rows: [["KH_Name"], ["Klinikum Beispiel"]] },
			{ name: "RHV_2024", rows: [["RH_Name"]] },
		]);
		expect(xlsxSheets(archive).map((sheet) => sheet.name)).toEqual([
			"Titelblatt",
			" KHV_2024",
			"RHV_2024",
		]);
		expect(await collect(archive)).toEqual([{ rowNo: 1, cells: ["Verzeichnis"] }]);
		expect((await collect(archive, (name) => /^KHV_\d{4}$/.test(name.trim()))).length).toBe(2);
		expect(await collect(archive, "RHV_2024")).toEqual([{ rowNo: 1, cells: ["RH_Name"] }]);
		await expect(collect(archive, "DSB_KHV_2024")).rejects.toThrow(/DSB_KHV_2024/);
	});
});

describe("a workbook whose elements carry a namespace prefix", () => {
	it("reads its sheets and rows as an unprefixed one", async () => {
		const ns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
		const archive = writeStoredZip([
			{
				name: "xl/workbook.xml",
				data: Buffer.from(
					`<?xml version="1.0"?><x:workbook ${ns}><x:sheets><x:sheet name="2026-11-27" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`,
				),
			},
			{
				name: "xl/_rels/workbook.xml.rels",
				data: Buffer.from(
					'\uFEFF<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="worksheet" Target="/xl/worksheets/sheet1.xml" Id="R1" /></Relationships>',
				),
			},
			{
				name: "xl/worksheets/sheet1.xml",
				data: Buffer.from(
					`<?xml version="1.0"?><x:worksheet ${ns}><x:sheetData><x:row r="1"><x:c r="A1" t="str"><x:v>Län</x:v></x:c><x:c r="C1" t="str"><x:v>GLN-kod</x:v></x:c></x:row><x:row r="2" /><x:row r="3"><x:c r="A3" t="str"><x:v>Blekinge &amp; Skåne</x:v></x:c><x:c r="B3" s="6"><x:v>42248</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
				),
			},
		]);
		expect(xlsxSheets(archive)).toEqual([{ name: "2026-11-27", path: "xl/worksheets/sheet1.xml" }]);
		expect(await collect(archive)).toEqual([
			{ rowNo: 1, cells: ["Län", "", "GLN-kod"] },
			{ rowNo: 2, cells: [] },
			{ rowNo: 3, cells: ["Blekinge & Skåne", "42248"] },
		]);
	});
});
