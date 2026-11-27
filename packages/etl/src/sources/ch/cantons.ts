/**
 * The cantons' open lists of hospitals, nursing homes and pharmacies, each read into the rows of
 * `ChFacility`. What a page needs is read; what it does not is never read into a row: e-mail
 * addresses (some name a person), the responsible pharmacist's names of Basel-Landschaft's list,
 * the editor's user name of Jura's file, the yearly figures of Zürich's homes. Websites are not
 * kept either (no Swiss page prints one).
 *
 * The lists are GeoJSON (Bern's web feature service, Geneva's SITG extracts, Basel-Landschaft's
 * and Basel-Stadt's portals), a CSV (Zürich's statistics office) and a shapefile (Jura); their
 * points are WGS 84, Jura's the Swiss grid (LV95). A list that gives no stable number keys its
 * rows by their canton, name, street and postcode (`derivedKeyCh`).
 */
import { normalizeChPostcode, toE164Ch } from "@apercura/core";
import {
	CH_BIRTH_CENTRE,
	CH_HOSPITAL,
	CH_NURSING_HOME,
	CH_PHARMACY,
	CH_PSYCHIATRIC_CLINIC,
	CH_REHAB_CLINIC,
	CH_SPECIALTY_CLINIC,
} from "@apercura/core/taxonomy";
import { readDbf, readShpPoints } from "../../lib/shapefile";
import { parseQuotedRecord } from "../../lib/text";
import { readZipEntries } from "../../lib/zip";
import { inSwitzerland, swissGridToWgs84 } from "./lv95";
import {
	cleanText,
	derivedKeyCh,
	facilityNameCh,
	nameMatchKeyCh,
	splitPostcodeLocality,
	streetCh,
} from "./names";
import { CH_SOURCES, type ChSourceId } from "./sources";
import {
	CH_CATEGORY_SOURCE,
	CH_OPERATOR_SOURCE,
	CH_SERVICE_SOURCE,
	type ChFacility,
	type ChQualification,
	emptyResult,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

type Feature = {
	properties: Record<string, unknown>;
	geometry: { type: string; coordinates: unknown } | null;
};

/** The features of a GeoJSON FeatureCollection; throws when the text is not one. */
export function readFeatures(text: string): Feature[] {
	const data = JSON.parse(text.replace(/^\ufeff/, "")) as { type?: string; features?: unknown };
	if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
		throw new Error("not a GeoJSON FeatureCollection");
	}
	return data.features as Feature[];
}

/** The GeoJSON file of a ZIP (the first `.geojson` or `.json` entry). */
export function geojsonOfZip(archive: Buffer): string {
	const [entry] = readZipEntries(archive, (name) => /\.(?:geo)?json$/i.test(name));
	if (!entry) throw new Error("no GeoJSON file in the archive");
	return entry.data.toString("utf8");
}

/** A property as text: null, `"null"` (Bern's web service) and blanks read as empty. */
const prop = (feature: Feature, key: string): string => {
	const value = feature.properties[key];
	if (value === null || value === undefined) return "";
	const text = cleanText(String(value));
	return text === "null" ? "" : text;
};

/** The first point of a Point or MultiPoint geometry in WGS 84, or null. */
function pointOf(feature: Feature): { latitude: number; longitude: number } | null {
	const geometry = feature.geometry;
	if (!geometry) return null;
	const coordinates =
		geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)
			? (geometry.coordinates as unknown[])[0]
			: geometry.type === "Point"
				? geometry.coordinates
				: null;
	if (!Array.isArray(coordinates)) return null;
	const [longitude, latitude] = coordinates as number[];
	if (typeof longitude !== "number" || typeof latitude !== "number") return null;
	const point = { longitude, latitude };
	return inSwitzerland(point) ? point : null;
}

type Draft = {
	nationalId?: string;
	professionCode: string;
	name: string;
	operator?: string;
	category?: { language: "de" | "fr" | "it"; label: string } | null;
	services?: ChQualification[];
	street: string | null;
	postcode: string | null;
	locality: string;
	communeCode?: string | null;
	point: { latitude: number; longitude: number } | null;
	phone?: string;
};

