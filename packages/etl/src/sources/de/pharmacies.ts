/**
 * The pharmacy lists the Länder publish as open data, each read on its own (a list that cannot be
 * read is left out and keeps its pharmacies):
 *
 * - Thuringia, "Apotheken in Thüringen" (Thüringer Landesamt für Verbraucherschutz through the
 *   GDI-Th, CC BY 4.0, "© GDI-Th"): a point shapefile in a ZIP, ETRS89 / UTM zone 32N, one record
 *   per pharmacy with its name, town, district, postcode, street, house number, kind (main
 *   pharmacy or branch), step-free access, a location note, the municipality key (AGS) and the
 *   number of its file at the Landesamt (`Az_VIS`: `5040-24-2484/420`), whose last part is the
 *   page's key. No phone number is published.
 * - Brandenburg, "Standorte der Apotheken im Land Brandenburg" (Landesamt für Arbeitsschutz,
 *   Verbraucherschutz und Gesundheit through the LGB's OGC API Features, dl-de/by-2-0): GeoJSON
 *   in longitude and latitude, one feature per pharmacy with its name, street, house number,
 *   postcode, town and phone. The list also holds the pharmacies of hospitals, which serve their
 *   wards, not the public, under their hospital's name: left out. Its feature ids are row
 *   numbers, so a pharmacy's key is derived from its address and name.
 */
import { normalizeDePostcode, toE164De } from "@apercura/core";
import { DE_PHARMACY } from "@apercura/core/taxonomy";
import { readDbf, readShpPoints } from "../../lib/shapefile";
import { utmToLonLat } from "../../lib/utm";
import { readZipEntries } from "../../lib/zip";
import { MAX_PHONE_OWNERS } from "./destatis";
import { clean, deSiteKey, streetLine } from "./names";
import {
	type DeQualification,
	emptyResult,
	type ParseResult,
	DE_QUALIFICATION_SOURCES as Q,
	quarantine,
	skip,
} from "./types";

/** A point inside a Land's box, with a margin: else it is not in the Land at all. */
const BOUNDS: Readonly<
	Record<string, { minLng: number; maxLng: number; minLat: number; maxLat: number }>
> = {
	"16": { minLng: 9.8, maxLng: 12.7, minLat: 50.1, maxLat: 51.7 },
	"12": { minLng: 11.2, maxLng: 14.8, minLat: 51.3, maxLat: 53.6 },
};

const inState = (state: string, point: { longitude: number; latitude: number }) => {
	const box = BOUNDS[state];
	return Boolean(
		box &&
			point.longitude >= box.minLng &&
			point.longitude <= box.maxLng &&
			point.latitude >= box.minLat &&
			point.latitude <= box.maxLat,
	);
};

/**
 * A location note that completes a pharmacy's name (`am Markt`, `im Hauptbahnhof`): one that
 * starts with a preposition of place. Other notes (`Center-Apotheke (OHG)`) are left out.
 */
const NAME_NOTE = /^(?:am|an der|an den|auf dem|beim|bei der|im|in der|in den|zum|zur)\s/i;

/** A pharmacy's name with its location note, once (`Muster-Apotheke` + `am Markt`). */
export function pharmacyName(name: string, note: string): string {
	const base = clean(name);
	const extra = clean(note);
	if (!extra || !NAME_NOTE.test(extra) || base.toLowerCase().includes(extra.toLowerCase())) {
		return base;
	}
	return `${base} ${extra}`;
}

/**
 * Step-free access as Thuringia publishes it (`barrierefrei`, `barrierefrei mit Einschränkung
 * *Rampe *Klingel`), as a qualification: `YES` or `PARTIAL`, the restrictions in the label.
 */
export function accessibilityOf(raw: string): DeQualification | null {
	const text = clean(raw);
	if (!/^barrierefrei/i.test(text)) return null;
	const restrictions = text
		.replace(/^barrierefrei\s*(mit Einschränkung)?/i, "")
		.split(/\*|\bund\b/)
		.map((part) => clean(part))
		.filter(Boolean);
	if (!/mit Einschränkung/i.test(text)) {
		return { source: Q.accessibility, code: "YES", label: "Barrierefrei" };
	}
	return {
		source: Q.accessibility,
		code: "PARTIAL",
		label: restrictions.length
			? `Barrierefrei mit Einschränkung (${restrictions.join(", ")})`
			: "Barrierefrei mit Einschränkung",
	};
}

const THURINGIA_COLUMNS = ["Apotheke", "Ort", "PLZ", "Strasse", "HNr", "Typ", "AGS", "Az_VIS"];

