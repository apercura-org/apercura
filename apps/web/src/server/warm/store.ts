/**
 * The warm-up's database side: its cursor (`directory.cache_warmup`, one row, migration 0021),
 * the last successful import and the sitemap queries. Runs with the app role (DATABASE_URL),
 * under the `jobs:warm` advisory lock, so a single run writes the row at a time.
 */
import type { Sql } from "@apercura/db";
import {
	type SitemapChunk,
	type SitemapKind,
	type SitemapMarket,
	selectSitemapChunks,
	selectSitemapEntries,
} from "~/server/queries/sitemap-sql";

export type CursorRow = {
	generation: string;
	unit: string | null;
	position: number;
	warmed: number;
	errors: number;
	/** Timestamps as PostgreSQL prints them: compared back as they are, to the microsecond. */
	startedAt: string | null;
	completedAt: string | null;
	restartRequestedAt: string | null;
};

export type WarmStore = {
	read(): Promise<CursorRow>;
	/**
	 * Starts the walk over for `generation`. Clears the import's restart request only if it is
	 * still the one read (`seen`): a request made since then is kept for the next run.
	 */
	restart(generation: string, seen: string | null): Promise<CursorRow>;
	/** Records the offset reached in `unit` and adds this run's counts. */
	save(progress: {
		unit: string | null;
		position: number;
		warmed: number;
		errors: number;
		completed: boolean;
	}): Promise<void>;
	lastImportRun(): Promise<number | null>;
	chunks(): Promise<SitemapChunk[]>;
	entries(market: SitemapMarket, kind: SitemapKind, chunk: number): Promise<string[]>;
};

const COLUMNS = (sql: Sql) => sql`
	generation, unit, position, warmed::float8 AS warmed, errors::float8 AS errors,
	started_at::text AS "startedAt", completed_at::text AS "completedAt",
	restart_requested_at::text AS "restartRequestedAt"
`;

export function sqlWarmStore(sql: Sql): WarmStore {
	return {
		async read() {
			const [row] = await sql<CursorRow[]>`
				SELECT ${COLUMNS(sql)} FROM directory.cache_warmup WHERE id = 1
			`;
			if (row) return row;
			// Seeded by the migration; recreated if someone deleted it.
			const [created] = await sql<CursorRow[]>`
				INSERT INTO directory.cache_warmup (id) VALUES (1)
				ON CONFLICT (id) DO UPDATE SET updated_at = now()
				RETURNING ${COLUMNS(sql)}
			`;
			if (!created) throw new Error("directory.cache_warmup: no row");
			return created;
		},
		async restart(generation, seen) {
			const [row] = await sql<CursorRow[]>`
				UPDATE directory.cache_warmup SET
					generation = ${generation}, unit = NULL, position = 0, warmed = 0, errors = 0,
					started_at = now(), completed_at = NULL, updated_at = now(),
					restart_requested_at = CASE
						WHEN restart_requested_at IS NOT DISTINCT FROM ${seen}::timestamptz THEN NULL
						ELSE restart_requested_at
					END
				WHERE id = 1
				RETURNING ${COLUMNS(sql)}
			`;
			if (!row) throw new Error("directory.cache_warmup: no row");
			return row;
		},
		async save(progress) {
			await sql`
				UPDATE directory.cache_warmup SET
					unit = ${progress.unit}, position = ${progress.position},
					warmed = warmed + ${progress.warmed}, errors = errors + ${progress.errors},
					completed_at = ${progress.completed ? sql`now()` : sql`NULL`},
					updated_at = now()
				WHERE id = 1
			`;
		},
		async lastImportRun() {
			const [row] = await sql<{ id: number | null }[]>`
				SELECT max(id) AS id FROM directory.etl_runs WHERE status = 'succeeded'
			`;
			return row?.id ?? null;
		},
		chunks: () => selectSitemapChunks(sql),
		async entries(market, kind, chunk) {
			const rows = await selectSitemapEntries(sql, market, kind, chunk);
			return rows.map((row) => row.path);
		},
	};
}

/**
 * The app's build id (`.next/BUILD_ID`), read from the image the job runs in (the scheduler
 * shares the app's image, so it is the deployed build), or from a local build. Null when none
 * is found: only imports restart the walk then.
 */
export async function readBuildId(
	candidates: readonly string[] = [
		"/app/apps/web/.next/BUILD_ID",
		`${process.cwd()}/.next/BUILD_ID`,
		`${process.cwd()}/apps/web/.next/BUILD_ID`,
	],
): Promise<string | null> {
	const { readFile } = await import("node:fs/promises");
	for (const path of candidates) {
		try {
			const id = (await readFile(path, "utf8")).trim();
			if (id) return id;
		} catch {
			// Next candidate.
		}
	}
	return null;
}
