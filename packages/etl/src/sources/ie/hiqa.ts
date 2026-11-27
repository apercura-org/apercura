/**
 * HIQA's register of designated centres for older people (nursing homes), as its live CSV export
 * publishes it (UTF-8 with a byte-order mark, quoted fields with commas inside).
 *
 * Read: the centre's id (the key), its name, its address (`Saint Joseph's Avenue, Boyle, F52
 * AX24`: parts separated by commas, the Eircode one of them or missing, the town usually the part
 * before it), its county, its maximum occupancy, its phone, its page on HIQA's site, and the
 * registered provider's name and CRO number only to decide whether the provider is shown (the
 * HSE or a company; never a person, partners or an order's named members). A centre's
 * inspector's note is counted, never read further. Never read: the person in charge and their
 * phone, the management contacts, the provider's address and phone, the registration
 * conditions and dates.
 */
import { findEircode, IE_ID_SCHEMES, normalizeEircode, toE164Ie } from "@apercura/core";
import { ieCountyOfName } from "@apercura/core/country";
import { parseQuotedRecord } from "../../lib/text";
import {
	cleanText,
	facilityMatchKey,
	facilityNameIe,
	titleCaseIfUpper,
	townCandidates,
	trimPunctuation,
} from "./names";
import {
	count,
	emptyResult,
	IE_CAPACITY_SOURCE,
	IE_HIQA_PAGE_SOURCE,
	IE_OPERATOR_SOURCE,
	IE_SOURCES,
	type IeQualification,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** The columns read, by header name. */
const COLUMNS = [
	"Centre_ID",
	"Centre_Title",
	"Centre_Address",
	"County",
	"Maximum_Occupancy",
	"Centre_Phone",
	"Registration_Provider",
	"CRO_Registration_Number",
	"Chief_Inspector_Note",
	"URL",
] as const;

type Column = (typeof COLUMNS)[number];

/** The HSE as a provider names it. */
const HSE = /^health service executive$/i;

/** What a provider's name holds when it names people: partners, members, a trading name. */
const NAMES_PEOPLE = / with |trading as| as members| and /i;

/**
 * Who operates a centre, as a page may show it: the HSE (`hse`), or a company (`company`, its
 * name as published) when the provider has a CRO number and a name that names no person
 * ("A with B, C as members", "X and Y", "X trading as Y"); null for anyone else (an individual,
 * partners, an order or a trust with named members), who is never stored.
 */
export function hiqaOperator(provider: string, croNumber: string): IeQualification | null {
	const name = trimPunctuation(cleanText(provider));
	if (HSE.test(name)) {
		return { source: IE_OPERATOR_SOURCE, code: "hse", label: "Health Service Executive" };
	}
	if (cleanText(croNumber) && name && !NAMES_PEOPLE.test(` ${name} `)) {
		return { source: IE_OPERATOR_SOURCE, code: "company", label: name };
	}
	return null;
}

/** The slug of a centre's page on HIQA's site (`abbey-haven-care-centre-nursing-home`), or null. */
export function hiqaPageSlug(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(cleanText(raw));
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.hostname !== "www.hiqa.ie") return null;
	const match = /^\/areas-we-work\/find-a-centre\/([^/]+)\/?$/.exec(url.pathname);
	const slug = match?.[1] ?? "";
	return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/**
 * A centre's address in its parts, without its Eircode: `Saint Joseph's Avenue, Boyle, F52 AX24`
 * → parts `Saint Joseph's Avenue`, `Boyle` and the Eircode `F52 AX24`. A part that is only an
 * Eircode (`K67F5D0` too) is dropped; an Eircode at the end of a part is cut from it.
 */
export function splitHiqaAddress(raw: string): { parts: string[]; eircode: string | null } {
	let eircode: string | null = null;
	const parts: string[] = [];
	for (const piece of cleanText(raw).split(",")) {
		let part = trimPunctuation(piece);
		const found = findEircode(part);
		if (found) {
			eircode ??= found;
			const compact = found.replace(" ", "");
			part = trimPunctuation(
				part.replace(new RegExp(`\\b${found.slice(0, 3)}\\s?${found.slice(4)}\\b`, "i"), ""),
			);
			if (part.replace(/\s/g, "").toUpperCase() === compact) part = "";
		}
		if (part) parts.push(titleCaseIfUpper(part));
	}
	return { parts, eircode };
}

/** Records of a CSV text, joining physical lines inside quoted fields. */
export function* csvRecords(text: string): Generator<{ lineNo: number; fields: string[] }> {
	let pending: string | null = null;
	let start = 0;
	let lineNo = 0;
	for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
		lineNo++;
		const input: string = pending === null ? raw : `${pending}\n${raw}`;
		if (pending === null) start = lineNo;
		const fields = parseQuotedRecord(input, ",");
		if (fields === null) {
			pending = input;
			continue;
		}
		pending = null;
		if (input.trim() !== "") yield { lineNo: start, fields };
	}
	if (pending !== null) throw new Error(`a quoted field opened on line ${start} never closes`);
}

