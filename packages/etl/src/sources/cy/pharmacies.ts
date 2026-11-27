/**
 * The Pharmaceutical Services' list of private pharmacies ("Κατάλογος Ιδιωτικών Φαρμακείων",
 * Ministry of Health, data.gov.cy, CC BY 4.0): one CSV row per pharmacy, with its district, its
 * registration number (ΑΜ), the pharmacist's surname and first name, its address, an additional
 * address line, its town or community, postcode and telephone, and the pharmacist's house
 * telephone number. Published yearly (664 rows in its 2024–2025 edition).
 *
 * Only the pharmacy is read: its registration number, district, street, town, postcode and
 * telephone. The pharmacist's surname, first name and house telephone number are personal data
 * and are never read (their columns are not even mapped), nor is the additional address line,
 * which names nearby shops and, at times, people. The list names no pharmacy but by its
 * pharmacist, so a page is named after its address ("Φαρμακείο, Ερμού 51Γ, Λάρνακα"). A mobile
 * number is left out (more often a person's than a pharmacy's), as is a number shared by more
 * than three pharmacies; two rows at one address (two pharmacists of one pharmacy) are one page,
 * under the lower registration number.
 */

import { isCyMobile, normalizeCyPostcode, toE164Cy } from "@apercura/core";
import { CY_PHARMACY } from "@apercura/core/taxonomy";
import { clean, cleanStreet, columnsOf, csvRecords, nameKey } from "./text";
import { type CyFacility, emptyResult, type ParseResult, quarantine, skip } from "./types";

/** A number shared by more pharmacies than this is a switchboard's or a group's: not stored. */
const MAX_PHONE_OWNERS = 3;

/**
 * The columns read, by their English and Greek headers. The pharmacist's name and house
 * telephone number are deliberately absent: they are never read.
 */
const COLUMNS = {
	district: ["District", "Επαρχία"],
	number: ["S/N", "ΑΜ", "Α.Μ.", "Reg. No", "ΑΜ / Reg. No"],
	street: ["Address", "Διεύθυνση", "Διεύθυνση / Address"],
	town: [
		"City / Community",
		"Municipality/Community",
		"Δήμος/Κοινότητα",
		"Δήμος/Κοινότητα / Municipality/Community",
	],
	postcode: ["Postal Code", "Post Code", "Τ. Κ.", "Τ.Κ.", "Τ. Κ. / Post Code"],
	phone: ["Telephone", "Pharmacy Tel No", "Τηλ. Φαρμακείου", "Τηλ. Φαρμακείου / Pharmacy Tel No"],
} as const;

/** A pharmacy's name: its address, the list naming it after its pharmacist only. */
export function pharmacyName(street: string, town: string): string {
	return `Φαρμακείο, ${[street, town].filter(Boolean).join(", ")}`;
}

/** Reads the list. Throws when it is not the list (a missing column, no row). */
export function parsePharmacies(data: Buffer): ParseResult {
	const result = emptyResult("farmakeia");
	const [header, ...records] = csvRecords(data);
	if (!header) throw new Error("not the list of private pharmacies: empty file");
	const columns = columnsOf(header.fields, COLUMNS, "list of private pharmacies");
	const read = (fields: string[], key: keyof typeof COLUMNS) => clean(fields[columns[key]]);
	type Row = CyFacility & { rawPhone: string | null };
	const rows: Row[] = [];
	const phoneOwners = new Map<string, Set<string>>();
	for (const { lineNo, fields } of records) {
		result.lines++;
		const number = read(fields, "number");
		if (!/^[1-9]\d{0,5}$/.test(number)) {
			quarantine(result, lineNo, "no registration number", number);
			continue;
		}
		const town = read(fields, "town");
		const street = cleanStreet(read(fields, "street"), [town]);
		if (!street || !town) {
			quarantine(result, lineNo, street ? "no town" : "no address", number);
			continue;
		}
		const rawPhone = read(fields, "phone");
		let phone = toE164Cy(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && isCyMobile(phone)) {
			result.counters.mobilePhones++;
			phone = null;
		}
		if (phone) {
			const owners = phoneOwners.get(phone) ?? new Set<string>();
			owners.add(number);
			phoneOwners.set(phone, owners);
		}
		rows.push({
			source: "farmakeia",
			lineNo,
			nationalId: number,
			professionCode: CY_PHARMACY,
			name: pharmacyName(street, town),
			location: {
				street,
				postcode: normalizeCyPostcode(read(fields, "postcode")),
				town,
				district: read(fields, "district") || null,
				point: null,
				phone,
			},
			rawPhone: phone,
		});
	}
	if (result.lines === 0) throw new Error("not the list of private pharmacies: no row");
	// The lower registration number first, so the page of a pharmacy listed twice keeps it.
	rows.sort((a, b) => Number(a.nationalId) - Number(b.nationalId));
	const numbers = new Set<string>();
	const places = new Set<string>();
	for (const { rawPhone, ...row } of rows) {
		if (numbers.has(row.nationalId)) {
			skip(result, "duplicate number");
			continue;
		}
		numbers.add(row.nationalId);
		const place = `${nameKey(row.location.street ?? "")}|${row.location.postcode ?? nameKey(row.location.town ?? "")}`;
		if (places.has(place)) {
			skip(result, "same pharmacy");
			continue;
		}
		places.add(place);
		if (rawPhone && (phoneOwners.get(rawPhone)?.size ?? 0) > MAX_PHONE_OWNERS) {
			result.counters.sharedPhones++;
			row.location.phone = null;
		}
		result.rows.push(row);
	}
	return result;
}
