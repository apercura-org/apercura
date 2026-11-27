/**
 * The health insurer's lists of the doctors who can be chosen as a personal doctor (Zavod za
 * zdravstveno zavarovanje Slovenije, "Poimenski seznami zdravnikov, ki so lahko osebni
 * zdravniki", CC BY 4.0 on podatki.gov.si). The open data portal names an HTML page; that page
 * links the day's workbooks, one per kind of doctor, at addresses that change with every
 * publication. A run reads the page once, then downloads the three workbooks that name doctors
 * (the fourth, the additional practices for adults without a doctor, names none). Pure parsing
 * here; the run fetches.
 */
import { isValidSiSourceId, normalizeSiPostcode } from "@apercura/core";
import { siProfessionOfActivity } from "@apercura/core/taxonomy";
import { decodeXml, xlsxRows } from "../../lib/xlsx";
import {
	quarantine,
	type SiAcceptance,
	type SiParseResult,
	type SiRow,
	type SiSourceId,
	skip,
} from "./types";

/** The page the dataset names, where each day's workbooks are linked. */
export const ZZZS_LISTS_PAGE =
	"https://zavarovanec.zzzs.si/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov/";

/** A text without case, accents or punctuation, for comparing labels. */
export function foldSl(value: string): string {
	return value
		.replace(/[đĐ]/g, "d")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Which list a link of the page is, by its title; null for the lists the run does not read. */
export function listOfTitle(title: string): SiSourceId | null {
	const text = foldSl(title);
	if (text.includes("dodatn")) return null;
	if (text.includes("ginekolog")) return "gin";
	if (text.includes("zobozdravnik")) return "zob";
	if (text.includes("splosnih zdravnik")) return "sa";
	return null;
}

/**
 * The workbook of each list linked from the page, as absolute addresses. Throws when a list's
 * link is missing or given twice: the page changed and the run must not guess.
 */
export function listLinks(html: string, base = ZZZS_LISTS_PAGE): Record<SiSourceId, string> {
	const found: Partial<Record<SiSourceId, string>> = {};
	for (const match of html.matchAll(
		/<a\b[^>]*\bhref="([^"]*stdatoteke=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
	)) {
		const title = decodeXml(match[2]?.replace(/<[^>]+>/g, " ") ?? "");
		const list = listOfTitle(title);
		if (!list) continue;
		if (found[list]) throw new Error(`the page links the ${list} list twice`);
		found[list] = new URL(decodeXml(match[1] ?? ""), base).toString();
	}
	for (const list of ["sa", "gin", "zob"] as const) {
		if (!found[list]) throw new Error(`the page links no ${list} list`);
	}
	return found as Record<SiSourceId, string>;
}

