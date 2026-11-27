import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
	countedProfessions,
	type FigureRow,
	type RegistryFigures,
	shapeRegistryFigures,
} from "~/lib/registry-figures";
import { cacheTags } from "../cache-tags";
import { getSql, hasDatabaseUrl } from "../db";

/** Files of an import run, keyed as in `directory.etl_runs.files`. */
export const REGISTRY_FILES = [
	"personneActivite",
	"savoirFaire",
	"diplomes",
	"finess",
	"ameli",
] as const;

export type RegistryFile = (typeof REGISTRY_FILES)[number];

export type RegistryStatus = {
	/** Date (YYYY-MM-DD, UTC) of the last import that changed or confirmed the directory. */
	importedAt: string;
	/** Date of the last check of the sources (an unchanged run is skipped). */
	checkedAt: string;
	/** Publication date of each source file used by the last import, when known. */
	files: Partial<Record<RegistryFile, string>>;
};

type RunRow = {
	importedAt: string;
	checkedAt: string;
	files: Record<string, { lastModified?: string | null } | null> | null;
};

/** `Last-Modified` header (HTTP date) to an ISO date, or null when unreadable. */
function isoDate(httpDate: string | null | undefined): string | null {
	if (!httpDate) return null;
	const date = new Date(httpDate);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * When the directory was last imported from the open data sources, and the
 * publication date of each source file. Null before the first import, or in a
 * build without a database (then cached for minutes only).
 */
export async function getRegistryStatus(): Promise<RegistryStatus | null> {
	const status = await getImportStatus("fr");
	if (!status) return null;
	const files: RegistryStatus["files"] = {};
	for (const key of REGISTRY_FILES) {
		const date = status.files[key];
		if (date) files[key] = date;
	}
	return { ...status, files };
}

/** An import's status: dates of the last import and check, and of every file it read. */
export type ImportStatus = Omit<RegistryStatus, "files"> & { files: Record<string, string> };

/**
 * The status of one market's import (`directory.etl_runs.source`: `fr`, `at`, `gb`, `cz`, `es`, `it`, `de`, `ch`, `ee`, `pl`, `no`): when it last
 * imported, when it last checked the sources, and the publication date of every file of its last
 * import (`Last-Modified`), whatever their keys. Null before the first import.
 */
export async function getImportStatus(
	source: "fr" | "at" | "gb" | "cz" | "es" | "it" | "de" | "ch" | "ee" | "pl" | "no",
): Promise<ImportStatus | null> {
	"use cache";
	cacheTag("registry");
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return null;
	}
	cacheLife("hours");
	const [row] = await getSql()<RunRow[]>`
		SELECT
			to_char(ok.finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "importedAt",
			to_char(coalesce(checked.finished_at, ok.finished_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
				AS "checkedAt",
			ok.files
		FROM (
			SELECT finished_at, files FROM directory.etl_runs
			WHERE source = ${source} AND status = 'succeeded' AND finished_at IS NOT NULL
			ORDER BY id DESC LIMIT 1
		) ok
		LEFT JOIN LATERAL (
			SELECT finished_at FROM directory.etl_runs
			WHERE source = ${source} AND status IN ('succeeded', 'skipped') AND finished_at IS NOT NULL
			ORDER BY id DESC LIMIT 1
		) checked ON true
	`;
	if (!row) return null;
	const files: Record<string, string> = {};
	for (const [key, file] of Object.entries(row.files ?? {})) {
		const date = isoDate(file?.lastModified);
		if (date) files[key] = date;
	}
	return { importedAt: row.importedAt, checkedAt: row.checkedAt, files };
}

/**
 * The home page's register figures, live from the directory: per enabled profession, the
 * practitioners with an indexable page; how many of them have a street address for a practice
 * they show; and the date of the last successful import. Null on an empty directory or
 * without a database (the home page then leaves the block out).
 *
 * Cached for days and tagged like the sitemaps: the import sends `sitemap` with any change and
 * the app expires it at once, so the next visitor after an import reads the new figures. The
 * coarse practitioner tag covers a national import.
 */
export async function getRegistryFigures(): Promise<RegistryFigures | null> {
	"use cache";
	cacheTag("registry", cacheTags.sitemap, cacheTags.coarse.practitioner);
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return null;
	}
	cacheLife("days");
	const sql = getSql();
	const [rows, status] = await Promise.all([
		sql<FigureRow[]>`
			SELECT
				p.profession_code AS "professionCode",
				count(*)::int AS practitioners,
				count(*) FILTER (WHERE EXISTS (
					SELECT 1 FROM directory.activities a
					JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
					WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND NOT a.hidden
						AND a.practice_kind IN ('office', 'health_center', 'hospital')
						AND nullif(btrim(s.address_line), '') IS NOT NULL
				))::int AS "withAddress"
			FROM directory.practitioners p
			WHERE p.indexable AND p.profession_code = ANY(${countedProfessions()}::text[])
			GROUP BY p.profession_code
		`,
		getRegistryStatus(),
	]);
	return shapeRegistryFigures(rows, status?.importedAt ?? null);
}
