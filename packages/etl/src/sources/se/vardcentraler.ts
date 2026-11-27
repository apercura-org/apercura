/**
 * Västra Götalandsregionen's health centres ("Vårdcentraler i Vårdval vårdcentral"), as its CSV
 * distribution publishes them (UTF-8 with a byte-order mark, comma-separated): `id`, `hsaid` (the
 * key), `namn`, `foretag` (the operator: a company, or Närhälsan, the region's own unit),
 * `adress`, `postnummer`, `postort`, and the visiting address's point in SWEREF 99 TM
 * (EPSG:3006), `x` the northing and `y` the easting, as Swedish surveying names them. The list
 * names no person.
 */
import { isValidSeSourceId, normalizeSePostcode, slugify } from "@apercura/core";
import { parseQuotedRecord } from "../../lib/text";
import { utmToLonLat } from "../../lib/utm";
import { cleanText } from "./text";
import {
	count,
	emptyResult,
	type ParseResult,
	quarantine,
	SE_OPERATOR_SOURCE,
	SE_SOURCES,
	skip,
} from "./types";

const COLUMNS = ["hsaid", "namn", "foretag", "adress", "postnummer", "postort", "x", "y"] as const;

type Column = (typeof COLUMNS)[number];

/** SWEREF 99 TM is UTM zone 33 on GRS 80 (central meridian 15° E). */
const SWEREF99_TM_ZONE = 33;

/** Sweden's extent, with a margin: a point outside it is not the health centre's. */
const inSweden = (longitude: number, latitude: number) =>
	longitude > 10.5 && longitude < 24.5 && latitude > 55 && latitude < 69.2;

/** A SWEREF 99 TM northing and easting as WGS 84, or null when they are not a point in Sweden. */
export function swerefToLonLat(
	northing: string,
	easting: string,
): { longitude: number; latitude: number } | null {
	const north = Number(cleanText(northing).replace(",", "."));
	const east = Number(cleanText(easting).replace(",", "."));
	if (!Number.isFinite(north) || !Number.isFinite(east) || north <= 0 || east <= 0) return null;
	const point = utmToLonLat(east, north, SWEREF99_TM_ZONE);
	return inSweden(point.longitude, point.latitude) ? point : null;
}

/** Reads the CSV. Throws when a column is missing. */
export function parseVardcentraler(text: string): ParseResult {
	const result = emptyResult("vardcentraler");
	let index: Map<Column, number> | null = null;
	const seen = new Set<string>();
	let lineNo = 0;
	for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
		lineNo++;
		if (!raw.trim()) continue;
		const fields = parseQuotedRecord(raw, ",");
		if (!fields) {
			if (index) quarantine(result, lineNo, "unreadable line", "");
			continue;
		}
		if (!index) {
			index = new Map();
			const header = fields.map((field) => cleanText(field).toLowerCase());
			const missing: string[] = [];
			for (const column of COLUMNS) {
				const at = header.indexOf(column);
				if (at < 0) missing.push(column);
				else index.set(column, at);
			}
			if (missing.length > 0) throw new Error(`missing columns ${missing.join(", ")}`);
			continue;
		}
		const cell = (column: Column) => cleanText(fields[index?.get(column) ?? -1]);
		result.lines++;
		const hsaId = cell("hsaid").toUpperCase();
		if (!isValidSeSourceId("SE-HSA", hsaId)) {
			quarantine(result, lineNo, "invalid HSA-id", hsaId);
			continue;
		}
		const name = cell("namn");
		if (!name) {
			quarantine(result, lineNo, "no name", hsaId);
			continue;
		}
		if (seen.has(hsaId)) {
			skip(result, "repeated HSA-id");
			continue;
		}
		seen.add(hsaId);
		const point = swerefToLonLat(cell("x"), cell("y"));
		if (!point) count(result, "noPoint");
		const operator = cell("foretag");
		const rawPostcode = cell("postnummer");
		const postcode = normalizeSePostcode(rawPostcode);
		if (rawPostcode && !postcode) count(result, "invalidPostcodes");
		result.rows.push({
			source: "vardcentraler",
			lineNo,
			idScheme: "SE-HSA",
			nationalId: hsaId,
			professionCode: SE_SOURCES.vardcentraler.professionCode,
			name,
			qualifications:
				operator && slugify(operator)
					? [{ source: SE_OPERATOR_SOURCE, code: slugify(operator), label: operator }]
					: [],
			street: cell("adress") || null,
			postcode,
			city: cell("postort") || null,
			kommun: null,
			latitude: point?.latitude ?? null,
			longitude: point?.longitude ?? null,
		});
	}
	if (!index) throw new Error("no header line (id, hsaid, namn…)");
	return result;
}
