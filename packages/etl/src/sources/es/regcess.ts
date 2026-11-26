/**
 * The monthly extracts of the General Register of health centres, services and establishments
 * (REGCESS, Ministerio de Sanidad; Real Decreto 1277/2003), one workbook per listing
 * (`GetExcelListadoMensual?tipoListado=C1|C2|E`): hospitals, centres without inpatient care and
 * establishments. Reuse is authorised by the Ministry's legal notice under Ley 37/2007, citing
 * the source and its date and without distorting the data.
 *
 * One row is one authorised centre, with its normalised code (`CCN`), type, name, autonomous
 * community, province and INE municipality codes, address, contact details, functional
 * dependency, authorisation dates and, for C1 and C2, its care units (`Oferta Asistencial`).
 * Only what a centre's page needs is read: the e-mail, fax, web address, regional code, health
 * area and authorisation dates are never read into a row, so they cannot be stored.
 */
import { isValidEsSourceId, normalizeEsPostcode, toE164Es } from "@apercura/core";
import { ES_PROVINCE_COMMUNITIES } from "@apercura/core/country";
import {
	esCentreTypeCode,
	esProfessionOfType,
	esUnitsOf,
	primaryEsSpecialty,
} from "@apercura/core/taxonomy";
import { xlsxRows } from "../../lib/xlsx";
import { esStreet, titleCaseEs } from "./names";
import { type EsSourceId, emptyResult, type ParseResult, quarantine, skip } from "./types";

/** The columns every extract has, by header (whitespace collapsed), checked by name. */
export const REGCESS_COLUMNS = [
	"Tipo centro",
	"Código de Centro Normalizado REGCESS (CCN)",
	"Nombre Centro",
	"Código Comunidad Autónoma",
	"Código Provincia",
	"Código Municipio",
	"Municipio",
	"Código Tipo Vía",
	"Nombre de la vía",
	"Número Vía",
	"Código Postal",
	"Teléfono",
	"Grupo de dependencia Funcional",
] as const;

/** The care units column, in the centres' extracts (C1, C2) only. */
export const REGCESS_UNITS_COLUMN = "Oferta Asistencial";

/**
 * A published number is a centre's own when at most this many rows of the extract carry it; a
 * number on more rows is a chain's head office or a regional switchboard, not the centre's:
 * not stored.
 */
export const MAX_PHONE_ROWS = 3;

/** A header as the workbook writes it (`Código\nPostal`) in one line (`Código Postal`). */
export const headerName = (value: string) => value.replace(/\s+/g, " ").trim();

const text = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** The dependency group as published (`Publicos`, `Privados`), or null. */
export function esDependencyOf(raw: string): { code: "PUBLIC" | "PRIVATE"; label: string } | null {
	const value = raw.trim();
	if (/^p[uú]blic/i.test(value)) return { code: "PUBLIC", label: "Público" };
	if (/^privad/i.test(value)) return { code: "PRIVATE", label: "Privado" };
	return null;
}

/** A centre code as published, with the leading zero a spreadsheet may have dropped. */
export const centreCode = (raw: string) => {
	const value = raw.trim();
	return /^\d{9}$/.test(value) ? `0${value}` : value;
};

/**
 * Parses one extract. Throws when the header is not the register's (another file, a changed
 * format): the run then leaves the extract out rather than guessing columns.
 */
export async function parseRegcess(source: EsSourceId, data: Buffer): Promise<ParseResult> {
	const result = emptyResult(source);
	let index: Record<string, number> | null = null;
	let unitsIndex = -1;
	const lines: { lineNo: number; cells: string[] }[] = [];
	const phoneLines = new Map<string, number>();
	for await (const row of xlsxRows(data)) {
		if (!index) {
			const names = row.cells.map(headerName);
			if (names.every((name) => name === "")) continue;
			const missing = REGCESS_COLUMNS.filter((name) => !names.includes(name));
			if (missing.length > 0) {
				throw new Error(`not a REGCESS extract: no column ${missing.join(", ")}`);
			}
			index = Object.fromEntries(REGCESS_COLUMNS.map((name) => [name, names.indexOf(name)]));
			unitsIndex = names.indexOf(REGCESS_UNITS_COLUMN);
			continue;
		}
		if (row.cells.every((cell) => cell.trim() === "")) continue;
		lines.push({ lineNo: row.rowNo, cells: row.cells });
		const phone = toE164Es(row.cells[index.Teléfono ?? -1]);
		if (phone) phoneLines.set(phone, (phoneLines.get(phone) ?? 0) + 1);
	}
	if (!index) throw new Error("not a REGCESS extract: no header row");
	const columns = index;
	const seen = new Set<string>();
	for (const { lineNo, cells } of lines) {
		result.lines++;
		const get = (name: (typeof REGCESS_COLUMNS)[number]) => text(cells[columns[name] ?? -1]);
		const id = centreCode(get("Código de Centro Normalizado REGCESS (CCN)"));
		const type = get("Tipo centro");
		const professionCode = esProfessionOfType(type);
		if (!professionCode) {
			skip(result, `type ${esCentreTypeCode(type) ?? "?"} (${type || "no type"})`);
			continue;
		}
		if (!isValidEsSourceId(id)) {
			quarantine(result, lineNo, "invalid centre code", id);
			continue;
		}
		const community = get("Código Comunidad Autónoma").padStart(2, "0");
		const province = get("Código Provincia").padStart(2, "0");
		const municipality = get("Código Municipio");
		if (ES_PROVINCE_COMMUNITIES[province] !== community) {
			quarantine(result, lineNo, "invalid province or community", id);
			continue;
		}
		// The INE code with its check digit (`020030`), or without it (`02003`).
		if (!/^\d{5,6}$/.test(municipality) || !municipality.startsWith(province)) {
			quarantine(result, lineNo, "invalid municipality code", id);
			continue;
		}
		const name = titleCaseEs(get("Nombre Centro"));
		if (!name) {
			quarantine(result, lineNo, "no name", id);
			continue;
		}
		const city = get("Municipio");
		if (!city) {
			quarantine(result, lineNo, "no municipality", id);
			continue;
		}
		if (seen.has(id)) {
			skip(result, "duplicate centre code");
			continue;
		}
		seen.add(id);
		// `000000000` and `0034000000000` stand for "no number".
		const rawPhone = /^[\s0+,-]*$/.test(get("Teléfono")) ? "" : get("Teléfono");
		let phone = toE164Es(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && (phoneLines.get(phone) ?? 0) > MAX_PHONE_ROWS) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const rawPostcode = get("Código Postal");
		const postcode = normalizeEsPostcode(rawPostcode);
		if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
		const units = unitsIndex >= 0 ? esUnitsOf(cells[unitsIndex]) : [];
		const specialtyCode = primaryEsSpecialty(
			professionCode,
			units.map((unit) => unit.code),
			get("Nombre Centro"),
		);
		if (specialtyCode === "U.70" && !units.some((unit) => unit.code === "U.70")) {
			result.counters.psychologistsByName++;
		}
		result.rows.push({
			source,
			lineNo,
			nationalId: id,
			professionCode,
			typeCode: esCentreTypeCode(type) ?? "",
			name,
			units,
			specialtyCode,
			street: esStreet(get("Código Tipo Vía"), get("Nombre de la vía"), get("Número Vía")),
			postcode,
			city,
			municipalityCode: municipality.slice(0, 5),
			provinceCode: province,
			communityCode: community,
			phone,
			dependency: esDependencyOf(get("Grupo de dependencia Funcional")),
		});
	}
	return result;
}
