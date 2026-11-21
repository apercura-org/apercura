import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DatabaseOptions = {
	/** Connection string. Defaults to `process.env.DATABASE_URL`. */
	url?: string;
	/** Maximum number of pooled connections. */
	max?: number;
};

/** Creates a Drizzle client backed by a postgres.js pool. */
export function createDb(options: DatabaseOptions = {}) {
	const url = options.url ?? process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is not set");
	}
	const client = postgres(url, { max: options.max ?? 10 });
	const db = drizzle({ client, schema, casing: "snake_case" });
	return Object.assign(db, { close: () => client.end() });
}

export type Database = ReturnType<typeof createDb>;
