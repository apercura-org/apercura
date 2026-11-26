/**
 * Where today's file of a list is: the Ministry of Health's portal (dati.salute.gov.it) renames
 * the pharmacies' and parapharmacies' files every day (`FRM_FARMA_5_20261126.csv`) and publishes
 * the hospital bed counts as one dataset per year (`posti-letto-struttura-ospedaliera-2023`).
 * Each dataset page has a JSON twin (`/page-data/it/dataset/<slug>/page-data.json`, the site is
 * a Gatsby build) that names the current CSV file.
 */
import { IT_HOSPITAL_BEDS_YEAR } from "@apercura/core/country";
import { fetchJson } from "../../lib/files";
import { IT_SOURCES, type ItSourceId } from "./types";

type PageData = {
	result?: {
		data?: {
			allNodeDataset?: {
				nodes?: {
					field_licenza?: string | null;
					relationships?: { field_listafile?: { filename?: string; url?: string }[] | null };
				}[];
			};
		};
	};
};

/** The CSV file a dataset page names, as an absolute URL, or null. */
export function csvUrlOfPage(page: PageData, portalUrl: string): string | null {
	const node = page.result?.data?.allNodeDataset?.nodes?.[0];
	const files = node?.relationships?.field_listafile ?? [];
	const csv = files.find((file) => /\.csv$/i.test(file.filename ?? file.url ?? ""));
	if (!csv?.url) return null;
	return new URL(csv.url, portalUrl).toString();
}

/** The licence a dataset page names (`Italian Open Data Licence v2.0`), or null. */
export function licenceOfPage(page: PageData): string | null {
	return page.result?.data?.allNodeDataset?.nodes?.[0]?.field_licenza ?? null;
}

/**
 * The dataset slugs to try for a list, newest first: the hospital bed counts of the last years
 * down to the one in use (`IT_HOSPITAL_BEDS_YEAR`), so a new year's dataset is picked up.
 */
export function datasetSlugs(source: ItSourceId, now: Date = new Date()): string[] {
	const { dataset } = IT_SOURCES[source];
	if (source !== "posti-letto") return [dataset];
	const slugs: string[] = [];
	for (let year = now.getUTCFullYear() - 1; year >= IT_HOSPITAL_BEDS_YEAR; year--) {
		slugs.push(`${dataset}-${year}`);
	}
	return slugs.length > 0 ? slugs : [`${dataset}-${IT_HOSPITAL_BEDS_YEAR}`];
}

/**
 * The current file of a list, from its dataset page. Throws when no page names a CSV file under
 * the IODL 2.0, so a changed licence never goes unnoticed.
 */
export async function resolveItSourceUrl(
	source: ItSourceId,
	portalUrl: string,
	now: Date = new Date(),
): Promise<string> {
	const errors: string[] = [];
	for (const slug of datasetSlugs(source, now)) {
		const pageUrl = new URL(`/page-data/it/dataset/${slug}/page-data.json`, portalUrl).toString();
		let page: PageData;
		try {
			page = await fetchJson<PageData>(pageUrl, slug === datasetSlugs(source, now).at(-1) ? 3 : 1);
		} catch (error) {
			errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		const licence = licenceOfPage(page) ?? "";
		if (!/open data licen[cs]e v?2\.0|iodl\s*2\.0/i.test(licence)) {
			throw new Error(`${slug}: licence "${licence}" is not the IODL 2.0`);
		}
		const url = csvUrlOfPage(page, portalUrl);
		if (url) return url;
		errors.push(`${slug}: no CSV file`);
	}
	throw new Error(`no file found for ${source} (${errors.join("; ")})`);
}
