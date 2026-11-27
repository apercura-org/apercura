/**
 * The HSE's Health Atlas layers on GeoHive (ArcGIS feature services, GeoJSON in WGS 84, a March
 * 2020 snapshot, CC BY 4.0): hospitals and health centres. Each feature is a point and an
 * address in lines (`address1`–`address4`, `address5` for the health centres, the Eircode in a
 * field of its own or a line); neither layer numbers its facilities, so a facility's key is
 * derived from its county, name and first address line (`derivedKeyIe`).
 *
 * The health centres' `lat` and `lon` fields are swapped: the geometry, which is right, is the
 * point. Their names carry stray spaces and trailing commas and some were encoded twice
 * (`Ionad SlÃƒÂ¡inte`): they are cleaned and repaired. Many community hospitals are named by
 * their town only ("Abbeyleix", "Baggot Street"): their page is named after the hospital
 * (`hospitalName`).
 *
 * The layer's item must still name the CC BY 4.0 licence, or the layer is left out of the run.
 */
import { findEircode, normalizeEircode } from "@apercura/core";
import { ieCountyOfName } from "@apercura/core/country";
import { IE_HOSPITAL_KINDS } from "@apercura/core/taxonomy";
import {
	cleanText,
	derivedKeyIe,
	facilityMatchKey,
	titleCaseIfUpper,
	trimPunctuation,
} from "./names";
import {
	count,
	emptyResult,
	IE_HOSPITAL_KIND_SOURCE,
	IE_SOURCES,
	type IeSourceId,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

type Feature = {
	type?: string;
	geometry?: { type?: string; coordinates?: unknown } | null;
	properties?: Record<string, unknown> | null;
};

type FeatureCollection = { type?: string; features?: Feature[] };

/** Thrown when a layer's item no longer names the licence the import relies on. */
export class LicenceChangedError extends Error {
	constructor(detail: string) {
		super(`licence changed: ${detail}`);
	}
}

/** The licence the layers are re-used under, as their items name it. */
const CC_BY_4 = /creative commons attribution 4\.0|creativecommons\.org\/licenses\/by\/4\.0/i;

/**
 * Reads a layer's ArcGIS item: its `licenseInfo` must name CC BY 4.0 ("Creative Commons
 * Attribution 4.0"); returns the item's last change (`modified`, ISO 8601) for the stats.
 * Throws `LicenceChangedError` otherwise.
 */
export function checkHseItem(raw: string): { modified: string | null } {
	let item: { licenseInfo?: unknown; modified?: unknown; error?: unknown };
	try {
		item = JSON.parse(raw) as typeof item;
	} catch {
		throw new LicenceChangedError("the layer's item is not JSON");
	}
	const licence = typeof item.licenseInfo === "string" ? item.licenseInfo : "";
	if (!CC_BY_4.test(licence)) {
		throw new LicenceChangedError("the layer's item no longer names CC BY 4.0");
	}
	const modified =
		typeof item.modified === "number" && Number.isFinite(item.modified)
			? new Date(item.modified).toISOString()
			: null;
	return { modified };
}

/** Ireland's extent, with a margin: a point outside it is not the facility's. */
const inIreland = (longitude: number, latitude: number) =>
	longitude > -11 && longitude < -5.4 && latitude > 51.3 && latitude < 55.5;

const text = (properties: Record<string, unknown>, key: string) => {
	const value = properties[key];
	return typeof value === "string" || typeof value === "number" ? cleanText(String(value)) : "";
};

/** A line naming the county (`Co. Cork`, `County Clare`, `Co Donegal.`): not part of the address. */
const COUNTY_LINE = /^(?:co\.?|county)\s+\S/i;

type Address = {
	/** The lines that are the address, in order, without the Eircode and the county line. */
	parts: string[];
	eircode: string | null;
	/** The county the lines name (`Co. Laois`, `Dublin 4`, `Cork`), the last first. */
	countyCode: string | null;
};

/** A layer's address lines, read as an address. */
export function hseAddress(lines: readonly string[], eircodeField: string): Address {
	let eircode = normalizeEircode(eircodeField);
	let countyCode: string | null = null;
	const parts: string[] = [];
	for (const raw of lines) {
		const line = trimPunctuation(cleanText(raw).replace(/\.$/, ""));
		if (!line || /^null$/i.test(line)) continue;
		const found = findEircode(line);
		if (found && line.replace(/\s/g, "").toUpperCase() === found.replace(" ", "")) {
			eircode ??= found;
			continue;
		}
		const county = ieCountyOfName(line);
		if (county) countyCode = county;
		if (COUNTY_LINE.test(line)) continue;
		parts.push(titleCaseIfUpper(line));
	}
	return { parts, eircode, countyCode };
}

/** Words that make a name a facility's (`… Hospital`, `… Clinic`): a name without one is a town's. */
const FACILITY_WORD =
	/\b(?:hospitals?|clinics?|infirmary|institute|centre|center|unit|home|campus|hospice|network)\b/i;

/** A street named after a hospital (`Hospital Road`, `Hospital Hill`): an address, not a name. */
const STREET_WORD = /\b(?:road|street|hill|lane|avenue|drive|terrace|way|place|square)\b/i;

/** A line that starts with the kind of a hospital, not its name (`Community Hospital And Hospice`). */
const KIND_FIRST = /^(?:community|district|general|regional|county)\b/i;

/**
 * The name a hospital's page prints. Many community hospitals are named by their town in the
 * layer ("Abbeyleix", "Baggot Street"; "Athy", whose first line is "Saint Vincent's Hospital"):
 * - a name with a facility word (hospital, clinic, infirmary, institute, centre, unit, home,
 *   campus, hospice, network) is kept;
 * - else a first address line with "Hospital" in it (not a street: "Hospital Road") is the name,
 *   and leaves the address
 *   ("Saint Vincent's Hospital"); when that line starts with the kind ("Community Hospital And
 *   Hospice"), the town's name comes first ("Cahercalla Community Hospital And Hospice");
 * - else the town's name and the kind: "Abbeyleix Community Hospital" for a community hospital,
 *   "Peamount Hospital" for the others.
 */
export function hospitalName(
	name: string,
	subcategory: string,
	firstLine: string | null,
): { name: string; from: "name" | "line" | "kind"; usesLine: boolean } {
	if (FACILITY_WORD.test(name)) return { name, from: "name", usesLine: false };
	if (firstLine && /\bhospital\b/i.test(firstLine) && !STREET_WORD.test(firstLine)) {
		return {
			name: KIND_FIRST.test(firstLine) ? `${name} ${firstLine}` : firstLine,
			from: "line",
			usesLine: true,
		};
	}
	const kind = subcategory.toLowerCase() === "community" ? "Community Hospital" : "Hospital";
	return { name: `${name} ${kind}`, from: "kind", usesLine: false };
}

/** Words that make a name a health service's (`… Health Centre`, `… PCC`, `Ionad Sláinte …`). */
const SERVICE_WORD =
	/\b(?:health|centres?|centers?|ctr|clinics?|hospitals?|unit|pcc|pct|cnu|opd|pso|frc|dispensary|ionad|office|offices|services?|care|campus|home|surgery|practice|hse|house|building|lodge|hub|complex|plaza|hall|residence|department|dept|agency|now ?doc)\b/i;

/**
 * Premises of the HSE's layer that are not a place the public goes for care (a stores
 * department, another department's office, the civil registration service): not imported.
 */
const NOT_CARE =
	/\b(?:materials management|supplies department|civil registration|department of employment affairs|social protection)\b/i;

/** True when the layer's row is premises that are not a place of care (`NOT_CARE`). */
export const isNotCare = (name: string) => NOT_CARE.test(name);

/**
 * The name a health centre's page prints: as published, cleaned, without a leading `HSE - `;
 * a name that is only a street or a town ("Church Road", "Lemybrien") is the health centre's
 * there: "Church Road Health Centre".
 */
export function healthCentreName(raw: string): { name: string; completed: boolean } {
	const name = trimPunctuation(cleanText(raw).replace(/^HSE\s*-\s*/i, ""));
	if (!name || SERVICE_WORD.test(name)) return { name, completed: false };
	return { name: `${name} Health Centre`, completed: true };
}

function features(raw: string, source: string): Feature[] {
	let parsed: FeatureCollection;
	try {
		parsed = JSON.parse(raw) as FeatureCollection;
	} catch {
		throw new Error(`${source}: not JSON`);
	}
	if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
		throw new Error(`${source}: not a GeoJSON feature collection`);
	}
	return parsed.features;
}

