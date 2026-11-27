/**
 * The Medicines Authority's register of licensed pharmacies in Malta and Gozo ("Licensed
 * Pharmacies in Malta and Gozo"), published on the national open data portal (data.gov.mt) as an
 * API under CC BY 4.0: one JSON answer, `{ "value": [ … ] }`, one object per pharmacy with its
 * type, licence number, name, address, locality, postcode, telephone and point (`Lattitude`,
 * `Longitude`, as the API spells them).
 *
 * The licence and the date of the data are read, on every run, from the dataset's record in the
 * European data portal's catalogue, which harvests data.gov.mt's (the national portal itself
 * answers automated clients with a block page): the publisher must be the Medicines Authority and
 * a distribution's licence CC BY 4.0, or the run fails and the pages stay as they are.
 *
 * Only the community pharmacies are kept (`MT_COMMUNITY_TYPES`): hospital in-patient pharmacies,
 * government entities' pharmacies, medical-oxygen and parenteral-nutrition dispensaries serve no
 * public counter. The register names no pharmacist; its `ID` is a row number, never read.
 */
import { mtLicenceKey, normalizeMtPostcode, toE164Mt } from "@apercura/core";
import { MT_COMMUNITY_TYPES, MT_PHARMACY } from "@apercura/core/taxonomy";
import { emptyResult, type ParseResult, quarantine, skip } from "./types";

/** The register's API (`ETL_MT_PHARMACIES_URL`). */
export const DEFAULT_MT_PHARMACIES_URL = "https://data.gov.mt/Pharmacy/V1/Pharmacy";

/** The dataset's record in the European data portal (`ETL_MT_CATALOGUE_URL`). */
export const DEFAULT_MT_CATALOGUE_URL =
	"https://data.europa.eu/api/hub/search/datasets/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72";

/** The publisher and licence the register must still carry. */
export const MT_PUBLISHER = "Medicines Authority";
export const MT_LICENCE = "https://creativecommons.org/licenses/by/4.0/";

/** Malta and Gozo's bounding box: a point outside is a typo, never a pharmacy abroad. */
export const MT_BOUNDS = { minLat: 35.78, maxLat: 36.09, minLon: 14.18, maxLon: 14.58 } as const;

export function inMalta(latitude: number, longitude: number): boolean {
	return (
		latitude >= MT_BOUNDS.minLat &&
		latitude <= MT_BOUNDS.maxLat &&
		longitude >= MT_BOUNDS.minLon &&
		longitude <= MT_BOUNDS.maxLon
	);
}

export type MtCatalogue = {
	publisher: string | null;
	licences: string[];
	/** The record's `modified`, as `YYYYMMDD`. */
	edition: number | null;
};

/** Reads the catalogue record. Throws when it is not one. */
export function parseMtCatalogue(data: Buffer | string): MtCatalogue {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data.toString());
	} catch {
		throw new Error("catalogue: not JSON");
	}
	const result = (parsed as { result?: Record<string, unknown> })?.result;
	if (!result || typeof result !== "object") throw new Error("catalogue: no dataset record");
	const publisher = (result.publisher as { name?: unknown } | undefined)?.name;
	const distributions = Array.isArray(result.distributions) ? result.distributions : [];
	const licences = distributions
		.map((item) => (item as { license?: { id?: unknown } })?.license?.id)
		.filter((id): id is string => typeof id === "string");
	const modified = typeof result.modified === "string" ? result.modified : "";
	const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(modified);
	return {
		publisher: typeof publisher === "string" ? publisher.trim() : null,
		licences,
		edition: day ? Number(`${day[1]}${day[2]}${day[3]}`) : null,
	};
}

/**
 * Why the register may not be imported under its catalogue record, or null when it may: the
 * publisher is the Medicines Authority and a distribution is under CC BY 4.0.
 */
export function mtTermsProblem(catalogue: MtCatalogue): string | null {
	if (catalogue.publisher !== MT_PUBLISHER) {
		return `the publisher is "${catalogue.publisher ?? "none"}", not the ${MT_PUBLISHER}`;
	}
	const licence = MT_LICENCE.replace(/\/$/, "");
	if (!catalogue.licences.some((id) => id.replace(/\/$/, "") === licence)) {
		return `no distribution under CC BY 4.0 (${catalogue.licences.join(", ") || "no licence"})`;
	}
	return null;
}

const text = (value: unknown): string =>
	typeof value === "string" || typeof value === "number" ? String(value) : "";

/** Whitespace collapsed, line breaks included (`Brown's Medical\nPlaza Pharmacy`). */
export const oneLine = (value: unknown): string => text(value).replace(/\s+/g, " ").trim();

/** The street as written, without a trailing comma (`Mater Dei Hospital, Tal-Qroqq,`). */
export function streetOf(value: unknown): string | null {
	const street = oneLine(value).replace(/[\s,]+$/, "");
	return street || null;
}

/** The locality as written, its curly apostrophes straight (`St. Paul’s Bay` → `St. Paul's Bay`). */
export function localityOf(value: unknown): string | null {
	const locality = oneLine(value).replace(/[’`]/g, "'");
	return locality || null;
}

const coordinate = (value: unknown): number | null => {
	const raw = text(value).trim();
	if (!raw) return null;
	const number = Number(raw.replace(",", "."));
	return Number.isFinite(number) ? number : null;
};

/**
 * Reads the register. Throws when the answer is not one (no `value` array); a row that cannot be
 * read is quarantined, a row of another type is skipped.
 */
export function parseMtPharmacies(data: Buffer | string, edition: number | null): ParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(data.toString());
	} catch {
		throw new Error("not JSON");
	}
	const rows = (parsed as { value?: unknown })?.value;
	if (!Array.isArray(rows)) throw new Error("not the register: no value array");
	const result = emptyResult("pharmacies");
	result.edition = edition;
	result.lines = rows.length;
	const seen = new Set<string>();
	const community = new Set(MT_COMMUNITY_TYPES);
	rows.forEach((raw, index) => {
		const lineNo = index + 1;
		const row = (raw ?? {}) as Record<string, unknown>;
		const type = oneLine(row.Type);
		if (!community.has(type)) {
			skip(result, `type:${type || "none"}`);
			return;
		}
		const licence = oneLine(row.Licence_No);
		const key = mtLicenceKey(licence);
		if (!key) {
			quarantine(result, lineNo, "licence", licence);
			return;
		}
		if (seen.has(key)) {
			quarantine(result, lineNo, "duplicate licence", licence);
			return;
		}
		const name = oneLine(row.Pharmacy_Name);
		if (!name) {
			quarantine(result, lineNo, "name", licence);
			return;
		}
		seen.add(key);
		const latitude = coordinate(row.Lattitude ?? row.Latitude);
		const longitude = coordinate(row.Longitude);
		const point = latitude !== null && longitude !== null && inMalta(latitude, longitude);
		if (!point) result.counters.withoutPoint++;
		const rawPhone = oneLine(row.Telephone_No);
		const phone = toE164Mt(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		const rawPostcode = oneLine(row.Post_Code);
		const postcode = normalizeMtPostcode(rawPostcode);
		if (rawPostcode && !postcode) result.counters.invalidPostcodes++;
		result.rows.push({
			source: "pharmacies",
			lineNo,
			nationalId: key,
			professionCode: MT_PHARMACY,
			name,
			street: streetOf(row.Pharmacy_Address),
			postcode,
			locality: localityOf(row.Locality),
			longitude: point ? longitude : null,
			latitude: point ? latitude : null,
			phone,
		});
	});
	return result;
}
