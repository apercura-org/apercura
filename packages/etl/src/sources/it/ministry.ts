/**
 * The Ministry of Health's open data lists (dati.salute.gov.it, Italian Open Data Licence 2.0):
 * - "Farmacie" (`FRM_FARMA_5_<YYYYMMDD>.csv`, daily): every pharmacy open to the public with its
 *   branches and dispensaries, current and past, one line per period of validity;
 * - "Parafarmacie" (`FRM_PFARMA_7_<YYYYMMDD>.csv`, daily): the shops other than pharmacies
 *   allowed to sell non-prescription medicines (art. 5 of D.L. 223/2006), current and past;
 * - "Posti letto per struttura ospedaliera <year>" (yearly): the beds of every public or
 *   assimilated hospital and accredited private clinic on 1 January, one line per area of
 *   inpatient care (acute, rehabilitation, long-term).
 *
 * Semicolon-separated, double-quoted where a value holds a semicolon, with HTML entities in some
 * names (`&amp;`) and decimal commas in the coordinates. Only what a page needs is read: the
 * owner's VAT number (`p_iva`, `partita_iva`), which for a sole trader identifies the person,
 * and the local health unit's codes are never read into a row, so they cannot be stored. The
 * lists publish no phone number.
 */
import { isValidItSourceId, normalizeItPostcode } from "@apercura/core";
import { itRegionOfMinistryCode } from "@apercura/core/country";
import {
	IT_CARE_AREAS,
	IT_PARAPHARMACY,
	IT_PHARMACY,
	IT_PHARMACY_TYPES,
	itFacilityKindOf,
} from "@apercura/core/taxonomy";
import { parseQuotedRecord } from "../../lib/text";
import { hospitalNameIt, parapharmacyNameIt, pharmacyNameIt, streetIt, titleCaseIt } from "./names";
import {
	emptyResult,
	IT_CARE_AREA_SOURCE,
	IT_FACILITY_TYPE_SOURCE,
	IT_PHARMACY_TYPE_SOURCE,
	IT_SOURCES,
	type ItPlace,
	type ItSourceId,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** The columns read from the pharmacies' list, by header. */
export const FARMACIE_COLUMNS = [
	"cod_farmacia",
	"indirizzo",
	"descrizione_farmacia",
	"cap",
	"cod_comune",
	"comune",
	"frazione",
	"sigla_provincia",
	"cod_regione",
	"data_inizio_validita",
	"data_fine_validita",
	"codice_tipologia",
	"latitudine",
	"longitudine",
] as const;

/** The columns read from the parapharmacies' list, by header. */
export const PARAFARMACIE_COLUMNS = [
	"codice_identificativo_sito",
	"sito_logistico",
	"indirizzo",
	"cap",
	"codice_comune",
	"comune",
	"sigla_provincia",
	"codice_regione",
	"data_inizio_validita",
	"data_fine_validita",
	"latitudine",
	"longitudine",
] as const;

/** The columns read from the hospital bed counts, by header. */
export const POSTI_LETTO_COLUMNS = [
	"Anno",
	"Codice Regione",
	"Codice struttura",
	"Denominazione struttura",
	"Indirizzo",
	"Codice Comune",
	"Comune",
	"Sigla provincia",
	"Codice tipo struttura",
	"Descrizione tipo struttura",
	"Tipo di Disciplina",
	"Totale posti letto",
] as const;

export type ParseOptions = {
	/** The day the list is read for (`YYYY-MM-DD`): a period that ends before it is closed. */
	asOf: string;
	/**
	 * Keep the list's coordinates (`--register-coordinates`). The ministry says some were found
	 * through OpenStreetMap ("© OpenStreetMap contributors", ODbL): by default a place is located
	 * at its municipality's centre instead.
	 */
	registerCoordinates: boolean;
};

/** The named entities the lists use, by name. */
const ENTITIES: Readonly<Record<string, string>> = {
	quot: '"',
	apos: "'",
	lt: "<",
	gt: ">",
};

/**
 * HTML entities some names carry (`&amp;`, `&#39;`), decoded in one pass. An ampersand the
 * ministry's system encoded more than once (`&amp;amp;`) is one ampersand; nothing decoded is read
 * again, so an encoded entity (`&amp;quot;`) is never decoded twice.
 */
export function decodeEntities(value: string): string {
	return value.replace(
		/&(?:(?:amp;)+|(quot|apos|lt|gt);|#(\d{2,5});)/gi,
		(_match, name: string | undefined, code: string | undefined) => {
			if (name) return ENTITIES[name.toLowerCase()] ?? _match;
			if (code) return String.fromCodePoint(Number(code));
			return "&";
		},
	);
}

/** The characters Windows-1252 puts in 0x80–0x9F, by byte. */
const CP1252_HIGH: Readonly<Record<string, number>> = Object.fromEntries(
	[..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ"].map((char, index) => [
		char,
		0x80 + index,
	]),
);

/**
 * Text that was UTF-8, read as Windows-1252 and written again ("LibertÃ ", "CarrÃ¹", "Sant’"
 * as "Santâ€™"), decoded back; the lists hold some. A "¿" left for a character the ministry's
 * system lost ("Santâ¿Antonio") becomes an apostrophe, a lone "Â¿" goes. Other text is returned
 * as it is.
 */
export function repairMojibake(value: string): string {
	return lostCharacters(redecoded(value));
}

/**
 * The marks of characters the ministry's system lost: a "¿" between or after letters was an
 * apostrophe or an accent ("Sant¿Antonio", "Cantu¿"), elsewhere a dash or nothing; a stray
 * "Â" (never an Italian letter) is a lost space or quotation mark.
 */
function lostCharacters(value: string): string {
	if (!/[¿Â]/.test(value)) return value;
	return value
		.replace(/Â/g, " ")
		.replace(/(?<=\p{L})¿/gu, "'")
		.replace(/\s¿\s/g, " – ")
		.replace(/¿/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function redecoded(value: string): string {
	if (!/[ÃÂâ]/.test(value)) return value;
	const bytes: number[] = [];
	let encodable = true;
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		const high = CP1252_HIGH[char];
		if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
		else if (high !== undefined) bytes.push(high);
		else {
			encodable = false;
			break;
		}
	}
	if (encodable) {
		try {
			const repaired = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
			if (repaired !== value) return repaired;
		} catch {
			// Not UTF-8 read twice: the lost characters below.
		}
	}
	return value.replace(/â¿/g, "¿");
}

const text = (value: string | undefined) =>
	repairMojibake(decodeEntities(value ?? ""))
		.replace(/\s+/g, " ")
		.trim();

/**
 * A list's text, line by line: each line as UTF-8 when it is valid UTF-8, else as Windows-1252.
 * The pharmacies' list mixes both (a municipality written "TORTOLÌ" in UTF-8 on one line, a name
 * in Latin-1 on another), so one decoding for the whole file would garble one or the other.
 */
export function decodeLines(data: Buffer | Uint8Array): string {
	const utf8 = new TextDecoder("utf-8", { fatal: true });
	const latin = new TextDecoder("windows-1252");
	const lines: string[] = [];
	let start = 0;
	for (let index = 0; index <= data.length; index++) {
		if (index < data.length && data[index] !== 0x0a) continue;
		const line = data.subarray(start, index);
		try {
			lines.push(utf8.decode(line));
		} catch {
			lines.push(latin.decode(line));
		}
		start = index + 1;
	}
	return lines.join("\n").replace(/^\uFEFF/, "");
}

/** A value the lists write as "-" when absent. */
const present = (value: string) => (value === "-" ? "" : value);

/** A `dd/mm/yyyy` date as `yyyy-mm-dd`, or null. */
export function isoDateIt(raw: string): string | null {
	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
	return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** A coordinate with a decimal comma (`45,0652154357378`), or null. */
const coordinate = (raw: string) => {
	const value = Number(raw.trim().replace(",", "."));
	return raw.trim() && raw.trim() !== "-" && Number.isFinite(value) ? value : null;
};

/** A point in Italy (with Lampedusa and the Alps), or null. */
export function italianPoint(
	latitude: string,
	longitude: string,
): { latitude: number; longitude: number } | null {
	const lat = coordinate(latitude);
	const lon = coordinate(longitude);
	if (lat === null || lon === null) return null;
	if (lat < 35.2 || lat > 47.2 || lon < 6.5 || lon > 18.6) return null;
	return { latitude: lat, longitude: lon };
}

/** The records of a semicolon-separated list with double-quote quoting, numbered from 1. */
export function* semicolonRecords(
	content: string,
): Generator<{ lineNo: number; fields: string[] }> {
	const lines = content.split(/\r?\n/);
	let pending: string | null = null;
	let start = 0;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const input: string = pending === null ? line : `${pending}\n${line}`;
		if (pending === null) start = index + 1;
		if (pending === null && line.trim() === "") continue;
		const fields = parseQuotedRecord(input, ";");
		if (fields === null) {
			pending = input;
			continue;
		}
		pending = null;
		yield { lineNo: start, fields };
	}
}

type Columns<Name extends string> = Record<Name, number>;

function readHeader<Name extends string>(
	records: Generator<{ lineNo: number; fields: string[] }>,
	columns: readonly Name[],
	what: string,
): { index: Columns<Name>; width: number } {
	const header = records.next();
	if (header.done) throw new Error("empty file");
	const names = header.value.fields.map((name) => name.replace(/^\uFEFF/, "").trim());
	const missing = columns.filter((name) => !names.includes(name));
	if (missing.length > 0) throw new Error(`not the ${what}: no column ${missing.join(", ")}`);
	const index = Object.fromEntries(
		columns.map((name) => [name, names.indexOf(name)]),
	) as Columns<Name>;
	return { index, width: names.length };
}

/** Whether a period of validity covers `asOf` (`data_fine_validita` "-" is open-ended). */
function openOn(start: string, end: string, asOf: string): "open" | "closed" | "future" {
	const from = isoDateIt(start);
	const to = present(end) ? isoDateIt(end) : null;
	if (from && from > asOf) return "future";
	if (present(end) && (!to || to < asOf)) return "closed";
	return "open";
}

type Candidate = { lineNo: number; start: string; row: ItPlace };

/**
 * The current line of each place: of the lines open on `asOf`, the one that began last. A
 * place every line of which is closed is left out (counted `closed`).
 */
function keepCurrent(result: ParseResult, candidates: Map<string, Candidate[]>) {
	for (const lines of candidates.values()) {
		const current = [...lines].sort(
			(a, b) => b.start.localeCompare(a.start) || b.lineNo - a.lineNo,
		)[0];
		if (current) result.rows.push(current.row);
		if (lines.length > 1) {
			for (let extra = 1; extra < lines.length; extra++) skip(result, "duplicate open line");
		}
	}
	result.rows.sort((a, b) => a.lineNo - b.lineNo);
}

/** Pharmacies, their branches and dispensaries open on `asOf`. */
export function parseFarmacie(data: Buffer | string, options: ParseOptions): ParseResult {
	const source: ItSourceId = "farmacie";
	const result = emptyResult(source);
	const content = typeof data === "string" ? data : decodeLines(data);
	const records = semicolonRecords(content);
	const { index, width } = readHeader(records, FARMACIE_COLUMNS, "pharmacies' list");
	const candidates = new Map<string, Candidate[]>();
	for (const { lineNo, fields } of records) {
		result.lines++;
		const get = (name: (typeof FARMACIE_COLUMNS)[number]) => text(fields[index[name]]);
		const id = get("cod_farmacia");
		if (fields.length !== width) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${width}`, id);
			continue;
		}
		const period = openOn(get("data_inizio_validita"), get("data_fine_validita"), options.asOf);
		if (period !== "open") {
			skip(result, period);
			continue;
		}
		const row = readPlace(result, lineNo, source, id, {
			name: pharmacyNameIt(get("descrizione_farmacia")),
			street: get("indirizzo"),
			hamlet: get("frazione"),
			postcode: get("cap"),
			municipalityCode: get("cod_comune"),
			city: get("comune"),
			province: get("sigla_provincia"),
			region: get("cod_regione"),
			latitude: get("latitudine"),
			longitude: get("longitudine"),
			options,
		});
		if (!row) continue;
		row.professionCode = IT_PHARMACY;
		const type = get("codice_tipologia");
		// Every page is a pharmacy's: a branch's or a dispensary's type is shown on it.
		if (type !== "1" && IT_PHARMACY_TYPES[type]) {
			row.qualifications.push({
				source: IT_PHARMACY_TYPE_SOURCE,
				code: type,
				label: IT_PHARMACY_TYPES[type] ?? "",
			});
		}
		const list = candidates.get(id) ?? [];
		list.push({ lineNo, start: isoDateIt(get("data_inizio_validita")) ?? "", row });
		candidates.set(id, list);
	}
	keepCurrent(result, candidates);
	return result;
}

/** Parapharmacies open on `asOf`. */
export function parseParafarmacie(data: Buffer | string, options: ParseOptions): ParseResult {
	const source: ItSourceId = "parafarmacie";
	const result = emptyResult(source);
	const content = typeof data === "string" ? data : decodeLines(data);
	const records = semicolonRecords(content);
	const { index, width } = readHeader(records, PARAFARMACIE_COLUMNS, "parapharmacies' list");
	const candidates = new Map<string, Candidate[]>();
	for (const { lineNo, fields } of records) {
		result.lines++;
		const get = (name: (typeof PARAFARMACIE_COLUMNS)[number]) => text(fields[index[name]]);
		const id = get("codice_identificativo_sito");
		if (fields.length !== width) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${width}`, id);
			continue;
		}
		const period = openOn(get("data_inizio_validita"), get("data_fine_validita"), options.asOf);
		if (period !== "open") {
			skip(result, period);
			continue;
		}
		const row = readPlace(result, lineNo, source, id, {
			name: parapharmacyNameIt(get("sito_logistico")),
			street: get("indirizzo"),
			hamlet: "",
			postcode: get("cap"),
			municipalityCode: get("codice_comune"),
			city: get("comune"),
			province: get("sigla_provincia"),
			region: get("codice_regione"),
			latitude: get("latitudine"),
			longitude: get("longitudine"),
			options,
		});
		if (!row) continue;
		row.professionCode = IT_PARAPHARMACY;
		const list = candidates.get(id) ?? [];
		list.push({ lineNo, start: isoDateIt(get("data_inizio_validita")) ?? "", row });
		candidates.set(id, list);
	}
	keepCurrent(result, candidates);
	return result;
}