/** A date of the sheet (`26.11.2026`, `27.11.2026 ob 07.00`) as `YYYY-MM-DD`, or null. */
export function sheetDate(value: string): string | null {
	const match = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/.exec(value);
	if (!match) return null;
	const [, day = "", month = "", year = ""] = match;
	const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	const date = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** A number cell as the workbooks store it (`31225.0`, `7774`) as digits, or null. */
export function codeOf(value: string | undefined): string | null {
	const text = (value ?? "").trim();
	const match = /^(\d+)(?:\.0+)?$/.exec(text);
	if (!match?.[1]) return null;
	return match[1].replace(/^0+(?=\d)/, "");
}

/** `DA`, `NE` or nothing, as the list says it. */
function acceptanceOf(value: string | undefined): SiAcceptance | "invalid" {
	const text = (value ?? "").trim().toUpperCase();
	if (text === "DA") return "accepting";
	if (text === "NE") return "closed";
	return text === "" ? null : "invalid";
}

/** `3211 ŠKOFJA VAS` → its postcode and post office. */
export function splitPlace(value: string | undefined): {
	postcode: string | null;
	postOffice: string | null;
} {
	const text = (value ?? "").replace(/\s+/g, " ").trim();
	const match = /^(\d{4})\s+(.+)$/.exec(text);
	if (!match) return { postcode: null, postOffice: text || null };
	return { postcode: normalizeSiPostcode(match[1]), postOffice: match[2] ?? null };
}

/** The headers a list must have, by the field they fill. */
const HEADERS = {
	providerCode: "sifra izvajalca",
	providerName: "naziv izvajalca",
	street: "ulica",
	place: "kraj",
	doctorCode: "sifra zdravnika",
	doctorName: "priimek in ime zdravnika",
	activityCode: "sifra zzzs dejavnosti",
	acceptance: "zdravnik se sprejema zavarovane osebe",
} as const;

type Column = keyof typeof HEADERS;

/** The column of each field in a header row, or null when the row is not the header. */
function headerColumns(cells: readonly string[]): Record<Column, number> | null {
	const folded = cells.map((cell) => foldSl(cell));
	const columns: Partial<Record<Column, number>> = {};
	for (const [field, header] of Object.entries(HEADERS) as [keyof typeof HEADERS, string][]) {
		const index = folded.indexOf(header);
		if (index < 0) return null;
		columns[field] = index;
	}
	return columns as Record<Column, number>;
}

/**
 * Parses one list's workbook: the date of its data from the lines above the header, then one row
 * per doctor, provider and activity. The regional units' and the insurer's totals (`OE CELJE -
 * SKUPAJ`, `ZZZS SKUPAJ`) and the empty lines are left out; a line with a doctor but an unreadable
 * code or an activity that is no personal doctor's is counted (quarantined or skipped). Throws
 * when the file is not a workbook or has no header with the list's columns.
 */
export async function parseZzzsList(source: SiSourceId, archive: Buffer): Promise<SiParseResult> {
	const result: SiParseResult = {
		source,
		dataDate: null,
		lines: 0,
		rows: [],
		quarantined: [],
		skipped: {},
	};
	let columns: Record<Column, number> | null = null;
	for await (const { rowNo, cells } of xlsxRows(archive)) {
		if (!columns) {
			columns = headerColumns(cells);
			if (!columns && !result.dataDate) {
				for (const cell of cells) {
					const date = sheetDate(cell);
					if (date) {
						result.dataDate = date;
						break;
					}
				}
			}
			continue;
		}
		const cell = (column: Column) => {
			const index = columns?.[column] ?? -1;
			return index < 0 ? "" : (cells[index] ?? "").trim();
		};
		const first = (cells[0] ?? "").toUpperCase();
		if (cells.every((value) => value.trim() === "")) continue;
		if (/\bSKUPAJ\b/.test(first)) {
			skip(result, "total");
			continue;
		}
		result.lines++;
		const providerCode = codeOf(cell("providerCode"));
		const doctorCode = codeOf(cell("doctorCode"));
		const activityCode = codeOf(cell("activityCode")) ?? "";
		const codes = [providerCode ?? "", doctorCode ?? "", activityCode, cell("acceptance")];
		if (!providerCode || providerCode === "0") {
			quarantine(result, rowNo, "provider code", codes);
			continue;
		}
		if (!doctorCode || !isValidSiSourceId(doctorCode)) {
			quarantine(result, rowNo, "doctor code", codes);
			continue;
		}
		if (!siProfessionOfActivity(activityCode)) {
			skip(result, `activity ${activityCode || "none"}`);
			continue;
		}
		const nameSource = cell("doctorName").replace(/\s+$/, "");
		if (!/\p{L}/u.test(nameSource)) {
			quarantine(result, rowNo, "doctor name", codes);
			continue;
		}
		const providerName = cell("providerName").replace(/\s+/g, " ");
		if (!providerName) {
			quarantine(result, rowNo, "provider name", codes);
			continue;
		}
		const acceptance = acceptanceOf(cell("acceptance"));
		if (acceptance === "invalid") {
			quarantine(result, rowNo, "acceptance", codes);
			continue;
		}
		const { postcode, postOffice } = splitPlace(cell("place"));
		const row: SiRow = {
			source,
			lineNo: rowNo,
			nationalId: doctorCode,
			nameSource,
			providerCode,
			providerName,
			street: cell("street").replace(/\s+/g, " ") || null,
			postcode,
			postOffice,
			activityCode,
			acceptance,
		};
		result.rows.push(row);
	}
	if (!columns) throw new Error("no header row with the list's columns");
	return result;
}