function pointOf(feature: Feature): { longitude: number; latitude: number } | null {
	const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
	if (!Array.isArray(coordinates)) return null;
	const [longitude, latitude] = coordinates.map(Number);
	if (longitude === undefined || latitude === undefined) return null;
	if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
	return inIreland(longitude, latitude) ? { longitude, latitude } : null;
}

/** The subcategories whose hospitals may be a HIQA designated centre too. */
export const IE_HSE_CARE_KINDS = ["Community", "Continuing Care Service", "Psycho-Geriatric"];

/** Reads one of the HSE's layers. Throws when it is not a layer of points. */
export function parseHseLayer(
	source: Extract<IeSourceId, `hse-${string}`>,
	raw: string,
): ParseResult {
	const config = IE_SOURCES[source];
	const hospitals = source === "hse-hospitals";
	const result = emptyResult(source);
	const seen = new Set<string>();
	const lineKeys = hospitals
		? ["address1", "address2", "address3", "address4"]
		: ["address1", "address2", "address3", "address4", "address5"];
	features(raw, source).forEach((feature, index) => {
		const lineNo = index + 1;
		result.lines++;
		const properties = feature.properties ?? {};
		const rawName = trimPunctuation(cleanText(text(properties, "name")));
		if (rawName !== text(properties, "name").replace(/\s+/g, " ").trim())
			count(result, "namesCleaned");
		if (/[ÃÂ]/.test(String(properties.name ?? "")) && !/[ÃÂ]/.test(rawName)) {
			count(result, "namesRepaired");
		}
		const point = pointOf(feature);
		const lines = lineKeys.map((key) => text(properties, key));
		const address = hseAddress(lines, text(properties, "Eircode"));
		const firstLine = address.parts[0] ?? null;
		const key = derivedKeyIe([address.countyCode ?? "", rawName, firstLine ?? ""]);
		if (!rawName) {
			quarantine(result, lineNo, "no name", key);
			return;
		}
		if (!point) {
			quarantine(result, lineNo, "no point in Ireland", key);
			return;
		}
		if (seen.has(key)) {
			skip(result, "repeated facility");
			return;
		}
		seen.add(key);
		if (!hospitals) {
			const lat = Number(properties.lat);
			if (Number.isFinite(lat) && Math.abs(lat - point.longitude) < 1e-6)
				count(result, "swappedLatLon");
		}
		const subcategory = text(properties, "subcategory");
		let name: string;
		let parts = address.parts;
		const qualifications = [];
		if (hospitals) {
			const named = hospitalName(titleCaseIfUpper(rawName), subcategory, firstLine);
			name = named.name;
			if (named.from !== "name")
				count(result, named.from === "line" ? "namedByAddressLine" : "namedByKind");
			if (named.usesLine) parts = parts.slice(1);
			if (subcategory) {
				qualifications.push({
					source: IE_HOSPITAL_KIND_SOURCE,
					code: subcategory,
					label: IE_HOSPITAL_KINDS[subcategory] ?? subcategory,
				});
				if (!IE_HOSPITAL_KINDS[subcategory]) count(result, "unknownKinds");
			}
		} else {
			if (isNotCare(rawName)) {
				skip(result, "not a place of care");
				return;
			}
			const named = healthCentreName(rawName);
			name = titleCaseIfUpper(named.name);
			if (named.completed) count(result, "namedByKind");
		}
		if (!address.countyCode) count(result, "noCountyInAddress");
		result.rows.push({
			source,
			lineNo,
			idScheme: config.idScheme,
			nationalId: key,
			professionCode: config.professionCode,
			name,
			qualifications,
			street: null,
			townColumn: null,
			addressParts: parts,
			eircode: address.eircode,
			countyCode: address.countyCode,
			towns: [...parts].reverse(),
			latitude: point.latitude,
			longitude: point.longitude,
			phone: null,
			matchNames: [facilityMatchKey(name)].filter(Boolean),
			kind: hospitals ? subcategory || null : null,
		});
	});
	if (result.lines === 0) throw new Error(`${source}: no feature`);
	return result;
}
