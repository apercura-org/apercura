/**
 * The State Agency of Medicines' register of licensed pharmaceutical businesses (Zāļu valsts
 * aģentūra, "Farmaceitiskās darbības uzņēmumu reģistrs", data.gov.lv, CC0 1.0, exported daily
 * by dati.zva.gov.lv): one CSV line per licensed place, with its number (`object_initial_id`,
 * kept through licence renewals), name, kind, owner, licence status, address, postcode, phone,
 * e-mail, point (WGS 84), manager and conditions.
 *
 * The pharmacies open to the public are read: general pharmacies (`object_type` 5) and their
 * branches (6) whose licence is in force (`lic_status` 4) and not suspended. Closed pharmacies
 * (hospital pharmacies, 3), wholesalers, manufacturers and brokers are left out. A page needs the
 * name, the address, the point and the phone: the pharmacy's manager, its e-mail and web
 * addresses, its owner's company number and its conditions are never read into a row.
 */
import { normalizeLvPostcode, toE164Lv } from "@apercura/core";
import { LV_PHARMACY } from "@apercura/core/taxonomy";
import { clean, pharmacyName } from "./names";
import { readVarCsv } from "./places";
import { emptyResult, LV_QUALIFICATION_SOURCES, type ParseResult, quarantine, skip } from "./types";

/** The columns read; a missing one fails the file. */
const COLUMNS = [
	"object_initial_id",
	"object_name",
	"object_type",
	"pharm_owner_name",
	"lic_status",
	"suspended",
	"object_addr_nice",
	"object_zipcode",
	"object_phone",
	"object_coord_x",
	"object_coord_y",
] as const;

/** `object_type` of a general pharmacy and of its branch. */
const PHARMACY = "5";
const BRANCH = "6";
/** `lic_status` of a licence in force. */
const IN_FORCE = "4";

/** A published number shared by more places than this is a chain's, not the pharmacy's: not stored. */
export const MAX_PLACES_PER_PHONE = 3;

const BOUNDS = { minLat: 55.6, maxLat: 58.1, minLng: 20.9, maxLng: 28.3 };

/**
 * The street and locality of an address as the register writes it, street first
 * (`Rīgas iela 5, Sigulda, Siguldas nov., LV-2150`): the first part is the street (or the house's
 * name, `"Dālderi"-11`), the rest without the postcode its locality.
 */
export function splitAddress(address: string): { street: string | null; locality: string } {
	const parts = clean(address)
		.replace(/,?\s*LV\s*-?\s*\d{4}\s*$/i, "")
		.split(",")
		.map((part) => clean(part))
		.filter(Boolean);
	if (parts.length <= 1) return { street: null, locality: parts[0] ?? "" };
	return { street: parts[0] ?? null, locality: parts.slice(1).join(", ") };
}

/** Reads the pharmacies of the register. Throws when its header lacks a column. */
export function parseZva(text: string): ParseResult {
	const records = readVarCsv(text.replace(/^\uFEFF+/, ""));
	const header = Object.keys(records[0] ?? {}).map((column) => column.replace(/^\uFEFF+/, ""));
	const missing = COLUMNS.filter((column) => !header.includes(column));
	if (records.length === 0 || missing.length > 0) {
		throw new Error(
			`not the register of pharmaceutical businesses (missing ${missing.join(", ") || "rows"})`,
		);
	}
	const result = emptyResult("pharmacies");
	const rows: { lineNo: number; record: Record<string, string> }[] = [];
	records.forEach((raw, index) => {
		const record: Record<string, string> = {};
		for (const [column, value] of Object.entries(raw))
			record[column.replace(/^\uFEFF+/, "")] = value;
		const type = clean(record.object_type);
		if (type !== PHARMACY && type !== BRANCH) {
			skip(result, type === "3" ? "closedPharmacy" : "notAPharmacy");
			return;
		}
		result.lines++;
		if (clean(record.lic_status) !== IN_FORCE || clean(record.suspended) === "1") {
			skip(result, "licenceNotInForce");
			return;
		}
		rows.push({ lineNo: index + 2, record });
	});
	const phones = new Map<string, number>();
	for (const { record } of rows) {
		const phone = toE164Lv(record.object_phone);
		if (phone) phones.set(phone, (phones.get(phone) ?? 0) + 1);
	}
	for (const { lineNo, record } of rows) {
		const id = clean(record.object_initial_id);
		const name = clean(record.object_name);
		const address = clean(record.object_addr_nice);
		if (!/^[1-9]\d{0,8}$/.test(id) || !name || !address) {
			quarantine(result, lineNo, "no number, name or address", id);
			continue;
		}
		const { street, locality } = splitAddress(address);
		if (!locality) {
			quarantine(result, lineNo, "address", id);
			continue;
		}
		const longitude = Number(clean(record.object_coord_x));
		const latitude = Number(clean(record.object_coord_y));
		const located =
			clean(record.object_coord_x) !== "" &&
			Number.isFinite(longitude) &&
			Number.isFinite(latitude) &&
			latitude >= BOUNDS.minLat &&
			latitude <= BOUNDS.maxLat &&
			longitude >= BOUNDS.minLng &&
			longitude <= BOUNDS.maxLng;
		const rawPhone = clean(record.object_phone);
		let phone = toE164Lv(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && (phones.get(phone) ?? 0) > MAX_PLACES_PER_PHONE) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const branch = clean(record.object_type) === BRANCH;
		result.rows.push({
			source: "pharmacies",
			lineNo,
			nationalId: id,
			professionCode: LV_PHARMACY,
			name: pharmacyName(name, record.pharm_owner_name ?? ""),
			sites: [
				{
					key: id,
					name: null,
					street,
					locality,
					postcode:
						normalizeLvPostcode(record.object_zipcode) ??
						normalizeLvPostcode(/LV\s*-?\s*\d{4}\s*$/i.exec(address)?.[0]),
					point: located ? { longitude, latitude } : null,
					phone,
				},
			],
			qualifications: [
				{
					source: LV_QUALIFICATION_SOURCES.pharmacyType,
					code: branch ? "branch" : "main",
					label: null,
				},
			],
		});
	}
	return result;
}
