/**
 * The yearly directory of hospitals and of prevention and rehabilitation clinics of the federal
 * and Länder statistical offices (Statistisches Bundesamt, "Verzeichnis der Krankenhäuser und
 * Vorsorge- oder Rehabilitationseinrichtungen"; "Vervielfältigung und Verbreitung, auch
 * auszugsweise, mit Quellenangabe gestattet"): one workbook per reporting year, with a worksheet
 * of hospital sites (`KHV_2024`), one of prevention and rehabilitation clinics (`RHV_2024`) and
 * their record descriptions (`DSB_KHV_2024`, `DSB_RHV_2024`), which name the departments.
 *
 * One row is one hospital site or clinic, with the Land, Kreis and Gemeinde parts of its
 * municipality key (AGS), name, site name, address, phone, operator type, kind of facility,
 * emergency care level and modules (hospitals) and the beds of each department (§ 301 SGB V for
 * hospitals, the Deutsche Rentenversicherung's departments for clinics). Only what a page needs
 * is read into a row: the e-mail and web addresses, the operator's name, the beds and the
 * pseudonymous `KH_ID` (drawn anew every edition; used only to count a hospital's sites) never
 * are, so they cannot be stored.
 *
 * Berlin's and Hamburg's rows carry the statistical code of their district in the Kreis and
 * Gemeinde columns: their Gemeinde is the city's (`11000000`, `02000000`).
 */
import { normalizeDePostcode, toE164De } from "@apercura/core";
import { DE_STATES } from "@apercura/core/country";
import { DE_REHAB_CLINIC, deHospitalKind } from "@apercura/core/taxonomy";
import { type XlsxRow, xlsxRows, xlsxSheets } from "../../lib/xlsx";
import { clean, deSiteKey, hospitalSiteName, streetLine, withoutLegalForm } from "./names";
import {
	type DeQualification,
	emptyResult,
	type ParseResult,
	DE_QUALIFICATION_SOURCES as Q,
	quarantine,
	skip,
} from "./types";

/**
 * A published number of more hospitals or clinics of a sheet than this is a chain's or an
 * operator's, not the facility's: not stored.
 */
export const MAX_PHONE_OWNERS = 3;

/** The worksheets of an edition, by their name without stray spaces (` KHV_2024`). */
const SHEETS = {
	khv: /^KHV_(\d{4})$/,
	rhv: /^RHV_(\d{4})$/,
	khvDescription: /^DSB_KHV_(\d{4})$/,
	rhvDescription: /^DSB_RHV_(\d{4})$/,
} as const;

/** The columns every edition has, by header, checked by name. */
const COMMON_COLUMNS = [
	"Land",
	"Kreis",
	"Gemeinde",
	"Straße",
	"Hausnummer",
	"PLZ",
	"Ort",
	"Telefon",
	"Trägerart",
	"Einrichtungstyp",
] as const;

export const KHV_COLUMNS = ["KH_Name", "Standortname", "Stufe_Notfall", ...COMMON_COLUMNS] as const;
export const RHV_COLUMNS = ["RH_Name", ...COMMON_COLUMNS] as const;

/** The emergency care modules (spezielle Notfallversorgung), by column. */
const EMERGENCY_MODULES: readonly [string, string, string][] = [
	["Notfallmodul_Schwerverletzte", "SCHWERVERLETZTE", "Schwerverletztenversorgung"],
	["Notfallmodul_Kinder", "KINDER", "Notfallversorgung Kinder"],
	["Notfallmodul_Spezial", "SPEZIAL", "Spezialversorgung"],
	["Notfallmodul_Schlaganfall", "SCHLAGANFALL", "Schlaganfallversorgung"],
	["Notfallmodul_Durchblutung_Herz", "HERZ", "Durchblutungsstörungen am Herzen"],
];

/** The general emergency care levels (allgemeine Notfallversorgung, § 136c Abs. 4 SGB V). */
const EMERGENCY_LEVELS: Readonly<Record<string, string>> = {
	"1": "Basisnotfallversorgung",
	"2": "Erweiterte Notfallversorgung",
	"3": "Umfassende Notfallversorgung",
};

const OPERATORS: Readonly<Record<string, { code: string; label: string }>> = {
	"1": { code: "PUBLIC", label: "Öffentlicher Träger" },
	"2": { code: "NONPROFIT", label: "Freigemeinnütziger Träger" },
	"3": { code: "PRIVATE", label: "Privater Träger" },
};

const FACILITY_TYPES: Readonly<Record<string, string>> = {
	"1": "Hochschulklinik",
	"2": "Plankrankenhaus",
	"3": "Krankenhaus mit Versorgungsvertrag",
	"4": "Krankenhaus ohne Versorgungsvertrag",
	"5": "Bundeswehrkrankenhaus",
	"6": "Vorsorge- oder Rehabilitationseinrichtung nach § 111 SGB V/§ 111a SGB V",
	"7": "Sonstige Vorsorge- oder Rehabilitationseinrichtung",
};

/** Departments that say nothing of the care given: never shown, never deciding a kind. */
const UNNAMED_DEPARTMENTS: ReadonlySet<string> = new Set(["0000", "3700"]);