/** Builds a row of a cantonal list from what its parser read, or quarantines it. */
function push(
	result: ParseResult<ChSourceId>,
	source: ChSourceId,
	lineNo: number,
	draft: Draft,
): void {
	const config = CH_SOURCES[source];
	const canton = config.canton ?? "";
	const name = facilityNameCh(draft.name);
	if (!name.name) {
		quarantine(result, lineNo, "no name", String(lineNo));
		return;
	}
	if (!draft.postcode && !draft.point) {
		quarantine(result, lineNo, "no postcode and no point", name.name);
		return;
	}
	if (name.shortened) result.counters.namesShortened++;
	if (draft.point) result.counters.withPoint++;
	const nationalId =
		draft.nationalId ?? derivedKeyCh([canton, name.name, draft.street ?? "", draft.postcode ?? ""]);
	if (!new RegExp(`^${patternOf(source)}$`).test(nationalId)) {
		quarantine(result, lineNo, "invalid key", nationalId);
		return;
	}
	let phone: string | null = null;
	if (draft.phone) {
		phone = toE164Ch(draft.phone);
		if (!phone?.startsWith("+41")) {
			result.counters.invalidPhones++;
			phone = null;
		}
	}
	const qualifications: ChQualification[] = [...(draft.services ?? [])];
	if (draft.category?.label) {
		qualifications.push({
			source: CH_CATEGORY_SOURCE,
			code: draft.category.language,
			label: draft.category.label,
		});
	}
	const operator = draft.operator ? facilityNameCh(draft.operator).name : "";
	if (operator && operator !== name.name) {
		qualifications.push({ source: CH_OPERATOR_SOURCE, code: "", label: operator });
	}
	if (result.rows.some((existing) => existing.nationalId === nationalId)) {
		skip(result, "repeated");
		return;
	}
	const row: ChFacility<ChSourceId> = {
		source,
		lineNo,
		idScheme: config.idScheme,
		nationalId,
		professionCode: draft.professionCode,
		name: name.name,
		qualifications,
		street: draft.street,
		postcode: draft.postcode,
		locality: draft.locality,
		cantonCode: canton,
		communeCode: draft.communeCode ?? null,
		latitude: draft.point?.latitude ?? null,
		longitude: draft.point?.longitude ?? null,
		phone,
		website: null,
		matchKeys: [nameMatchKeyCh(name.name)],
	};
	result.rows.push(row);
}

/** The key pattern of a list's scheme, as text (core's `CH_ID_SCHEMES`). */
function patternOf(source: ChSourceId): string {
	const scheme = CH_SOURCES[source].idScheme;
	return SCHEME_PATTERNS[scheme] ?? "[1-9]\\d{8}";
}

const SCHEME_PATTERNS: Readonly<Record<string, string>> = {
	"CH-GE-EMS": "[1-9]\\d{5,13}",
	"CH-BL-PHARM": "76\\d{11}",
	"CH-ZH-PH": "[1-9]\\d{0,9}",
};

/** A street and its number in two fields (`Bahnhofstrasse`, `3`). */
const streetOf = (street: string, number: string) =>
	streetCh([street, number].filter(Boolean).join(" "));

/**
 * An address field that may end with the postcode and the locality (`Mittlere Strasse 15, 4056
 * Basel`, `26 route de Chêne  1207 Genève`, `Schützengasse 60, 4125`): the street, and the
 * postcode and locality when present.
 */
export function splitAddress(raw: string): {
	street: string | null;
	postcode: string | null;
	locality: string;
} {
	const tokens = cleanText(raw).split(" ").filter(Boolean);
	// The last four-digit token after a comma, or followed by a locality, is the postcode.
	for (let index = tokens.length - 1; index > 0; index--) {
		const token = (tokens[index] ?? "").replace(/,$/, "");
		if (!/^[1-9]\d{3}$/.test(token)) continue;
		const afterComma = (tokens[index - 1] ?? "").endsWith(",");
		if (!afterComma && index === tokens.length - 1) continue;
		return {
			street: streetCh(tokens.slice(0, index).join(" ").replace(/,$/, "")),
			postcode: normalizeChPostcode(token),
			locality: tokens.slice(index + 1).join(" "),
		};
	}
	return { street: streetCh(tokens.join(" ")), postcode: null, locality: "" };
}

/** Bern's hospitals and clinics: four flags tell the kind (acute, psychiatry, rehabilitation, birth). */
function parseBernHospitals(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("be-spitaeler");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const flag = (key: string) => prop(feature, key) === "1";
		const professionCode = flag("GEBURT")
			? CH_BIRTH_CENTRE
			: flag("PSYCHKLIN") && !flag("AKUT")
				? CH_PSYCHIATRIC_CLINIC
				: flag("REHAKLIN") && !flag("AKUT")
					? CH_REHAB_CLINIC
					: CH_HOSPITAL;
		push(result, "be-spitaeler", index + 1, {
			professionCode,
			name: prop(feature, "BEZ_STO") || prop(feature, "BEZ_FIRMA"),
			operator: prop(feature, "BEZ_FIRMA"),
			street: streetCh(prop(feature, "LOKALISAT")),
			postcode: normalizeChPostcode(prop(feature, "PLZ")),
			locality: prop(feature, "ORTSCHAFT"),
			point: pointOf(feature),
		});
	}
	return result;
}

