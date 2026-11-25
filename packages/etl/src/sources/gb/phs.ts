/**
 * Public Health Scotland's open data (opendata.nhs.scot, Open Government Licence), one CSV
 * with a header line per list:
 *
 * - GP Practice Contact Details and List Sizes (quarterly): `PracticeCode`, `GPPracticeName`,
 *   `AddressLine1`–`AddressLine4`, `Postcode`, `TelephoneNumber`;
 * - Dental Practices and Patient Registrations (quarterly): `Dental_Practice_Code`,
 *   `address1` (the practice's name), `address2`, `address3` (`LOCALITY, TOWN`), `pc7`, and
 *   `CA`, the council area (an ONS local authority code);
 * - Dispenser Location Contact Details (monthly): `DispCode`, `DispLocationName`,
 *   `DispLocationAddress1`–`4` (`NA` when empty), `DispLocationPostcode`, `DispLocationTelNo`.
 *
 * Each dataset publishes a new file per period: the import reads the latest resource of the
 * dataset (CKAN API, `latestResourceUrl`).
 */
import { type GbIdScheme, isValidGbSourceId, normalizeGbPostcode, toE164Gb } from "@apercura/core";
import { GB_DENTAL_PRACTICE, GB_GP_PRACTICE, GB_PHARMACY } from "@apercura/core/taxonomy";
import { mapColumns } from "../../lib/text";
import { practiceDisplayName, titleCaseGb } from "./names";
import { SECURE_SETTING } from "./ods";
import {
	CROWN_DEPENDENCY,
	csvRecords,
	decodeText,
	emptyResult,
	field,
	type GbPractice,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

type PhsSource = "phs-gp" | "phs-dent" | "phs-pharm";

const COLUMNS = {
	"phs-gp": {
		code: "PracticeCode",
		name: "GPPracticeName",
		address1: "AddressLine1",
		address2: "AddressLine2",
		address3: "AddressLine3",
		address4: "AddressLine4",
		postcode: "Postcode",
		phone: "TelephoneNumber",
	},
	"phs-dent": {
		code: "Dental_Practice_Code",
		name: "address1",
		address2: "address2",
		address3: "address3",
		postcode: "pc7",
		council: "CA",
	},
	"phs-pharm": {
		code: "DispCode",
		name: "DispLocationName",
		address1: "DispLocationAddress1",
		address2: "DispLocationAddress2",
		address3: "DispLocationAddress3",
		address4: "DispLocationAddress4",
		postcode: "DispLocationPostcode",
		phone: "DispLocationTelNo",
	},
} as const;

const LISTS: Record<
	PhsSource,
	{ siteSource: string; idScheme: GbIdScheme; professionCode: string }
> = {
	"phs-gp": { siteSource: "gb-phs-gp", idScheme: "GB-PHS-GP", professionCode: GB_GP_PRACTICE },
	"phs-dent": {
		siteSource: "gb-phs-dent",
		idScheme: "GB-PHS-DENT",
		professionCode: GB_DENTAL_PRACTICE,
	},
	"phs-pharm": {
		siteSource: "gb-phs-pharm",
		idScheme: "GB-PHS-PHARM",
		professionCode: GB_PHARMACY,
	},
};

const sameText = (a: string, b: string) =>
	a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parses one of Public Health Scotland's three lists. Throws when a column is missing. */
export function parsePhs(source: PhsSource, data: Buffer | string): ParseResult {
	const list = LISTS[source];
	const result = emptyResult(source);
	const text = typeof data === "string" ? data : decodeText(data);
	let columns: Record<string, number> | null = null;
	const seen = new Set<string>();
	for (const { lineNo, fields } of csvRecords(text)) {
		if (columns === null) {
			columns = mapColumns(source, fields, COLUMNS[source] as Record<string, string>);
			continue;
		}
		result.lines++;
		const get = (key: string) => {
			const index = columns?.[key];
			return index === undefined ? null : field(fields[index]);
		};
		const code = (get("code") ?? "").replace(/^0+(?=\d)/, "");
		if (!isValidGbSourceId(list.idScheme, code)) {
			quarantine(result, lineNo, "invalid practice code", fields);
			continue;
		}
		if (seen.has(code)) {
			skip(result, "duplicate code");
			continue;
		}
		seen.add(code);
		const published = get("name");
		if (SECURE_SETTING.test(published ?? "")) {
			skip(result, "secure setting (prison, removal centre)");
			continue;
		}
		const postcode = normalizeGbPostcode(get("postcode"));
		if (!postcode) {
			quarantine(result, lineNo, "invalid postcode", fields);
			continue;
		}
		if (CROWN_DEPENDENCY.test(postcode)) {
			skip(result, "outside the UK (Crown Dependencies)");
			continue;
		}
		let lines: string[];
		let town: string | null;
		let localities: string[];
		if (source === "phs-dent") {
			// address3 reads `LOCALITY, TOWN` or `TOWN`.
			const parts = (get("address3") ?? "")
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean);
			town = parts.at(-1) ?? null;
			localities = parts.slice(0, -1);
			lines = [get("address2")].filter((line): line is string => line !== null);
		} else {
			const all = ["address1", "address2", "address3", "address4"]
				.map(get)
				.filter((line): line is string => line !== null)
				// The first line often repeats the practice's name.
				.filter((line) => !(published && sameText(line, published)));
			town = all.length > 1 ? (all.at(-1) ?? null) : null;
			lines = town ? all.slice(0, -1) : all;
			localities = lines.slice(1);
		}
		const { name, minimised } = practiceDisplayName(published, lines, town);
		if (minimised) result.minimised++;
		const council = source === "phs-dent" ? get("council") : null;
		const row: GbPractice = {
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
			localities: localities.map(titleCaseGb),
			postcode,
			phone: toE164Gb(get("phone")),
			ladCode: council && /^S12\d{6}$/.test(council) ? council : null,
			ladName: null,
			main: true,
		};
		result.rows.push(row);
	}
	if (columns === null) throw new Error(`${source}: empty file`);
	return result;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The period a resource's name gives (`Dental Practices March 2026`, `GP Practice Reference
 * File - July 2026`, `… as at 30th September 2026`), as a month number (`2026 * 12 + 2`), or
 * null. The portals upload several periods on the same day, so their creation dates do not
 * order the files.
 */
export function periodOfName(name: string): number | null {
	const match =
		/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(20\d{2})\b/i.exec(
			name,
		) ?? null;
	if (!match) return null;
	return Number(match[2]) * 12 + MONTHS.indexOf((match[1] ?? "").toLowerCase());
}

/**
 * The download URL of the latest CSV resource of a dataset of a CKAN portal
 * (opendata.nhs.scot, OpenDataNI), from its `package_show` answer: among the CSV resources
 * whose name matches `pattern`, the one of the latest period its name gives, then the most
 * recently created.
 */
export function latestResourceUrl(
	packageShow: unknown,
	pattern: RegExp = /./,
): { url: string; name: string; created: string } {
	const resources = (
		(packageShow as { result?: { resources?: unknown[] } })?.result?.resources ?? []
	).filter(
		(resource): resource is { url: string; name: string; created: string; format: string } => {
			const r = resource as Record<string, unknown>;
			return (
				typeof r.url === "string" &&
				typeof r.name === "string" &&
				typeof r.created === "string" &&
				String(r.format ?? "").toUpperCase() === "CSV" &&
				pattern.test(r.name)
			);
		},
	);
	const latest = resources.sort(
		(a, b) =>
			(periodOfName(b.name) ?? -1) - (periodOfName(a.name) ?? -1) ||
			(a.created < b.created ? 1 : a.created > b.created ? -1 : 0),
	)[0];
	if (!latest) throw new Error("no CSV resource in the dataset");
	return { url: latest.url, name: latest.name, created: latest.created };
}