/** The Länder whose Gemeinde is the whole city and whose rows give a district instead. */
const CITY_STATES: Readonly<Record<string, string>> = { "02": "02000000", "11": "11000000" };

/** A worksheet name without stray spaces, and the year it is of. */
function sheetYear(name: string, pattern: RegExp): number | null {
	const match = pattern.exec(name.trim());
	return match ? Number(match[1]) : null;
}

/** The worksheets of an edition and its reporting year. Throws when the workbook is not one. */
export function destatisEdition(archive: Buffer): {
	year: number;
	sheets: Record<keyof typeof SHEETS, string | null>;
} {
	const names = xlsxSheets(archive).map((sheet) => sheet.name);
	const find = (key: keyof typeof SHEETS) =>
		names.find((name) => sheetYear(name, SHEETS[key]) !== null) ?? null;
	const sheets = {
		khv: find("khv"),
		rhv: find("rhv"),
		khvDescription: find("khvDescription"),
		rhvDescription: find("rhvDescription"),
	};
	const year = sheets.khv
		? sheetYear(sheets.khv, SHEETS.khv)
		: sheets.rhv
			? sheetYear(sheets.rhv, SHEETS.rhv)
			: null;
	if (year === null) {
		throw new Error("not the directory of hospitals: no KHV_ or RHV_ worksheet");
	}
	return { year, sheets };
}

/**
 * The departments' names of a record description sheet (`FA_0100` → `Innere Medizin`), without
 * the remarks on day clinics' beds.
 */
async function departmentLabels(archive: Buffer, sheet: string | null) {
	const labels = new Map<string, string>();
	if (!sheet) return labels;
	for await (const row of xlsxRows(archive, sheet)) {
		const match = /^FA_(\d{4})$/.exec(clean(row.cells[0]));
		const label = clean(row.cells[1])
			.replace(/\s*\(für teilstationäre Pflegesätze\)/g, "")
			.replace(/\s*[–-]\s*keine vollstationären Betten$/, "");
		if (match?.[1] && label) labels.set(match[1], label);
	}
	return labels;
}

type Header = { index: Record<string, number>; departments: [string, number][] };

/** The header row of a sheet: the row naming every required column. */
function readHeader(cells: string[], required: readonly string[]): Header | null {
	const names = cells.map(clean);
	if (!required.every((name) => names.includes(name))) return null;
	const index: Record<string, number> = {};
	for (const [position, name] of names.entries())
		if (name && !(name in index)) index[name] = position;
	const departments: [string, number][] = [];
	for (const [position, name] of names.entries()) {
		const match = /^FA_(\d{4})$/.exec(name);
		if (match?.[1]) departments.push([match[1], position]);
	}
	return { index, departments };
}

/**
 * The municipality key of a row (`01` `001` `000` → `01001000`), the city's for Berlin and
 * Hamburg, or null when the parts are not codes.
 */
export function rowMunicipalityCode(land: string, kreis: string, gemeinde: string): string | null {
	const state = land.padStart(2, "0");
	if (!DE_STATES[state]) return null;
	if (CITY_STATES[state]) return CITY_STATES[state];
	if (!/^\d{3}$/.test(kreis) || !/^\d{3}$/.test(gemeinde)) return null;
	return `${state}${kreis}${gemeinde}`;
}

/**
 * Parses one worksheet of the directory: `khv` (hospital sites) or `rhv` (prevention and
 * rehabilitation clinics). Throws when the workbook has no such sheet or its header lacks a
 * required column (another file, a changed format): the run then leaves the source out.
 */
