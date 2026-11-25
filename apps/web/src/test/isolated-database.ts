/**
 * A database of its own for an integration test file: created on the server of
 * DATABASE_URL_TEST, migrated, and dropped after the file.
 *
 * The integration files run in parallel on DATABASE_URL_TEST. A file that runs global
 * maintenance (`purge()`, `expireLapsed()`, the retention purges, the admin alerts, a rebuild
 * of the listing counts, a key rotation…) or asserts over whole tables would reach the rows of
 * the files running alongside it, and make them fail at random (issues #77, #83, #123). Such a
 * file opens its database here instead; `isolation.test.ts` fails when one does not.
 *
 * The role of DATABASE_URL_TEST must be allowed to create databases (CI uses `postgres`). The
 * roles the migrations create are shared by the whole server, so DATABASE_URL_TEST itself must
 * be migrated first (as CI does).
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url));

/** Serializes the creations across test processes (concurrent migrations race on the roles). */
const CREATE_LOCK = "apercura:test:isolated-database";

export interface IsolatedDatabase {
	/** Name of the database, unique to this run of the file. */
	readonly name: string;
	/** Creates and migrates the database; returns its URL. */
	create(): Promise<string>;
	/** Drops the database, closing whatever is still connected to it. */
	drop(): Promise<void>;
}

/**
 * `label` names the file (letters, digits and underscores). Call `create()` in `beforeAll` and
 * `drop()` last in `afterAll`.
 */
export function isolatedDatabase(
	label: string,
	baseUrl: string | undefined = process.env.DATABASE_URL_TEST,
): IsolatedDatabase {
	if (!/^[a-z][a-z0-9_]{0,30}$/.test(label)) {
		throw new Error(`Isolated database label must match [a-z][a-z0-9_]{0,30}: ${label}`);
	}
	const name = `apercura_test_${label}_${randomUUID().slice(0, 8)}`;
	const admin = () => {
		if (!baseUrl) throw new Error("DATABASE_URL_TEST is not set");
		return postgres(baseUrl, { max: 1, onnotice: () => {} });
	};
	const urlOf = () => {
		const url = new URL(baseUrl as string);
		url.pathname = `/${name}`;
		return url.toString();
	};
	return {
		name,
		async create() {
			const server = admin();
			try {
				await server`SELECT pg_advisory_lock(hashtextextended(${CREATE_LOCK}, 0))`;
				await server.unsafe(`CREATE DATABASE "${name}"`);
				const client = postgres(urlOf(), { max: 1, onnotice: () => {} });
				try {
					await migrate(drizzle({ client }), { migrationsFolder });
				} finally {
					await client.end();
				}
			} finally {
				await server.end();
			}
			return urlOf();
		},
		async drop() {
			if (!baseUrl) return;
			const server = admin();
			try {
				await server.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
			} finally {
				await server.end();
			}
		},
	};
}
