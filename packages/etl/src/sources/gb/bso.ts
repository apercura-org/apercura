/**
 * The Business Services Organisation's lists for Northern Ireland (OpenDataNI, Open
 * Government Licence), quarterly CSVs with a header line:
 *
 * - GP Practice List Sizes, "GP Practice Reference File": `PracNo`, `PracticeName` (the
 *   partners' names, `Dr. EXAMPLE & PARTNERS`: never shown), `Address1` (the practice's own
 *   name), `Address2`, `Address3`, `Postcode`, `LCG` (the commissioning group);
 * - Dentist and Surgery List, "Dental Surgery List": `ADDRESS` (`NAME, STREET, TOWN`, the
 *   name optional), `POSTCODE`, `TELEPHONE_NO`, `LGD` (the local government district). It gives
 *   no number, so a surgery's key is derived from its address (`niDentalKey`). The companion
 *   "Dentist Contractor List" names the dentists: it is not imported.
 *
 * Northern Irish postcodes cannot be located with open data (Code-Point Open covers Great
 * Britain; the ONS directory's Northern Irish part is licensed by Land & Property Services for
 * internal use only), so these practices are placed by town, from the OSNI gazetteer.
 */
import { createHash } from "node:crypto";
import { isValidGbSourceId, normalizeGbPostcode, toE164Gb } from "@apercura/core";
import { GB_DENTAL_PRACTICE, GB_GP_PRACTICE } from "@apercura/core/taxonomy";
import { mapColumns } from "../../lib/text";
import { isPremisesName, namesAPerson, practiceDisplayName, titleCaseGb } from "./names";
import { SECURE_SETTING } from "./ods";
import {
	csvRecords,
	decodeText,
	emptyResult,
	field,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

const GP_COLUMNS = {
	code: "PracNo",
	name: "PracticeName",
	address1: "Address1",
	address2: "Address2",
	address3: "Address3",
	postcode: "Postcode",
	lcg: "LCG",
} as const;

const DENTAL_COLUMNS = {
	address: "ADDRESS",
	postcode: "POSTCODE",
	phone: "TELEPHONE_NO",
	lgd: "LGD",
} as const;

/**
 * The key of a Northern Irish dental surgery: 10 hex digits of the SHA-256 of its address and
 * postcode, normalized (case, spaces and punctuation do not count). A surgery that moves gets
 * a new key and a new page, like a Salzburg doctor who changes names.
 */
export function niDentalKey(address: string, postcode: string): string {
	const normalized = `${address}|${postcode}`.toUpperCase().replace(/[^A-Z0-9|]/g, "");
	return createHash("sha256").update(normalized).digest("hex").slice(0, 10);
}

/** Parses the GP Practice Reference File. Throws when a column is missing. */
export function parseBsoGp(data: Buffer | string): ParseResult {
	const result = emptyResult("bso-gp");
	const text = typeof data === "string" ? data : decodeText(data);
	let columns: Record<keyof typeof GP_COLUMNS, number> | null = null;
	const seen = new Set<string>();
	for (const { lineNo, fields } of csvRecords(text)) {
		if (columns === null) {
			columns = mapColumns("bso-gp", fields, GP_COLUMNS);
			continue;
		}
		const get = (key: keyof typeof GP_COLUMNS) => field(fields[columns?.[key] ?? -1]);
		if (fields.every((value) => value.trim() === "")) continue;
		result.lines++;
		const code = (get("code") ?? "").replace(/^0+(?=\d)/, "");
		if (!isValidGbSourceId("GB-BSO-GP", code)) {
			quarantine(result, lineNo, "invalid practice number", fields);
			continue;
		}
		if (seen.has(code)) {
			skip(result, "duplicate code");
			continue;
		}
		seen.add(code);
		const postcode = normalizeGbPostcode(get("postcode"));
		if (!postcode) {
			quarantine(result, lineNo, "invalid postcode", fields);
			continue;
		}
		const lines = [get("address1"), get("address2"), get("address3")].filter(
			(line): line is string => line !== null,
		);
		// The last line is the town or a street: both are tried to place the practice, and the
		// commissioning group names Belfast for the city's practices.
		const town = lines.length > 1 ? (lines.at(-1) ?? null) : null;
		const { name, minimised } = practiceDisplayName(get("name"), lines, town);
		// The street: the lines that are neither the town nor the name shown.
		const streetLines = lines.filter(
			(line) => !namesAPerson(line) && !(isPremisesName(line) && titleCaseGb(line) === name),
		);
		if (minimised) result.minimised++;
		const lcg = get("lcg");
		result.rows.push({
			source: "gb-bso-gp",
			lineNo,
			idScheme: "GB-BSO-GP",
			nationalId: code,
			professionCode: GB_GP_PRACTICE,
			name,
			minimised,
			siteKey: code,
			siteName: null,
			street: streetLines.length > 0 ? streetLines.map(titleCaseGb).join(", ") : null,
			town: town ? titleCaseGb(town) : null,
			// Every part of every line, last first (`Conlig, Newtownards`, `Newcastle, Co Down`).
			localities: [
				...lines
					.filter((line) => !namesAPerson(line))
					.reverse()
					.flatMap((line) => line.split(",").reverse())
					.map((part) => part.trim())
					.filter(
						(part) => part && !/^co\.?\s/i.test(part) && part.toUpperCase() !== town?.toUpperCase(),
					)
					.map(titleCaseGb),
				...(lcg?.toUpperCase() === "BELFAST" ? ["Belfast"] : []),
			],
			postcode,
			phone: null,
			ladCode: null,
			ladName: null,
			main: true,
		});
	}
	if (columns === null) throw new Error("bso-gp: empty file");
	return result;
}

/** Parses the Dental Surgery List. Throws when a column is missing. */
export function parseBsoDental(data: Buffer | string): ParseResult {
	const result = emptyResult("bso-dent");
	const text = typeof data === "string" ? data : decodeText(data);
	let columns: Record<keyof typeof DENTAL_COLUMNS, number> | null = null;
	const seen = new Set<string>();
	for (const { lineNo, fields } of csvRecords(text)) {
		if (columns === null) {
			columns = mapColumns("bso-dent", fields, DENTAL_COLUMNS);
			continue;
		}
		const get = (key: keyof typeof DENTAL_COLUMNS) => field(fields[columns?.[key] ?? -1]);
		if (fields.every((value) => value.trim() === "")) continue;
		result.lines++;
		const address = get("address");
		const postcode = normalizeGbPostcode(get("postcode"));
		if (!address) {
			quarantine(result, lineNo, "no address", []);
			continue;
		}
		if (!postcode) {
			quarantine(result, lineNo, "invalid postcode", []);
			continue;
		}
		if (SECURE_SETTING.test(address)) {
			skip(result, "secure setting (prison, removal centre)");
			continue;
		}
		const key = niDentalKey(address, postcode);
		if (seen.has(key)) {
			skip(result, "duplicate address");
			continue;
		}
		seen.add(key);
		const parts = address
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		const town = parts.length > 1 ? (parts.at(-1) ?? null) : null;
		const rest = town ? parts.slice(0, -1) : parts;
		const premises = rest[0] && isPremisesName(rest[0]) ? rest[0] : null;
		const streetLines = premises ? rest.slice(1) : rest;
		const { name, minimised } = practiceDisplayName(premises, streetLines, town);
		if (minimised) result.minimised++;
		result.rows.push({
			source: "gb-bso-dent",
			lineNo,
			idScheme: "GB-BSO-DENT",
			nationalId: key,
			professionCode: GB_DENTAL_PRACTICE,
			name,
			minimised,
			siteKey: key,
			siteName: null,
			street: streetLines.length > 0 ? streetLines.map(titleCaseGb).join(", ") : null,
			town: town ? titleCaseGb(town) : null,
			localities: streetLines.slice(1).reverse().map(titleCaseGb),
			postcode,
			phone: toE164Gb(get("phone")),
			ladCode: null,
			ladName: get("lgd") ? titleCaseGb(get("lgd")) : null,
			main: true,
		});
	}
	if (columns === null) throw new Error("bso-dent: empty file");
	return result;
}
