import { type SQL, sql } from "drizzle-orm";

/**
 * A `timestamptz` parameter for SQL written by hand. Drizzle's postgres-js driver only
 * serializes dates for typed columns, so raw templates pass ISO strings cast explicitly.
 */
export function at(value: Date | number | null): SQL {
	if (value === null) {
		return sql`null::timestamptz`;
	}
	const date = typeof value === "number" ? new Date(value) : value;
	return sql`${date.toISOString()}::timestamptz`;
}