/**
 * Hospitals and accredited private clinics, one per facility code, with their areas of
 * inpatient care and their beds. The file names a year (`Anno`): `year` is the latest one read.
 */
export function parsePostiLetto(
	data: Buffer | string,
	options: ParseOptions,
): ParseResult & { year: number | null } {
	const source: ItSourceId = "posti-letto";
	const result = emptyResult(source);
	const content = typeof data === "string" ? data : decodeLines(data);
	const records = semicolonRecords(content);
	const { index, width } = readHeader(records, POSTI_LETTO_COLUMNS, "hospital bed counts");
	const places = new Map<string, ItPlace>();
	const beds = new Map<string, Map<string, number>>();
	let year: number | null = null;
	for (const { lineNo, fields } of records) {
		result.lines++;
		const get = (name: (typeof POSTI_LETTO_COLUMNS)[number]) => text(fields[index[name]]);
		const id = get("Codice struttura");
		if (fields.length !== width) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${width}`, id);
			continue;
		}
		const lineYear = Number(get("Anno"));
		if (Number.isInteger(lineYear) && lineYear > 1990) year = Math.max(year ?? 0, lineYear);
		const area = get("Tipo di Disciplina").toUpperCase();
		const total = Number(get("Totale posti letto").replace(/\./g, ""));
		const known = places.get(id);
		if (known) {
			// Another area of care of a facility already read.
			if (IT_CARE_AREAS[area] && Number.isFinite(total)) {
				const counts = beds.get(id) ?? new Map<string, number>();
				counts.set(area, (counts.get(area) ?? 0) + total);
				beds.set(id, counts);
			}
			continue;
		}
		const professionCode = itFacilityKindOf(
			get("Codice tipo struttura"),
			get("Descrizione tipo struttura"),
		);
		if (!professionCode) {
			quarantine(result, lineNo, "no facility type", id);
			continue;
		}
		const row = readPlace(result, lineNo, source, id, {
			name: hospitalNameIt(get("Denominazione struttura")),
			street: get("Indirizzo"),
			hamlet: "",
			postcode: "",
			municipalityCode: get("Codice Comune"),
			city: get("Comune"),
			province: get("Sigla provincia"),
			region: get("Codice Regione"),
			latitude: "",
			longitude: "",
			options,
		});
		if (!row) continue;
		row.professionCode = professionCode;
		const typeLabel = get("Descrizione tipo struttura");
		if (typeLabel) {
			row.qualifications.push({
				source: IT_FACILITY_TYPE_SOURCE,
				code: get("Codice tipo struttura") || typeLabel,
				label: typeLabel,
			});
		}
		places.set(id, row);
		if (IT_CARE_AREAS[area] && Number.isFinite(total)) {
			beds.set(id, new Map([[area, total]]));
		}
	}
	for (const [id, row] of places) {
		for (const [area, label] of Object.entries(IT_CARE_AREAS)) {
			const count = beds.get(id)?.get(area);
			if (count === undefined) continue;
			row.qualifications.push({
				source: IT_CARE_AREA_SOURCE,
				code: area,
				label: `${label} (${count} ${count === 1 ? "posto letto" : "posti letto"})`,
			});
		}
		result.rows.push(row);
	}
	return { ...result, year };
}

/** Reads the fields every list shares into a place, or quarantines the line. */
function readPlace(
	result: ParseResult,
	lineNo: number,
	source: ItSourceId,
	id: string,
	fields: {
		name: { name: string; stripped: boolean };
		street: string;
		hamlet: string;
		postcode: string;
		municipalityCode: string;
		city: string;
		province: string;
		region: string;
		latitude: string;
		longitude: string;
		options: ParseOptions;
	},
): ItPlace | null {
	const { idScheme } = IT_SOURCES[source];
	if (!isValidItSourceId(idScheme, id)) {
		quarantine(result, lineNo, "invalid code", id);
		return null;
	}
	const municipality = fields.municipalityCode.padStart(6, "0");
	if (!/^\d{6}$/.test(municipality) || municipality === "000000") {
		quarantine(result, lineNo, "invalid municipality code", id);
		return null;
	}
	if (!fields.name.name) {
		quarantine(result, lineNo, "no name", id);
		return null;
	}
	const city = titleCaseIt(present(fields.city));
	if (!city) {
		quarantine(result, lineNo, "no municipality", id);
		return null;
	}
	if (fields.name.stripped) result.counters.namesShortened++;
	const rawPostcode = present(fields.postcode);
	const postcode = normalizeItPostcode(rawPostcode);
	if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
	const point = italianPoint(fields.latitude, fields.longitude);
	if (point) result.counters.withPoint++;
	const located = fields.options.registerCoordinates ? point : null;
	const hamlet = present(fields.hamlet) ? titleCaseIt(fields.hamlet) : null;
	return {
		source,
		lineNo,
		idScheme,
		nationalId: id,
		professionCode: "",
		name: fields.name.name,
		qualifications: [],
		street: streetIt(present(fields.street)),
		postcode,
		city,
		hamlet: hamlet && hamlet.toLowerCase() !== city.toLowerCase() ? hamlet : null,
		municipalityCode: municipality,
		provinceAbbreviation: /^[A-Z]{2}$/.test(present(fields.province).toUpperCase())
			? present(fields.province).toUpperCase()
			: null,
		regionCode: itRegionOfMinistryCode(fields.region.padStart(3, "0")),
		latitude: located?.latitude ?? null,
		longitude: located?.longitude ?? null,
	};
}

/** Parses one list. Throws when its header is not the ministry's: the run then leaves it out. */
export function parseItSource(
	source: ItSourceId,
	data: Buffer | string,
	options: ParseOptions,
): ParseResult & { year?: number | null } {
	if (source === "farmacie") return parseFarmacie(data, options);
	if (source === "parafarmacie") return parseParafarmacie(data, options);
	return parsePostiLetto(data, options);
}