export async function parseDestatis(source: "khv" | "rhv", archive: Buffer): Promise<ParseResult> {
	const result = emptyResult(source);
	const edition = destatisEdition(archive);
	const sheet = edition.sheets[source];
	if (!sheet)
		throw new Error(`not the directory of hospitals: no ${source.toUpperCase()} worksheet`);
	result.edition = edition.year;
	const labels = await departmentLabels(
		archive,
		source === "khv" ? edition.sheets.khvDescription : edition.sheets.rhvDescription,
	);
	if (labels.size === 0) {
		throw new Error(`not the directory of hospitals: no department names for ${source}`);
	}
	const required = source === "khv" ? KHV_COLUMNS : RHV_COLUMNS;
	const idColumn = source === "khv" ? "KH_ID_Pseudo" : "RH_ID_Pseudo";
	const nameColumn = source === "khv" ? "KH_Name" : "RH_Name";

	let header: Header | null = null;
	const lines: XlsxRow[] = [];
	for await (const row of xlsxRows(archive, sheet)) {
		if (!header) {
			header = readHeader(row.cells, required);
			continue;
		}
		const name = clean(row.cells[header.index[nameColumn] ?? -1]);
		const land = clean(row.cells[header.index.Land ?? -1]);
		// Notes under the table, blank rows.
		if (!name && !land) continue;
		lines.push(row);
	}
	if (!header) {
		throw new Error(`not the directory of hospitals: no header with ${required.join(", ")}`);
	}
	const columns = header;
	const get = (cells: string[], name: string) => clean(cells[columns.index[name] ?? -1]);

	// How many sites each hospital has, and how many hospitals publish each number: the sites of
	// one hospital share its switchboard, which stays; a number of several hospitals or clinics is
	// their operator's.
	const sitesOf = new Map<string, number>();
	const phoneOwners = new Map<string, Set<string>>();
	for (const [line, { cells }] of lines.entries()) {
		const id = get(cells, idColumn);
		if (id) sitesOf.set(id, (sitesOf.get(id) ?? 0) + 1);
		const phone = toE164De(get(cells, "Telefon"));
		if (!phone) continue;
		const owners = phoneOwners.get(phone) ?? new Set<string>();
		owners.add(id || `line ${line}`);
		phoneOwners.set(phone, owners);
	}

	const seen = new Set<string>();
	for (const { rowNo, cells } of lines) {
		result.lines++;
		const land = get(cells, "Land").padStart(2, "0");
		const kreis = get(cells, "Kreis");
		const gemeinde = get(cells, "Gemeinde");
		const ags = rowMunicipalityCode(land, kreis, gemeinde);
		const rawName = get(cells, nameColumn);
		const site = source === "khv" ? get(cells, "Standortname") : "";
		const city = get(cells, "Ort");
		if (!DE_STATES[land]) {
			quarantine(result, rowNo, "invalid Land", `${land}${kreis}${gemeinde}`);
			continue;
		}
		if (!rawName) {
			quarantine(result, rowNo, "no name", ags ?? land);
			continue;
		}
		if (!city) {
			quarantine(result, rowNo, "no town", ags ?? land);
			continue;
		}
		const street = get(cells, "Straße");
		const number = get(cells, "Hausnummer");
		const key = deSiteKey([source, ags ?? city, street, number, rawName, site]);
		if (seen.has(key)) {
			skip(result, "duplicate site");
			continue;
		}
		seen.add(key);

		const departments: string[] = [];
		for (const [code, position] of columns.departments) {
			if (clean(cells[position]) !== "" && !UNNAMED_DEPARTMENTS.has(code)) departments.push(code);
		}
		const professionCode =
			source === "khv" ? deHospitalKind(departments, `${rawName} | ${site}`) : DE_REHAB_CLINIC;
		const qualifications: DeQualification[] = [];
		for (const code of departments) {
			const label = labels.get(code);
			if (label) qualifications.push({ source: Q.department, code, label });
		}
		if (source === "khv") {
			const level = get(cells, "Stufe_Notfall");
			const levelLabel = EMERGENCY_LEVELS[level];
			if (levelLabel)
				qualifications.push({ source: Q.emergencyLevel, code: level, label: levelLabel });
			for (const [column, code, label] of EMERGENCY_MODULES) {
				if (get(cells, column) === "1")
					qualifications.push({ source: Q.emergencyModule, code, label });
			}
		}
		const operator = OPERATORS[get(cells, "Trägerart")];
		if (operator) qualifications.push({ source: Q.operator, ...operator });
		const type = get(cells, "Einrichtungstyp");
		const typeLabel = FACILITY_TYPES[type];
		if (typeLabel) qualifications.push({ source: Q.facilityType, code: type, label: typeLabel });

		const rawPhone = get(cells, "Telefon");
		let phone = toE164De(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && (phoneOwners.get(phone)?.size ?? 0) > MAX_PHONE_OWNERS) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const rawPostcode = get(cells, "PLZ");
		const postcode = normalizeDePostcode(rawPostcode);
		if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
		const name =
			source === "khv"
				? hospitalSiteName(rawName, site, sitesOf.get(get(cells, idColumn)) ?? 1)
				: withoutLegalForm(rawName);
		result.rows.push({
			source,
			lineNo: rowNo,
			nationalId: key,
			professionCode,
			name,
			street: streetLine(street, number),
			postcode,
			city,
			municipalityCode: ags,
			stateCode: land,
			point: null,
			phone,
			qualifications,
		});
	}
	return result;
}

/**
 * The newest edition a page links (`/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx`,
 * `…/krankenhausverzeichnis-3500100247005.xlsx?__blob=publicationFile`), as an absolute URL, or
 * null when it links none. Editions are compared by their reporting year.
 */
export function latestDirectoryLink(html: string, pageUrl: string): string | null {
	let best: { year: number; url: string } | null = null;
	for (const match of html.matchAll(/href="([^"]*krankenhausverzeichnis[^"]*\.xlsx[^"]*)"/gi)) {
		const href = (match[1] ?? "").replace(/&amp;/g, "&");
		const short = /krankenhausverzeichnis_(\d{2})\.xlsx/i.exec(href)?.[1];
		const long = /krankenhausverzeichnis-3500100(\d{2})7005\.xlsx/i.exec(href)?.[1];
		const digits = short ?? long;
		if (!digits) continue;
		const year = 2000 + Number(digits);
		let url: string;
		try {
			url = new URL(href, pageUrl).toString();
		} catch {
			continue;
		}
		if (!best || year > best.year) best = { year, url };
	}
	return best?.url ?? null;
}