/** Bern's homes for the elderly and nursing homes (`ALTERSHEIM` = 1; day centres are another layer). */
function parseBernHomes(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("be-heime");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		if (prop(feature, "ALTERSHEIM") !== "1") {
			skip(result, "not a nursing home");
			continue;
		}
		push(result, "be-heime", index + 1, {
			professionCode: CH_NURSING_HOME,
			name: prop(feature, "INAME"),
			operator: prop(feature, "TRNAME"),
			street: streetCh(prop(feature, "ADRESSE")),
			postcode: normalizeChPostcode(prop(feature, "PLZ")),
			locality: prop(feature, "ORTSCHAFT"),
			point: pointOf(feature),
			phone: prop(feature, "TELEFON"),
		});
	}
	return result;
}

/**
 * Geneva's hospitals and clinics (SITG): the hospitals and clinics; the HUG's outpatient
 * consultations (departments of the university hospitals) and the other entries are left out.
 */
function parseGenevaHospitals(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("ge-hopitaux");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const type = prop(feature, "TYPE_ETABLISSEMENT");
		const name = prop(feature, "NOM_ETABLISSEMENT");
		const lower = type.toLowerCase();
		if (lower !== "hôpital" && lower !== "clinique") {
			skip(result, lower.startsWith("hug") ? "outpatient department" : "other kind");
			continue;
		}
		const professionCode = /psychiatr/i.test(name)
			? CH_PSYCHIATRIC_CLINIC
			: lower === "clinique"
				? CH_SPECIALTY_CLINIC
				: CH_HOSPITAL;
		const address = splitAddress(prop(feature, "ADRESSE"));
		push(result, "ge-hopitaux", index + 1, {
			professionCode,
			name,
			category: { language: "fr", label: type },
			...address,
			point: pointOf(feature),
			phone: prop(feature, "TELEPHONE"),
		});
	}
	return result;
}

/** Geneva's nursing homes (EMS, SITG), keyed by their cantonal address id. */
function parseGenevaHomes(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("ge-ems");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const place = splitPostcodeLocality(prop(feature, "LOCALITE"));
		const id = prop(feature, "IDPADR").replace(/\D/g, "");
		push(result, "ge-ems", index + 1, {
			nationalId: id || undefined,
			professionCode: CH_NURSING_HOME,
			name: prop(feature, "NOM_EMS") || prop(feature, "NOM_COURT"),
			category: { language: "fr", label: "EMS" },
			street: streetCh(prop(feature, "ADRESSE")),
			postcode: place?.postcode ?? null,
			locality: place?.locality ?? "",
			point: pointOf(feature),
			phone: prop(feature, "TELEPHONE"),
		});
	}
	return result;
}

/** Geneva's pharmacies that vaccinate (SITG): the only open list of Geneva's pharmacies. */
function parseGenevaPharmacies(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("ge-pharmacies");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		// "Route de Thonon 40 (dans le Centre Manor), 1222 Vésenaz"
		const address = splitAddress(prop(feature, "ADRESSE"));
		push(result, "ge-pharmacies", index + 1, {
			professionCode: CH_PHARMACY,
			name: prop(feature, "NOM_SITE"),
			...address,
			point: pointOf(feature),
			phone: prop(feature, "CONTACT").replace(/^t[ée]l\.?\s*:?\s*/i, ""),
		});
	}
	return result;
}

/** Basel-Landschaft's pharmacies, keyed by the business's GLN; the pharmacist's names are never read. */
function parseBaselLandPharmacies(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("bl-apotheken");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const gln = prop(feature, "gln_betrieb").replace(/\D/g, "");
		push(result, "bl-apotheken", index + 1, {
			nationalId: gln || undefined,
			professionCode: CH_PHARMACY,
			name: prop(feature, "betriebsname"),
			operator: prop(feature, "zusatzname"),
			street: streetOf(prop(feature, "strasse"), prop(feature, "hausnummer")),
			postcode: normalizeChPostcode(prop(feature, "plz")),
			locality: prop(feature, "ort"),
			point: pointOf(feature),
		});
	}
	return result;
}

