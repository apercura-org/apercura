import "server-only";
import { after } from "next/server";
import { getSessionFor } from "~/server/auth/session";
import { getDb } from "~/server/db";
import { consumeRateLimit } from "~/server/rate-limit";
import type { Context } from "./init";

export type CreateContextOptions = {
	headers: Headers;
	/** Response headers of the HTTP handler (absent for Server Component callers). */
	resHeaders?: Headers;
};

/**
 * Builds the per-request context shared by every procedure.
 * Called by the HTTP route handler and by the React Server Components caller.
 */
export async function createTRPCContext(options: CreateContextOptions): Promise<Context> {
	let session: ReturnType<Context["getSession"]> | undefined;
	return {
		headers: options.headers,
		db: getDb,
		getSession: () => {
			session ??= getSessionFor(options.headers);
			return session;
		},
		rateLimit: (key, rule) => consumeRateLimit(getDb(), key, rule),
		...(options.resHeaders ? { resHeaders: options.resHeaders } : {}),
		defer: (task) => after(task),
	};
}
