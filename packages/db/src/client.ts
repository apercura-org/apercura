import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DatabaseOptions = {
	/** Connection string. Defaults to `process.env.DATABASE_URL`. */
	url?: string;
	/** Maximum number of pooled connections. */
	max?: number;
	/** Seconds before an idle connection is closed (default: kept open). */
	idleTimeout?: number;
	/** Seconds to wait for a connection before failing. */
	connectTimeout?: number;
};

function connectionUrl(options: DatabaseOptions): string {
	const url = options.url ?? process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is not set");
	}
	return url;
}

/** Creates a postgres.js pool, for set-based queries written in SQL. */
export function createSql(options: DatabaseOptions = {}) {
	return postgres(connectionUrl(options), {
		max: options.max ?? 10,
		...(options.idleTimeout === undefined ? {} : { idle_timeout: options.idleTimeout }),
		...(options.connectTimeout === undefined ? {} : { connect_timeout: options.connectTimeout }),
		onnotice: () => {},
	});
}

export type Sql = ReturnType<typeof createSql>;

/** Creates a Drizzle client backed by a postgres.js pool. */
export function createDb(options: DatabaseOptions = {}) {
	const client = createSql(options);
	const db = drizzle({ client, schema, casing: "snake_case" });
	return Object.assign(db, { close: () => client.end() });
}

export type Database = ReturnType<typeof createDb>;