/** Basel-Landschaft's homes (some lie in Basel-Stadt, on the canton's list), with their commune number. */
function parseBaselLandHomes(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("bl-heime");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const commune = prop(feature, "bfs_nummer").replace(/\D/g, "");
		push(result, "bl-heime", index + 1, {
			professionCode: CH_NURSING_HOME,
			name: prop(feature, "institution"),
			street: streetCh(prop(feature, "post_adresse")),
			postcode: normalizeChPostcode(prop(feature, "plz")),
			locality: prop(feature, "ort"),
			communeCode: commune || null,
			point: pointOf(feature),
			phone: prop(feature, "telefon"),
		});
	}
	return result;
}

/** The kind of a Basel-Stadt hospital, from its category. */
function baselHospitalKind(category: string): string {
	const value = category.toLowerCase();
	if (value.startsWith("psychiatr")) return CH_PSYCHIATRIC_CLINIC;
	if (value.startsWith("rehab")) return CH_REHAB_CLINIC;
	if (value.startsWith("geburtshaus")) return CH_BIRTH_CENTRE;
	if (value.startsWith("geriatrie")) return CH_SPECIALTY_CLINIC;
	return CH_HOSPITAL;
}

/** Basel-Stadt's hospitals, with their category and whether they have an emergency department. */
function parseBaselHospitals(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("bs-spitaeler");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const category = prop(feature, "Kategorie");
		const emergency = feature.properties.Notfallstation === true;
		push(result, "bs-spitaeler", index + 1, {
			professionCode: baselHospitalKind(category),
			name: prop(feature, "Name"),
			category: category ? { language: "de", label: category } : null,
			services: emergency
				? [{ source: CH_SERVICE_SOURCE, code: "NF", label: "Notfallstation" }]
				: [],
			...splitAddress(prop(feature, "Adresse")),
			point: pointOf(feature),
			phone: prop(feature, "Telefon"),
		});
	}
	return result;
}

/** Basel-Stadt's nursing homes; day centres (`Tageseinrichtung`) are left out. */
function parseBaselHomes(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("bs-heime");
	for (const [index, feature] of readFeatures(text).entries()) {
		result.lines++;
		const category = prop(feature, "Kategorie");
		if (category.toLowerCase().startsWith("tages")) {
			skip(result, "day centre");
			continue;
		}
		const address = splitAddress(prop(feature, "Adresse"));
		push(result, "bs-heime", index + 1, {
			professionCode: CH_NURSING_HOME,
			name: prop(feature, "Name"),
			category: category && category !== "Pflegeheim" ? { language: "de", label: category } : null,
			street: address.street,
			postcode: address.postcode,
			locality: address.locality || prop(feature, "Gemeinde"),
			point: pointOf(feature),
			phone: prop(feature, "Telefon"),
		});
	}
	return result;
}

/** The columns read from Zürich's homes, by header. */
export const ZH_COLUMNS = [
	"jahr",
	"id",
	"betriebsname_bfs",
	"strasse",
	"plz",
	"ort",
	"latitude",
	"longitude",
] as const;

/**
 * Zürich's homes: a statistics file in long format (one line per home, year and figure). The
 * homes of its latest year are the list; a home's id (eight hexadecimal digits) is its key, read
 * as a number. The figures are not read.
 */
function parseZurichHomes(text: string): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("zh-heime");
	const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
	const header = parseQuotedRecord(lines[0] ?? "", ",") ?? [];
	const index: Record<string, number> = {};
	for (const column of ZH_COLUMNS) {
		const at = header.indexOf(column);
		if (at < 0) throw new Error(`zh-heime: missing column ${column}`);
		index[column] = at;
	}
	type Line = { lineNo: number; cells: string[] };
	const byYear = new Map<number, Map<string, Line>>();
	for (let lineNo = 2; lineNo <= lines.length; lineNo++) {
		const raw = lines[lineNo - 1];
		if (!raw?.trim()) continue;
		const cells = parseQuotedRecord(raw, ",");
		if (!cells) {
			quarantine(result, lineNo, "unreadable line", String(lineNo));
			continue;
		}
		const year = Number(cells[index.jahr ?? -1]);
		const id = (cells[index.id ?? -1] ?? "").trim().toLowerCase();
		if (!Number.isInteger(year) || !/^[0-9a-f]{1,8}$/.test(id)) {
			quarantine(result, lineNo, "no year or id", id || String(lineNo));
			continue;
		}
		let homes = byYear.get(year);
		if (!homes) {
			homes = new Map();
			byYear.set(year, homes);
		}
		if (!homes.has(id)) homes.set(id, { lineNo, cells });
	}
	const latest = Math.max(...byYear.keys());
	const homes = byYear.get(latest) ?? new Map<string, Line>();
	result.lines = homes.size;
	result.skipped["earlier years"] = [...byYear.entries()]
		.filter(([year]) => year !== latest)
		.reduce((sum, [, entries]) => sum + entries.size, 0);
	for (const [id, { lineNo, cells }] of homes) {
		const cell = (column: (typeof ZH_COLUMNS)[number]) => cleanText(cells[index[column] ?? -1]);
		const latitude = Number(cell("latitude"));
		const longitude = Number(cell("longitude"));
		const point =
			Number.isFinite(latitude) &&
			Number.isFinite(longitude) &&
			inSwitzerland({ latitude, longitude })
				? { latitude, longitude }
				: null;
		push(result, "zh-heime", lineNo, {
			nationalId: String(Number.parseInt(id, 16)),
			professionCode: CH_NURSING_HOME,
			name: cell("betriebsname_bfs"),
			street: streetCh(cell("strasse")),
			postcode: normalizeChPostcode(cell("plz")),
			locality: cell("ort"),
			point,
		});
	}
	return result;
}

