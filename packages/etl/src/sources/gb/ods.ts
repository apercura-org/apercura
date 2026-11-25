/**
 * NHS England's Organisation Data Service (ODS) reports for England and Wales, from ODS Data
 * Search and Export (`https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=…`),
 * refreshed every night, published under the Open Government Licence:
 *
 * - `epraccur`: prescribing cost centres; GP practices are the active ones with the
 *   non-primary role RO76 (GP PRACTICE) in column 26;
 * - `ebranchs`: branch surgeries, with their parent practice's code in column 15;
 * - `egdpprac`: NHS dental practices;
 * - `edispensary`: pharmacies (primary role RO182) and appliance contractors (RO94, left out).
 *
 * Every report is a headerless CSV of 27 quoted columns (reference data catalogue,
 * "GP Practices (Prescribing Cost Centres)"): 1 code, 2 name, 5–7 address lines, 8 town,
 * 10 postcode, 12 close date, 13 status, 15 parent (branches), 18 telephone, 26 roles.
 */

import { type GbIdScheme, isValidGbSourceId, normalizeGbPostcode, toE164Gb } from "@apercura/core";
import { GB_DENTAL_PRACTICE, GB_GP_PRACTICE, GB_PHARMACY } from "@apercura/core/taxonomy";
import { namesAPerson, practiceDisplayName, titleCaseGb } from "./names";
import {
	CROWN_DEPENDENCY,
	csvRecords,
	decodeText,
	emptyResult,
	field,
	type GbSourceId,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** Column count of every ODS report. */
export const ODS_COLUMNS = 27;

const COL = {
	code: 0,
	name: 1,
	address1: 4,
	address2: 5,
	address3: 6,
	town: 7,
	postcode: 9,
	closeDate: 11,
	status: 12,
	primaryRole: 13,
	parent: 14,
	phone: 17,
	roles: 25,
} as const;

/**
 * Services inside prisons and immigration removal centres: listed by ODS, not open to the
 * public, so not on the directory.
 */
export const SECURE_SETTING = /\b(HMP|HMYOI|PRISON|IMMIGRATION REMOVAL|YOUNG OFFENDER)\b/i;

/** The role of a GP practice among the prescribing cost centres of `epraccur`. */
export const GP_PRACTICE_ROLE = "RO76";
/** The primary role of a pharmacy in `edispensary` (RO94 is an appliance contractor). */
export const PHARMACY_ROLE = "RO182";

type OdsList = {
	source: GbSourceId;
	siteSource: string;
	idScheme: GbIdScheme;
	professionCode: string;
	/** Why an active line of the report is not one of the list's practices, or null. */
	excluded(fields: readonly string[]): string | null;
};

const LISTS: Record<"ods-gp" | "ods-dent" | "ods-pharm", OdsList> = {
	"ods-gp": {
		source: "ods-gp",
		siteSource: "gb-ods-gp",
		idScheme: "GB-ODS-GP",
		professionCode: GB_GP_PRACTICE,
		excluded: (fields) =>
			(fields[COL.roles] ?? "").split("|").includes(GP_PRACTICE_ROLE)
				? null
				: "not a GP practice (other prescribing cost centre)",
	},
	"ods-dent": {
		source: "ods-dent",
		siteSource: "gb-ods-dent",
		idScheme: "GB-ODS-DENT",
		professionCode: GB_DENTAL_PRACTICE,
		excluded: () => null,
	},
	"ods-pharm": {
		source: "ods-pharm",
		siteSource: "gb-ods-pharm",
		idScheme: "GB-ODS-PHARM",
		professionCode: GB_PHARMACY,
		excluded: (fields) =>
			fields[COL.primaryRole] === PHARMACY_ROLE ? null : "not a pharmacy (appliance contractor)",
	},
};

/** Parses `epraccur`, `egdpprac` or `edispensary`: the active practices of the list. */
export function parseOdsPractices(
	source: "ods-gp" | "ods-dent" | "ods-pharm",
	data: Buffer | string,
): ParseResult {
	const list = LISTS[source];
	const result = emptyResult(source);
	const text = typeof data === "string" ? data : decodeText(data);
	for (const { lineNo, fields } of csvRecords(text)) {
		result.lines++;
		if (fields.length !== ODS_COLUMNS) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${ODS_COLUMNS}`, fields);
			continue;
		}
		if (fields[COL.status] !== "ACTIVE" || field(fields[COL.closeDate])) {
			skip(result, "not active");
			continue;
		}
		const excluded = list.excluded(fields);
		if (excluded) {
			skip(result, excluded);
			continue;
		}
		if (SECURE_SETTING.test(fields[COL.name] ?? "")) {
			skip(result, "secure setting (prison, removal centre)");
			continue;
		}
		const code = (fields[COL.code] ?? "").trim().toUpperCase();
		if (!isValidGbSourceId(list.idScheme, code)) {
			quarantine(result, lineNo, "invalid ODS code", fields);
			continue;
		}
		const postcode = normalizeGbPostcode(fields[COL.postcode]);
		if (!postcode) {
			quarantine(result, lineNo, "invalid postcode", fields);
			continue;
		}
		if (CROWN_DEPENDENCY.test(postcode)) {
			skip(result, "outside the UK (Crown Dependencies)");
			continue;
		}
		const lines = [fields[COL.address1], fields[COL.address2], fields[COL.address3]]
			.map(field)
			.filter((line): line is string => line !== null);
		const town = field(fields[COL.town]);
		const { name, minimised } = practiceDisplayName(fields[COL.name], lines, town);
		if (minimised) result.minimised++;
		result.rows.push({
			source: list.siteSource,
			lineNo,
			idScheme: list.idScheme,
			nationalId: code,
			professionCode: list.professionCode,
			name,
			minimised,
			siteKey: code,
			siteName: null,
			street: lines.length > 0 ? lines.map(titleCaseGb).join(", ") : null,
			town: town ? titleCaseGb(town) : null,
			localities: lines.slice(1).map(titleCaseGb),
			postcode,
			phone: toE164Gb(fields[COL.phone]),
			ladCode: null,
			ladName: null,
			main: true,
		});
	}
	return result;
}

/**
 * Parses `ebranchs`: the open branch surgeries, as extra sites of their parent GP practice
 * (the merge keeps those whose parent is an imported practice). A branch is a place of the
 * practice, not a practice of its own: it has no page.
 */
export function parseOdsBranches(data: Buffer | string): ParseResult {
	const result = emptyResult("ods-branches");
	const text = typeof data === "string" ? data : decodeText(data);
	for (const { lineNo, fields } of csvRecords(text)) {
		result.lines++;
		if (fields.length !== ODS_COLUMNS) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${ODS_COLUMNS}`, fields);
			continue;
		}
		const code = (fields[COL.code] ?? "").trim().toUpperCase();
		const parent = (fields[COL.parent] ?? "").trim().toUpperCase();
		if (!/^[A-Z0-9]{5,10}$/.test(code)) {
			quarantine(result, lineNo, "invalid branch code", fields);
			continue;
		}
		if (field(fields[COL.closeDate])) {
			skip(result, "closed");
			continue;
		}
		if (SECURE_SETTING.test(fields[COL.name] ?? "")) {
			skip(result, "secure setting (prison, removal centre)");
			continue;
		}
		if (!isValidGbSourceId("GB-ODS-GP", parent)) {
			skip(result, "parent is not a GP practice");
			continue;
		}
		const postcode = normalizeGbPostcode(fields[COL.postcode]);
		if (!postcode) {
			quarantine(result, lineNo, "invalid postcode", fields);
			continue;
		}
		if (CROWN_DEPENDENCY.test(postcode)) {
			skip(result, "outside the UK (Crown Dependencies)");
			continue;
		}
		const lines = [fields[COL.address1], fields[COL.address2], fields[COL.address3]]
			.map(field)
			.filter((line): line is string => line !== null);
		const town = field(fields[COL.town]);
		const published = field(fields[COL.name]);
		result.rows.push({
			source: "gb-ods-branch",
			lineNo,
			idScheme: "GB-ODS-GP",
			nationalId: parent,
			professionCode: GB_GP_PRACTICE,
			name: "",
			minimised: false,
			siteKey: code,
			siteName: published && !namesAPerson(published) ? titleCaseGb(published) : null,
			street: lines.length > 0 ? lines.map(titleCaseGb).join(", ") : null,
			town: town ? titleCaseGb(town) : null,
			localities: lines.slice(1).map(titleCaseGb),
			postcode,
			phone: toE164Gb(fields[COL.phone]),
			ladCode: null,
			ladName: null,
			main: false,
		});
	}
	return result;
}
