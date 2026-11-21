import "server-only";

import { cacheLife, cacheTag } from "next/cache";
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
			WHERE source = 'fr' AND status = 'succeeded' AND finished_at IS NOT NULL
			ORDER BY id DESC LIMIT 1
		) ok
		LEFT JOIN LATERAL (
			SELECT finished_at FROM directory.etl_runs
			WHERE source = 'fr' AND status IN ('succeeded', 'skipped') AND finished_at IS NOT NULL
			ORDER BY id DESC LIMIT 1
		) checked ON true
	`;
	if (!row) return null;
	const files: RegistryStatus["files"] = {};
	for (const key of REGISTRY_FILES) {
		const date = isoDate(row.files?.[key]?.lastModified);
		if (date) files[key] = date;
	}
	return { importedAt: row.importedAt, checkedAt: row.checkedAt, files };
}
