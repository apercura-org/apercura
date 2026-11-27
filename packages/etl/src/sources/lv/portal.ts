/**
 * Where each Latvian list's current file is: its dataset on the national open data portal
 * (data.gov.lv, CKAN), read with `package_show`. The NVD adds a resource every quarter
 * (`2026_03 Ģimenes ārsta praksē reģistrēto pacientu skaits`): the newest quarter's is read. The
 * Ministry of the Interior's list has one CSV, the State Agency of Medicines' register its daily
 * export (`fdu_register.csv`, served by dati.zva.gov.lv). Each dataset must still be under CC0
 * 1.0, so a changed licence stops the list before anything is imported.
 */
import { fetchJson } from "../../lib/files";
import { nvdEditionOf } from "./nvd";
import { LV_DATASETS, type LvFileId } from "./types";

/** The portal (`ETL_LV_PORTAL_URL`). */
export const DEFAULT_LV_PORTAL_URL = "https://data.gov.lv/dati";

/** The licence every list's dataset must carry (CKAN's id). */
export const LV_LICENCE_ID = "CC0-1.0";

export type CkanResource = {
	name?: string | null;
	url?: string | null;
	format?: string | null;
	created?: string | null;
	last_modified?: string | null;
};

export type CkanPackage = {
	success?: boolean;
	result?: { license_id?: string | null; resources?: CkanResource[] | null };
};

export type ResolvedFile = { url: string; edition: number | null; licence: string };

/**
 * The current file of a list in its dataset: the NVD's newest quarter (by the quarter its name
 * says, then by creation), the Ministry's CSV, the register's CSV export. Throws when the dataset
 * is not under CC0 1.0 or names no such file.
 */
export function currentResource(file: LvFileId, body: CkanPackage): ResolvedFile {
	const licence = body.result?.license_id ?? "";
	if (licence !== LV_LICENCE_ID) {
		throw new Error(`${LV_DATASETS[file]} is not under CC0 1.0 (${licence || "no licence"})`);
	}
	const resources = (body.result?.resources ?? []).filter((resource) => resource.url);
	const format = (resource: CkanResource) => (resource.format ?? "").toLowerCase();
	let chosen: CkanResource | undefined;
	let edition: number | null = null;
	if (file === "nvd") {
		const ranked = resources
			.filter((resource) => format(resource) === "xlsx" || /\.xlsx$/i.test(resource.url ?? ""))
			.map((resource) => ({ resource, edition: nvdEditionOf(resource.name ?? "") }))
			.filter((item) => item.edition !== null)
			.sort(
				(a, b) =>
					(b.edition ?? 0) - (a.edition ?? 0) ||
					(b.resource.created ?? "").localeCompare(a.resource.created ?? ""),
			);
		chosen = ranked[0]?.resource;
		edition = ranked[0]?.edition ?? null;
	} else if (file === "zva") {
		chosen = resources.find((resource) => /fdu_register\.csv$/i.test(resource.url ?? ""));
	} else {
		chosen = resources.find(
			(resource) => format(resource) === "csv" || /\.csv$/i.test(resource.url ?? ""),
		);
	}
	if (!chosen?.url) throw new Error(`${LV_DATASETS[file]} names no file to read`);
	return { url: chosen.url, edition, licence };
}

/** Reads a list's dataset and returns its current file. */
export async function resolveLvFile(file: LvFileId, portalUrl: string): Promise<ResolvedFile> {
	const body = await fetchJson<CkanPackage>(
		`${portalUrl.replace(/\/+$/, "")}/api/3/action/package_show?id=${LV_DATASETS[file]}`,
	);
	return currentResource(file, body);
}
