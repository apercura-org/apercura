import { describe, expect, it } from "vitest";
import {
	columnIndex,
	decodeXml,
	parseRowCells,
	parseSharedStrings,
	writeXlsx,
	type XlsxRow,
	xlsxRows,
} from "./xlsx";
import { writeStoredZip } from "./zip";

const collect = async (archive: Buffer) => {
	const rows: XlsxRow[] = [];
	for await (const row of xlsxRows(archive)) rows.push(row);
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
});
