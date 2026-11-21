import type { Database } from "@apercura/db";

/** A Drizzle transaction of the app's database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that runs queries: the pool or an open transaction. */
export type Executor = Database | Transaction;
