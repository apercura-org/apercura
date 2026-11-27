/**
 * The National Health Service's quarterly list of GPs (Nacionālais veselības dienests,
 * "Ģimenes ārsta praksē reģistrēto pacientu skaits", data.gov.lv, CC0 1.0): one workbook per
 * quarter, one row per GP with the territorial office, the medical institution's code and name,
 * the GP's family name, first name and identifier, a status, and the patients registered by age
 * group. The registered GPs only are read (`Reģistrēts`; the `Pasīvi reģistrēts` lines are
 * totals of the patients whose GP left, without an institution).
 *
 * What a page needs is read, nothing more: the institution's code and name and the GP's names.
 * The GP's identifier and the patient counts are never read into a row (docs/data-import.md,
 * "Latvia": minimisation).
 */
import { xlsxRows } from "../../lib/xlsx";
import { clean } from "./names";

export type NvdGp = {
	/** Row of the worksheet, from 1. */
	lineNo: number;
	/** The medical institution's code (nine digits). */
	code: string;
	/** The institution's name as published (`Ilzes Paraugas ģimenes ārsta prakse, SIA`). */
	institution: string;
	firstName: string;
	lastName: string;
};

export type NvdList = {
	/** GP rows read (registered ones). */
	lines: number;
	gps: NvdGp[];
	quarantined: { lineNo: number; reason: string; sample: string }[];
	skipped: Record<string, number>;
};

/** The columns read, by their header (compared without case or extra spaces). */
const COLUMNS = {
	code: "ārstniecības iestādes kods",
	institution: "ārstniecības iestādes nosaukums",
	lastName: "ģimenes ārsta uzvārds",
	firstName: "ģimenes ārsta vārds",
	status: "statuss",
} as const;

const headerKey = (value: string) => clean(value).toLocaleLowerCase("lv");

/**
 * Reads the GPs of the workbook. Throws when no sheet has the expected header (another file, a
 * changed format).
 */
export async function parseNvd(archive: Buffer): Promise<NvdList> {
	const list: NvdList = { lines: 0, gps: [], quarantined: [], skipped: {} };
	let columns: Record<keyof typeof COLUMNS, number> | null = null;
	for await (const row of xlsxRows(archive)) {
		const cells = row.cells.map((cell) => clean(cell));
		if (!columns) {
			const keys = cells.map(headerKey);
			const found = Object.fromEntries(
				Object.entries(COLUMNS).map(([key, name]) => [key, keys.indexOf(name)]),
			) as Record<keyof typeof COLUMNS, number>;
			if (Object.values(found).every((index) => index >= 0)) columns = found;
			continue;
		}
		if (cells.every((cell) => cell === "")) continue;
		const status = cells[columns.status] ?? "";
		if (status.toLocaleLowerCase("lv") !== "reģistrēts") {
			list.skipped[status ? "notRegistered" : "noStatus"] =
				(list.skipped[status ? "notRegistered" : "noStatus"] ?? 0) + 1;
			continue;
		}
		list.lines++;
		const rawCode = (cells[columns.code] ?? "").replace(/\s/g, "");
		const code = /^\d{1,9}$/.test(rawCode) ? rawCode.padStart(9, "0") : null;
		const institution = cells[columns.institution] ?? "";
		const firstName = cells[columns.firstName] ?? "";
		const lastName = cells[columns.lastName] ?? "";
		if (!rawCode) {
			// A GP registered without an institution (between practices): no place to list.
			list.skipped.noInstitution = (list.skipped.noInstitution ?? 0) + 1;
			continue;
		}
		if (!code) {
			list.quarantined.push({ lineNo: row.rowNo, reason: "institution code", sample: rawCode });
			continue;
		}
		if (!institution || !lastName) {
			list.quarantined.push({ lineNo: row.rowNo, reason: "no name", sample: code });
			continue;
		}
		list.gps.push({ lineNo: row.rowNo, code, institution, firstName, lastName });
	}
	if (!columns) throw new Error("not the NVD's list of GPs: no sheet with its header");
	return list;
}

/**
 * The quarter a resource of the dataset is of, from its name (`2026_03 Ģimenes ārsta praksē…`,
 * `202212_Ģimenes…`, `2022_09 …`): `202603`. A yearly file of the first years
 * (`2019_Ģimenes…`, figures at 31 December) is that year's fourth quarter. Null when the name
 * says no date.
 */
export function nvdEditionOf(name: string): number | null {
	const quarter = /^(20\d{2})[_ -]?(0[1-9]|1[0-2])(?!\d)/.exec(clean(name));
	if (quarter) return Number(`${quarter[1]}${quarter[2]}`);
	const year = /^(20\d{2})(?!\d)/.exec(clean(name));
	return year ? Number(`${year[1]}12`) : null;
}
