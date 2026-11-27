/**
 * Latvia's GP practices and hospitals, from the National Health Service's list of GPs and the
 * Ministry of the Interior's list of medical institutions' addresses.
 *
 * A GP practice is a medical institution of the NVD's list (its code), named as the NVD names
 * it, with its GPs (first and last names, `gimenes_arsts` qualifications) and its sites: the
 * Ministry's lines of the same institution code that are GP practices, else, for an institution
 * whose GPs work at a hospital or clinic of the list, that institution's lines. An institution the
 * Ministry's list has no address for is not listed (counted in `skipped.noAddress`): a page
 * without a place would be found by nobody, and nothing else open gives the address.
 *
 * A hospital is a line of the Ministry's list that is not a GP practice (a hospital, one of its
 * branches, or a line without a kind: a children's or psychiatric hospital, a maternity home), one
 * page per line, keyed by the list's id. Places that are not open to patients are left out: the
 * prison hospital, the forensic medicine and pathology centres.
 */
import { LV_GP_PRACTICE, LV_HOSPITAL } from "@apercura/core/taxonomy";
import { clean, institutionName, personName } from "./names";
import type { NvdList } from "./nvd";
import {
	emptyResult,
	LV_QUALIFICATION_SOURCES,
	type LvSiteRow,
	type ParseResult,
	quarantine,
	skip,
} from "./types";
import type { VkcpAddress, VkcpList } from "./vkcp";

/** Lines of the Ministry's list that are not open to patients. */
const NOT_OPEN_TO_PATIENTS = /cietum|tiesu medicīn|ekspertīz|patoloģijas centrs/iu;

const siteOf = (address: VkcpAddress, name: string | null): LvSiteRow => ({
	key: address.id,
	name,
	street: address.street,
	locality: address.locality,
	postcode: null,
	point: address.point,
	phone: null,
});

/** The GP practices of the NVD's list that the Ministry's list gives an address. */
export function buildGpPractices(
	nvd: NvdList,
	vkcp: VkcpList,
	edition: number | null,
): ParseResult {
	const result = emptyResult("gp");
	result.lines = nvd.lines;
	result.edition = edition;
	for (const line of nvd.quarantined) quarantine(result, line.lineNo, line.reason, line.sample);
	for (const [reason, count] of Object.entries(nvd.skipped)) skip(result, reason, count);
	const byCode = new Map<string, VkcpAddress[]>();
	for (const address of vkcp.addresses) {
		if (!address.code) continue;
		const list = byCode.get(address.code) ?? [];
		list.push(address);
		byCode.set(address.code, list);
	}
	const institutions = new Map<string, NvdList["gps"]>();
	for (const gp of nvd.gps) {
		const list = institutions.get(gp.code) ?? [];
		list.push(gp);
		institutions.set(gp.code, list);
	}
	for (const [code, gps] of institutions) {
		const lines = byCode.get(code) ?? [];
		const practices = lines.filter((line) => line.kind === "gp");
		const addresses = (practices.length > 0 ? practices : lines).filter(
			(line) => !NOT_OPEN_TO_PATIENTS.test(line.name),
		);
		if (addresses.length === 0) {
			skip(result, "noAddress");
			skip(result, "noAddressGps", gps.length);
			continue;
		}
		const first = gps[0];
		if (!first) continue;
		// One site per address: the list may give the same address twice (two branches at one door).
		const sites = new Map<string, LvSiteRow>();
		for (const address of addresses) {
			const key = clean(`${address.street ?? ""}|${address.locality}`).toLocaleLowerCase("lv");
			if (!sites.has(key)) sites.set(key, siteOf(address, null));
		}
		const names = [...new Set(gps.map((gp) => personName(gp.firstName, gp.lastName)))].sort(
			(a, b) => a.localeCompare(b, "lv"),
		);
		result.counters.gps += names.length;
		result.rows.push({
			source: "gp",
			lineNo: first.lineNo,
			nationalId: code,
			professionCode: LV_GP_PRACTICE,
			name: institutionName(first.institution),
			sites: [...sites.values()],
			qualifications: names.map((name, index) => ({
				source: LV_QUALIFICATION_SOURCES.gp,
				code: String(index + 1).padStart(2, "0"),
				label: name,
			})),
		});
	}
	return result;
}

/** The hospitals of the Ministry's list: every line that is not a GP practice, one page each. */
export function buildHospitals(vkcp: VkcpList): ParseResult {
	const result = emptyResult("hospitals");
	for (const line of vkcp.quarantined) quarantine(result, line.lineNo, line.reason, line.sample);
	for (const address of vkcp.addresses) {
		if (address.kind === "gp") continue;
		result.lines++;
		if (NOT_OPEN_TO_PATIENTS.test(address.name)) {
			skip(result, "notOpenToPatients");
			continue;
		}
		result.rows.push({
			source: "hospitals",
			lineNo: address.lineNo,
			nationalId: address.id,
			professionCode: LV_HOSPITAL,
			name: institutionName(address.name),
			sites: [siteOf(address, null)],
			qualifications: [],
		});
	}
	return result;
}