/** Reads the export. Throws when it is not the register (a missing column, no row). */
export function parseHiqa(text: string): ParseResult {
	const result = emptyResult("hiqa");
	const { pattern } = IE_ID_SCHEMES["IE-HIQA"];
	let index: Map<Column, number> | null = null;
	const seen = new Set<string>();
	for (const { lineNo, fields } of csvRecords(text)) {
		if (!index) {
			index = new Map();
			const missing: string[] = [];
			for (const column of COLUMNS) {
				const at = fields.findIndex((cell) => cleanText(cell) === column);
				if (at < 0) missing.push(column);
				else index.set(column, at);
			}
			if (missing.length > 0)
				throw new Error(`HIQA register: missing columns ${missing.join(", ")}`);
			continue;
		}
		const cell = (column: Column) => cleanText(fields[index?.get(column) ?? -1]);
		result.lines++;
		const id = cell("Centre_ID");
		if (!pattern.test(id)) {
			quarantine(result, lineNo, "invalid centre id", id);
			continue;
		}
		const name = facilityNameIe(cell("Centre_Title"));
		if (!name) {
			quarantine(result, lineNo, "no centre name", id);
			continue;
		}
		if (seen.has(id)) {
			skip(result, "repeated centre id");
			continue;
		}
		seen.add(id);
		if (cell("Chief_Inspector_Note")) count(result, "inspectorNotes");
		const { parts, eircode } = splitHiqaAddress(cell("Centre_Address"));
		if (!eircode) count(result, "noEircode");
		const countyCode = ieCountyOfName(cell("County"));
		if (!countyCode) count(result, "unknownCounty");
		const qualifications: IeQualification[] = [];
		const capacity = cell("Maximum_Occupancy");
		if (/^\d+$/.test(capacity) && Number(capacity) > 0) {
			qualifications.push({
				source: IE_CAPACITY_SOURCE,
				code: String(Number(capacity)),
				label: null,
			});
		} else {
			count(result, "noCapacity");
		}
		const operator = hiqaOperator(cell("Registration_Provider"), cell("CRO_Registration_Number"));
		if (operator) {
			qualifications.push(operator);
			count(result, operator.code === "hse" ? "operatorsHse" : "operatorsCompany");
		} else {
			count(result, "operatorsNotShown");
		}
		const page = hiqaPageSlug(cell("URL"));
		if (page) qualifications.push({ source: IE_HIQA_PAGE_SOURCE, code: page, label: null });
		else count(result, "noHiqaPage");
		const rawPhone = cell("Centre_Phone");
		const phone = toE164Ie(rawPhone);
		if (rawPhone && !phone) count(result, "invalidPhones");
		result.rows.push({
			source: "hiqa",
			lineNo,
			idScheme: "IE-HIQA",
			nationalId: id,
			professionCode: IE_SOURCES.hiqa.professionCode,
			name,
			qualifications,
			street: null,
			townColumn: null,
			addressParts: parts,
			eircode: normalizeEircode(eircode),
			countyCode,
			towns: [...parts].reverse().flatMap(townCandidates),
			latitude: null,
			longitude: null,
			phone,
			matchNames: [facilityMatchKey(name)].filter(Boolean),
			kind: null,
		});
	}
	if (!index) throw new Error("HIQA register: empty export");
	return result;
}
