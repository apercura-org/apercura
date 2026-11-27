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