/** Parses Thuringia's ZIP. Throws when the archive or its shapefile is unreadable. */
export function parseThuringia(archive: Buffer): ParseResult {
	const result = emptyResult("apo-th");
	const entries = readZipEntries(archive, (name) => /\.(dbf|shp)$/i.test(name));
	const dbf = entries.find((entry) => /\.dbf$/i.test(entry.name));
	const shp = entries.find((entry) => /\.shp$/i.test(entry.name));
	if (!dbf || !shp) throw new Error("Thuringia's archive has no .dbf and .shp");
	const table = readDbf(dbf.data);
	const points = readShpPoints(shp.data);
	const missing = THURINGIA_COLUMNS.filter(
		(name) => !table.fields.some((field) => field.name === name),
	);
	if (missing.length > 0) throw new Error(`Thuringia's table lacks ${missing.join(", ")}`);
	if (points.length !== table.records.length) {
		throw new Error(`Thuringia: ${table.records.length} records but ${points.length} points`);
	}
	const seen = new Set<string>();
	for (const [index, record] of table.records.entries()) {
		const lineNo = index + 1;
		result.lines++;
		const file = clean(record.Az_VIS);
		const id = /\/([1-9]\d{0,6})$/.exec(file)?.[1];
		if (!id) {
			quarantine(result, lineNo, "no file number", file);
			continue;
		}
		if (seen.has(id)) {
			skip(result, "duplicate file number");
			continue;
		}
		const name = pharmacyName(record.Apotheke ?? "", record.Bemerkung ?? "");
		const city = clean(record.Ort);
		if (!name || !city) {
			quarantine(result, lineNo, name ? "no town" : "no name", id);
			continue;
		}
		seen.add(id);
		const ags = clean(record.AGS);
		const rawPostcode = clean(record.PLZ);
		const postcode = normalizeDePostcode(rawPostcode);
		if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
		const shape = points[index];
		const point = shape ? utmToLonLat(shape.x, shape.y, 32) : null;
		const qualifications: DeQualification[] = [];
		const kind = clean(record.Typ);
		if (/^haupt/i.test(kind)) {
			qualifications.push({ source: Q.pharmacyType, code: "MAIN", label: "Hauptapotheke" });
		} else if (/^filial/i.test(kind)) {
			qualifications.push({ source: Q.pharmacyType, code: "BRANCH", label: "Filialapotheke" });
		}
		const access = accessibilityOf(record.Barrierefr ?? "");
		if (access) qualifications.push(access);
		result.rows.push({
			source: "apo-th",
			lineNo,
			nationalId: id,
			professionCode: DE_PHARMACY,
			name,
			street: streetLine(record.Strasse, record.HNr),
			postcode,
			city,
			municipalityCode: /^16\d{6}$/.test(ags) ? ags : null,
			stateCode: "16",
			point: point && inState("16", point) ? point : null,
			phone: null,
			qualifications,
		});
	}
	return result;
}

type Feature = {
	geometry?: { type?: string; coordinates?: unknown } | null;
	properties?: Record<string, unknown> | null;
};

const text = (value: unknown) =>
	typeof value === "string" ? clean(value) : typeof value === "number" ? String(value) : "";

/** Parses Brandenburg's GeoJSON. Throws when it is not a feature collection of the list. */
export function parseBrandenburg(data: Buffer): ParseResult {
	const result = emptyResult("apo-bb");
	const collection = JSON.parse(data.toString("utf8")) as { features?: Feature[] };
	if (!Array.isArray(collection.features)) {
		throw new Error("Brandenburg's list is not a GeoJSON feature collection");
	}
	const features = collection.features;
	if (features.length > 0 && !features.some((feature) => "ap_name" in (feature.properties ?? {}))) {
		throw new Error("Brandenburg's list has no ap_name property");
	}
	const phoneOwners = new Map<string, number>();
	for (const feature of features) {
		const phone = toE164De(text(feature.properties?.telefon));
		if (phone) phoneOwners.set(phone, (phoneOwners.get(phone) ?? 0) + 1);
	}
	const seen = new Set<string>();
	for (const [index, feature] of features.entries()) {
		const lineNo = index + 1;
		result.lines++;
		const properties = feature.properties ?? {};
		const name = text(properties.ap_name);
		const city = text(properties.gemeinde);
		const street = text(properties.strasse);
		const number = text(properties.hausnummer);
		const rawPostcode = text(properties.plz);
		if (!name) {
			quarantine(result, lineNo, "no name", rawPostcode);
			continue;
		}
		if (!/apothek/i.test(name)) {
			skip(result, "hospital pharmacy");
			continue;
		}
		if (!city) {
			quarantine(result, lineNo, "no town", rawPostcode);
			continue;
		}
		const key = deSiteKey(["apo-bb", rawPostcode, street, number, name]);
		if (seen.has(key)) {
			skip(result, "duplicate pharmacy");
			continue;
		}
		seen.add(key);
		const postcode = normalizeDePostcode(rawPostcode);
		if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
		const rawPhone = text(properties.telefon);
		let phone = toE164De(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && (phoneOwners.get(phone) ?? 0) > MAX_PHONE_OWNERS) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
		const point =
			Array.isArray(coordinates) &&
			typeof coordinates[0] === "number" &&
			typeof coordinates[1] === "number"
				? { longitude: coordinates[0], latitude: coordinates[1] }
				: null;
		result.rows.push({
			source: "apo-bb",
			lineNo,
			nationalId: key,
			professionCode: DE_PHARMACY,
			name,
			street: streetLine(street, number),
			postcode,
			city,
			municipalityCode: null,
			stateCode: "12",
			point: point && inState("12", point) ? point : null,
			phone,
			qualifications: [],
		});
	}
	return result;
}