/** The kind of a Jura institution, from its type, or null for the kinds the market does not list. */
function juraKind(type: string): string | null {
	const value = type.toLowerCase();
	if (value.startsWith("hôpital") || value.startsWith("hopital")) return CH_HOSPITAL;
	if (value.includes("naissance")) return CH_BIRTH_CENTRE;
	if (value.includes("(ems)") || value.startsWith("ems") || value.startsWith("home médicalisé")) {
		return CH_NURSING_HOME;
	}
	return null;
}

/**
 * Jura's care institutions: a shapefile (Windows-1252, LV95 multipoints) in the canton's ZIP. The
 * hospitals, nursing homes (EMS, medicalised homes) and the birth centre are read; the
 * psychiatric outpatient centres, sheltered flats and the meeting centre are not facilities the
 * market lists.
 */
function parseJura(archive: Buffer): ParseResult<ChSourceId> {
	const result = emptyResult<ChSourceId>("ju-institutions");
	const entries = readZipEntries(archive, (name) =>
		/centre_hospitalier\.(?:dbf|shp)$/i.test(name.split("/").pop() ?? ""),
	);
	const dbf = entries.find((entry) => /\.dbf$/i.test(entry.name));
	const shp = entries.find((entry) => /\.shp$/i.test(entry.name));
	if (!dbf || !shp)
		throw new Error("ju-institutions: no shapefile of the institutions in the archive");
	const table = readDbf(dbf.data, { encoding: "windows-1252" });
	const points = readShpPoints(shp.data);
	if (points.length !== table.records.length) {
		throw new Error(`ju-institutions: ${table.records.length} records for ${points.length} points`);
	}
	for (const [index, record] of table.records.entries()) {
		result.lines++;
		const type = cleanText(record.TYPE);
		const professionCode = juraKind(type);
		if (!professionCode) {
			skip(result, "not listed");
			continue;
		}
		const grid = points[index];
		const point = grid ? swissGridToWgs84(grid.x, grid.y) : null;
		const place = splitPostcodeLocality(record.NPA_COMMUN);
		push(result, "ju-institutions", index + 1, {
			professionCode,
			name: cleanText(record.NOM_SITE) || cleanText(record.NOM_COMPLE),
			category: { language: "fr", label: type },
			street: streetCh(record.ADRESSE),
			postcode: place?.postcode ?? null,
			locality: place?.locality ?? "",
			point: point && inSwitzerland(point) ? point : null,
			phone: cleanText(record.TEL),
		});
	}
	return result;
}

/** Reads a cantonal list's file (its bytes as published) into rows. */
export function parseCantonalSource(source: ChSourceId, data: Buffer): ParseResult<ChSourceId> {
	const config = CH_SOURCES[source];
	const text = () => (config.format === "geojson-zip" ? geojsonOfZip(data) : data.toString("utf8"));
	switch (source) {
		case "be-spitaeler":
			return parseBernHospitals(text());
		case "be-heime":
			return parseBernHomes(text());
		case "ge-hopitaux":
			return parseGenevaHospitals(text());
		case "ge-ems":
			return parseGenevaHomes(text());
		case "ge-pharmacies":
			return parseGenevaPharmacies(text());
		case "bl-apotheken":
			return parseBaselLandPharmacies(text());
		case "bl-heime":
			return parseBaselLandHomes(text());
		case "bs-spitaeler":
			return parseBaselHospitals(text());
		case "bs-heime":
			return parseBaselHomes(text());
		case "zh-heime":
			return parseZurichHomes(text());
		case "ju-institutions":
			return parseJura(data);
		case "bag":
			throw new Error("the FOPH's figures are read by parseBag");
	}
}
