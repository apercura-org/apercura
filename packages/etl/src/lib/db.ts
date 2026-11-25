import { IMPORT_LOCK_KEY } from "@apercura/core";
import postgres from "postgres";

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

/** Connection pool of the import. A few connections: one holds the advisory lock. */
export function connect(url: string): Sql {
	return postgres(url, {
		max: 4,
		onnotice: () => {},
		connection: { application_name: "apercura-etl" },
	});
}

/** Advisory lock key shared by every import run ("apercura-etl"), and tried by the app. */
export const ETL_LOCK_KEY = IMPORT_LOCK_KEY;

/**
 * Takes the import's session advisory lock on a reserved connection, so two
 * imports never run at the same time. Returns a release function, or null when
 * another import holds the lock.
 */
export async function acquireImportLock(sql: Sql): Promise<(() => Promise<void>) | null> {
	const reserved = await sql.reserve();
	const [row] = await reserved<{ locked: boolean }[]>`
		SELECT pg_try_advisory_lock(${ETL_LOCK_KEY}) AS locked
	`;
	if (!row?.locked) {
		reserved.release();
		return null;
	}
	return async () => {
		try {
			await reserved`SELECT pg_advisory_unlock(${ETL_LOCK_KEY})`;
		} finally {
			reserved.release();
		}
	};
}
